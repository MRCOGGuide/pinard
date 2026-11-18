import "server-only";
import { emailIsConfigured, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";

/**
 * The confirmation of an Ask Pinard top-up, sent when the questions are
 * granted (pre-launch review, 18 November 2026: consumer law asks for the
 * purchase, and the consent to have it at once, to be confirmed on a
 * durable medium; the checkbox alone was not one). Plain words: what was
 * bought, what it cost, how long it lasts, and what the candidate agreed.
 */
export async function sendTopUpConfirmation(
  to: string,
  questions: number,
  amountMinor: number | null,
  currency: string | null,
  expiresAt: string | null
): Promise<void> {
  if (!emailIsConfigured()) return;
  const paid =
    amountMinor !== null && currency
      ? new Intl.NumberFormat("en-IE", { style: "currency", currency: currency.toUpperCase() }).format(amountMinor / 100)
      : null;
  const until = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  const url = siteUrl();
  const paragraphs = [
    `Thank you. ${questions} extra Ask Pinard questions have been added to your account${paid ? `, for ${paid}` : ""}.`,
    until
      ? `They last until ${until}, the end of the period your subscription has paid for, and move on with it when it renews.`
      : "They last as long as your subscription.",
    "When you bought them you asked to have them straight away, and accepted that you lose your right to withdraw from this purchase once you use one of them. Until you use one, you can still withdraw for a full refund within 14 days, from your Account page.",
    `Your account: ${url}/account\nRefund policy: ${url}/refunds`,
    "Pinard is a revision aid for the MRCOG examinations, independent of the Royal College of Obstetricians and Gynaecologists.",
  ];
  const text = paragraphs.join("\n\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1C2421;max-width:520px">${paragraphs
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  await sendEmail({ to, subject: `Your ${questions} extra Ask Pinard questions`, text, html });
}
