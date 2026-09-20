import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";

/**
 * One place that decides which Claude this project is talking to.
 *
 * Two providers serve the same Messages API: Anthropic's own, and
 * Amazon Bedrock. They differ in three ways that callers should not
 * have to know about — the client class, the credential, and the model
 * id, which on Bedrock carries a routing prefix (`global.anthropic.…`)
 * that the first-party API rejects outright.
 *
 * Bedrock is used when AWS_BEDROCK_REGION is set. Nothing else changes:
 * both clients expose the same `messages.create`, so every call site
 * reads the same either way, and switching back is unsetting one
 * variable.
 *
 * Note this is the `bedrock-runtime` path, not the newer
 * `bedrock-mantle` one. Mantle is a separate Bedrock offering that an
 * account is enrolled in separately; where it is not, every model there
 * answers "not available for this account" while these same models
 * answer normally.
 */

/** Bedrock when a region is named, the first-party API otherwise. */
export function usingBedrock(): boolean {
  return Boolean(process.env.AWS_BEDROCK_REGION);
}

/**
 * The model id, already correct for whichever provider is in use.
 *
 * Bedrock ids name a routing prefix as well as the model: `global.`
 * routes wherever there is capacity and carries no premium, while a
 * regional prefix such as `eu.` guarantees the region and costs ten per
 * cent more. Set ANTHROPIC_MODEL to override the whole id.
 */
export function claudeModel(): string {
  const configured = process.env.ANTHROPIC_MODEL;
  if (configured) return configured;
  return usingBedrock()
    ? "global.anthropic.claude-sonnet-4-6"
    : "claude-sonnet-4-6";
}

type ClientOptions = {
  /** Defaults to the SDK's 2. Zero where a caller must fail fast. */
  maxRetries?: number;
  /** Milliseconds. The SDK default is ten minutes, which is far longer
   *  than any request this app makes is allowed to live. */
  timeout?: number;
};

/**
 * A Claude client for the configured provider.
 *
 * Typed as the first-party client because the two are interchangeable
 * for everything this project calls — `messages.create`, with the same
 * request and response shapes. The Bedrock client is not a subclass, so
 * the cast is what lets one call site serve both.
 */
export function claudeClient(options: ClientOptions = {}): Anthropic {
  if (usingBedrock()) {
    return new AnthropicBedrock({
      awsRegion: process.env.AWS_BEDROCK_REGION,
      // The SDK also reads AWS_BEARER_TOKEN_BEDROCK itself, and falls
      // back to the standard AWS credential chain when no token is set.
      ...(process.env.AWS_BEARER_TOKEN_BEDROCK
        ? { apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK }
        : {}),
      ...options,
    }) as unknown as Anthropic;
  }
  return new Anthropic(options);
}

/** Whether a call can be made at all, for callers that degrade quietly
 *  rather than throw when no provider is configured. */
export function claudeConfigured(): boolean {
  return usingBedrock()
    ? Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.AWS_ACCESS_KEY_ID)
    : Boolean(process.env.ANTHROPIC_API_KEY);
}
