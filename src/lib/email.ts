/**
 * Transactional email through Resend (server only).
 *
 * Called directly over its REST API rather than through the SDK: one
 * endpoint, one shape, and nothing to keep in step at upgrade time —
 * the same way lib/voyage.ts talks to Voyage.
 */

const RESEND_URL = "https://api.resend.com/emails";

export type EmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Configured only when both the key and a verified sender are set. */
export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return {
      ok: false,
      error: "RESEND_API_KEY or RESEND_FROM is missing — add them to the environment",
    };
  }

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Resend returned ${response.status}: ${detail.slice(0, 300)}`,
      };
    }

    const body = (await response.json()) as { id?: string };
    return { ok: true, id: body.id ?? "" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const COLOURS = {
  theatre: "#0F3D33",
  greentop: "#2F6D5B",
  sage: "#EDF3EE",
  porcelain: "#FDFDFB",
  graphite: "#232A27",
  hairline: "#DCE5DF",
};

/**
 * The daily reminder as an email. Deliberately plain: a table-free,
 * single-column layout in the brand colours, because a revision nudge
 * read on a phone between cases needs to be legible, not designed.
 */
export function reminderEmailHtml(input: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  accountUrl: string;
}): string {
  return `<div style="margin:0;padding:24px 16px;background:${COLOURS.sage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:${COLOURS.porcelain};border:1px solid ${COLOURS.hairline};border-radius:12px;padding:28px;">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:${COLOURS.greentop};">Pinard</p>
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:${COLOURS.theatre};font-weight:600;">${input.heading}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${COLOURS.graphite};">${input.body}</p>
    <a href="${input.ctaUrl}" style="display:inline-block;background:${COLOURS.theatre};color:${COLOURS.porcelain};text-decoration:none;font-size:14px;font-weight:500;padding:11px 22px;border-radius:12px;">${input.ctaLabel}</a>
    <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid ${COLOURS.hairline};font-size:12px;line-height:1.6;color:#6b7671;">
      Pinard is a revision aid, not a source of clinical advice.<br>
      <a href="${input.accountUrl}" style="color:${COLOURS.greentop};">Change when you get these, or turn them off</a>
    </p>
  </div>
</div>`;
}
