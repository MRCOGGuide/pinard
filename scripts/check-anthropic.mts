/**
 * Which Claude is this project talking to, and does it answer?
 *
 *   npx tsx scripts/check-anthropic.mts
 *
 * Reads .env.local as the app does, resolves the provider through the
 * same factory the app uses, then makes one real (small) call. Run it
 * after switching between the first-party API and Amazon Bedrock — the
 * failure modes are a 401, a 403 and a 404 that mean quite different
 * things, and a server action is a poor place to tell them apart.
 *
 * Prints no secrets: credentials are reported as present and by length.
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

/*
  A real environment variable wins over the file, which is what Next.js
  does too — but it is invisible, and it looks exactly like the file
  being ignored. A shell exporting ANTHROPIC_BASE_URL once sent this
  check to the first-party API while .env.local plainly said Bedrock.
*/
const shadowed: string[] = [];
for (const [k, v] of Object.entries(env)) {
  if (process.env[k] !== undefined && process.env[k] !== v) shadowed.push(k);
  process.env[k] ??= v as string;
}

const { claudeClient, claudeModel, usingBedrock, claudeConfigured } =
  await import("../src/lib/anthropic");

const bedrock = usingBedrock();
const model = claudeModel();
const credential = bedrock
  ? process.env.AWS_BEARER_TOKEN_BEDROCK
  : process.env.ANTHROPIC_API_KEY;

console.log(`provider     ${bedrock ? "Amazon Bedrock" : "Anthropic first-party"}`);
if (bedrock) console.log(`region       ${process.env.AWS_BEDROCK_REGION}`);
console.log(`model        ${model}`);
console.log(
  `credential   ${credential ? `present, ${credential.length} chars` : "MISSING"}` +
    `${claudeConfigured() ? "" : "  <-- nothing to authenticate with"}`
);

for (const k of shadowed) {
  console.log(
    `\n  ! ${k} is set in the environment and overrides .env.local.` +
      `\n    Using "${process.env[k]}", not the file's value.`
  );
}

console.log("\ncalling…");
const started = Date.now();
try {
  const response = await claudeClient({ maxRetries: 0, timeout: 30_000 }).messages.create({
    model,
    max_tokens: 16,
    messages: [{ role: "user", content: "Reply with the single word: ready" }],
  });
  const text = response.content.find((b) => b.type === "text");
  console.log(`  ok — ${Date.now() - started}ms`);
  console.log(`  reply: ${text && text.type === "text" ? text.text.trim() : "(no text block)"}`);
  console.log(`  tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);
} catch (error) {
  const e = error as { status?: number; message?: string };
  console.log(`  FAILED after ${Date.now() - started}ms`);
  console.log(`  ${e.status ? `HTTP ${e.status} — ` : ""}${e.message ?? String(error)}`);

  if (bedrock) {
    console.log(
      "\n  401  the key is wrong, or it is not a Bedrock key." +
        "\n  403  this account cannot reach that model — see below." +
        "\n  404  the model id or the region is wrong."
    );
    // Which ones would work? That is the question a 403 or 404 always
    // raises, and answering it here saves a second round of guessing.
    if (e.status === 403 || e.status === 404) {
      console.log("\n  trying other ids in this region:");
      for (const candidate of [
        "global.anthropic.claude-sonnet-4-6",
        "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
        "global.anthropic.claude-opus-4-6-v1",
      ]) {
        try {
          await claudeClient({ maxRetries: 0, timeout: 20_000 }).messages.create({
            model: candidate,
            max_tokens: 8,
            messages: [{ role: "user", content: "say ok" }],
          });
          console.log(`    works       ${candidate}`);
        } catch (inner) {
          const ie = inner as { status?: number };
          console.log(`    --          ${candidate.padEnd(45)} ${ie.status ?? "?"}`);
        }
      }
    }
  }
  process.exitCode = 1;
}
