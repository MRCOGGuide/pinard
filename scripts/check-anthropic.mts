/**
 * Which Claude endpoint is this project actually talking to, and does it
 * answer?
 *
 *   npx tsx scripts/check-anthropic.mts
 *
 * Reads .env.local exactly as the app does, reports the resolved
 * provider, model and region, then makes one real (small) call. Run it
 * after switching between the first-party API and Amazon Bedrock — the
 * switch is three environment variables, and the failure mode of
 * getting one wrong is a 404 or a 403 from inside a server action,
 * which is a poor place to discover it.
 *
 * Prints no secrets: keys are reported as present/absent and by length.
 */

import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { default: Anthropic } = await import("@anthropic-ai/sdk");

const baseURL = process.env.ANTHROPIC_BASE_URL ?? "";
const key = process.env.ANTHROPIC_API_KEY ?? "";
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const bedrock = /bedrock-mantle\..*\.api\.aws/.test(baseURL);
const region = bedrock ? baseURL.match(/bedrock-mantle\.([^.]+)\./)?.[1] : null;

console.log(`provider        ${bedrock ? "Amazon Bedrock" : "Anthropic first-party"}`);
console.log(`base URL        ${baseURL || "(default) https://api.anthropic.com"}`);
if (bedrock) console.log(`region          ${region ?? "(could not parse)"}`);
console.log(`model           ${model}`);
console.log(`api key         ${key ? `present, ${key.length} chars` : "MISSING"}`);

// The two halves have to agree: a Bedrock endpoint wants the provider
// prefix on the model id, and the first-party one rejects it.
const prefixed = model.startsWith("anthropic.") || /^(global|us|eu|jp|apac|au)\./.test(model);
if (bedrock && !prefixed) {
  console.log(
    `\n  ! On Bedrock the model id needs its provider prefix — "anthropic.${model}"`
  );
} else if (!bedrock && prefixed) {
  console.log(
    `\n  ! That is a Bedrock model id; the first-party API wants "${model.replace(/^[^.]+\./, "")}"`
  );
}

console.log("\ncalling…");
const started = Date.now();
try {
  const client = new Anthropic({ maxRetries: 0, timeout: 30_000 });
  const response = await client.messages.create({
    model,
    max_tokens: 16,
    messages: [{ role: "user", content: "Reply with the single word: ready" }],
  });
  const text = response.content.find((b) => b.type === "text");
  console.log(`  ok — ${Date.now() - started}ms`);
  console.log(`  reply: ${text && text.type === "text" ? text.text.trim() : "(no text block)"}`);
  console.log(
    `  tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`
  );
  console.log(`  model returned: ${response.model}`);
} catch (error) {
  const e = error as { status?: number; message?: string };
  console.log(`  FAILED after ${Date.now() - started}ms`);
  console.log(`  ${e.status ? `HTTP ${e.status} — ` : ""}${e.message ?? String(error)}`);
  console.log(
    "\n  403 on Bedrock usually means model access is not enabled for this" +
      "\n  model in that region (AWS console -> Bedrock -> Model access)." +
      "\n  404 usually means the model id or the region in the base URL is wrong."
  );
  process.exitCode = 1;
}
