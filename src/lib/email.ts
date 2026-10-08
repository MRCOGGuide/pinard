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
      error: "RESEND_API_KEY or RESEND_FROM is missing, add them to the environment",
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

/* The site's palette (docs/design/DIRECTION.md), written out because an
   email client reads no stylesheet. */
const COLOURS = {
  theatre: "#0F3D33",
  greentop: "#2F6D5B",
  paper: "#F7F8F5",
  surface: "#FFFFFF",
  ink: "#1C2421",
  rule: "#DDE3DF",
  quiet: "#5C6863",
  rose: "#C23A55",
};

/* Newsreader is a web font most mail clients will not load; Georgia is
   the nearest face every one of them has. */
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/**
 * The daily reminder as an email. Deliberately plain: a table-free,
 * single-column layout in the site's colours and type, because a
 * revision nudge read on a phone between cases needs to be legible,
 * not designed. The heartbeat line under the name is the site's own
 * signature, drawn as a rule rather than an image so it survives
 * clients that block images.
 */
export function reminderEmailHtml(input: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  accountUrl: string;
}): string {
  return `<div style="margin:0;padding:24px 16px;background:${COLOURS.paper};font-family:${SANS};">
  <div style="max-width:520px;margin:0 auto;background:${COLOURS.surface};border:1px solid ${COLOURS.rule};border-radius:12px;padding:28px;">
    <p style="margin:0;font-family:${SERIF};font-size:18px;font-weight:600;color:${COLOURS.theatre};">Pinard</p>
    <div style="margin:8px 0 18px;width:72px;border-top:2px solid ${COLOURS.rose};"></div>
    <h1 style="margin:0 0 12px;font-family:${SERIF};font-size:24px;line-height:1.25;color:${COLOURS.theatre};font-weight:600;">${input.heading}</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${COLOURS.ink};">${input.body}</p>
    <a href="${input.ctaUrl}" style="display:inline-block;background:${COLOURS.theatre};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;line-height:20px;padding:12px 22px;border-radius:10px;">${input.ctaLabel}</a>
    <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid ${COLOURS.rule};font-size:13px;line-height:1.6;color:${COLOURS.quiet};">
      Pinard is a revision aid, not a source of clinical advice.<br>
      <a href="${input.accountUrl}" style="color:${COLOURS.greentop};">Change when you get these, or turn them off</a>
    </p>
  </div>
</div>`;
}
