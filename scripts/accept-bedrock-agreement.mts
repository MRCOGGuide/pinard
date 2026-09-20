/**
 * Accept the Anthropic model agreement on Amazon Bedrock.
 *
 *   npx tsx scripts/accept-bedrock-agreement.mts              # show only
 *   npx tsx scripts/accept-bedrock-agreement.mts --accept     # accept
 *
 * Bedrock's model access page has been retired: a serverless model is
 * meant to enable itself the first time it is invoked from the console.
 * Where that has not happened, the account is left with the use case
 * form submitted, an agreement offer outstanding, and every API call
 * returning 404 "use case details have not been submitted" — which is
 * misleading, because they have been.
 *
 * This accepts that outstanding offer. It is a legal acceptance on
 * behalf of the AWS account, so it does nothing without --accept, and
 * it prints what is being accepted first. The equivalent by hand is:
 *
 *   aws bedrock create-foundation-model-agreement \
 *     --region <region> --model-id <id> --offer-token <token>
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

const region = env.AWS_BEDROCK_REGION ?? process.env.AWS_BEDROCK_REGION;
const token = env.AWS_BEARER_TOKEN_BEDROCK ?? process.env.AWS_BEARER_TOKEN_BEDROCK;
if (!region || !token) {
  console.log("AWS_BEDROCK_REGION and AWS_BEARER_TOKEN_BEDROCK must be set in .env.local");
  process.exit(1);
}

const accept = process.argv.includes("--accept");

/** The models this project might call, base ids without a routing prefix. */
const MODELS = process.argv.filter((a) => a.startsWith("anthropic.")).length
  ? process.argv.filter((a) => a.startsWith("anthropic."))
  : [
      "anthropic.claude-sonnet-4-6",
      "anthropic.claude-haiku-4-5-20251001-v1:0",
    ];

const auth = { Authorization: `Bearer ${token}` };
const base = `https://bedrock.${region}.amazonaws.com`;

for (const modelId of MODELS) {
  const status = await fetch(
    `${base}/foundation-model-availability/${encodeURIComponent(modelId)}`,
    { headers: auth }
  ).then((r) => r.json() as Promise<Record<string, { status?: string } | string>>);
  const agreement =
    (status.agreementAvailability as { status?: string } | undefined)?.status ?? "?";

  if (agreement === "AVAILABLE") {
    console.log(`${modelId}\n   agreement already accepted — nothing to do`);
    continue;
  }

  const offers = await fetch(
    `${base}/list-foundation-model-agreement-offers/${encodeURIComponent(modelId)}`,
    { headers: auth }
  );
  if (!offers.ok) {
    console.log(`${modelId}\n   could not list offers: ${offers.status}`);
    continue;
  }
  const offer = ((await offers.json()) as { offers?: { offerId: string; offerToken: string }[] })
    .offers?.[0];
  if (!offer) {
    console.log(`${modelId}\n   no offer outstanding, yet the agreement is ${agreement}`);
    continue;
  }

  console.log(`${modelId}`);
  console.log(`   agreement   ${agreement}`);
  console.log(`   offer       ${offer.offerId}`);

  if (!accept) {
    console.log("   (run again with --accept to accept this agreement)");
    continue;
  }

  const created = await fetch(`${base}/create-foundation-model-agreement`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ modelId, offerToken: offer.offerToken }),
  });
  const body = await created.text();
  console.log(
    created.ok
      ? `   ACCEPTED — ${body.slice(0, 120)}`
      : `   failed ${created.status} — ${body.slice(0, 200)}`
  );
}

if (!accept) {
  console.log(
    "\nNothing was accepted. This signs an agreement for your AWS account," +
      "\nso it is deliberately not the default. Re-run with --accept."
  );
} else {
  console.log("\nAllow a few minutes, then: npx tsx scripts/check-anthropic.mts");
}
