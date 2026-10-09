/**
 * What the legal pages and the admin screen share: the trader details
 * the owner fills in, and the list of pages. No server imports, so the
 * admin form (a client component) can use it too.
 */

export type LegalFieldKey =
  | "legal_name"
  | "legal_trading_name"
  | "legal_address"
  | "legal_email"
  | "legal_country"
  | "legal_company_number"
  | "legal_vat_number";

export type LegalField = {
  key: LegalFieldKey;
  /** How the pages refer to it: {{name}} in a page's text. */
  token: string;
  label: string;
  hint: string;
  /** Printed as a marked gap until filled; optional ones print nothing. */
  required: boolean;
  multiline?: boolean;
  fallback?: string;
};

export const LEGAL_FIELDS: LegalField[] = [
  {
    key: "legal_name",
    token: "legal_name",
    label: "Legal name",
    hint: "As a sole trader, your own full name. As a company, its registered name.",
    required: true,
  },
  {
    key: "legal_trading_name",
    token: "trading_name",
    label: "Trading name",
    hint: "The name customers know. Registered with CRO as a business name if it differs from your own.",
    required: true,
    fallback: "Pinard",
  },
  {
    key: "legal_address",
    token: "address",
    label: "Postal address",
    hint: "A geographic address where you can receive post. Consumer law requires one; a PO box is not enough.",
    required: true,
    multiline: true,
  },
  {
    key: "legal_email",
    token: "email",
    label: "Contact email",
    hint: "Read regularly: refund, withdrawal and privacy requests arrive here, and some have legal deadlines.",
    required: true,
    fallback: "support@pinardapp.com",
  },
  {
    key: "legal_country",
    token: "country",
    label: "Country of establishment",
    hint: "Decides the governing law and the lead data protection authority.",
    required: true,
    fallback: "Ireland",
  },
  {
    key: "legal_company_number",
    token: "company_number",
    label: "Company number (optional)",
    hint: "Only once a company is registered with the CRO. Leave empty as a sole trader.",
    required: false,
  },
  {
    key: "legal_vat_number",
    token: "vat_number",
    label: "VAT number (optional)",
    hint: "Only once registered for VAT, in Ireland or under the EU One-Stop Shop.",
    required: false,
  },
];

export type LegalDetails = Record<LegalFieldKey, string>;

export type LegalDocKey = "terms" | "privacy" | "refunds" | "cookies" | "accessibility";

export const LEGAL_DOCS: { key: LegalDocKey; title: string; href: string }[] = [
  { key: "terms", title: "Terms & Conditions", href: "/terms" },
  { key: "privacy", title: "Privacy Policy", href: "/privacy" },
  { key: "refunds", title: "Refunds, Cancellation & Withdrawal", href: "/refunds" },
  { key: "cookies", title: "Cookie Policy", href: "/cookies" },
  { key: "accessibility", title: "Accessibility Statement", href: "/accessibility" },
];

/** What {{token}} means in a page, from the details and a few figures the
 *  code owns. A required detail left empty is absent from the map, and
 *  the page shows a marked gap where it goes. */
export function legalValues(details: LegalDetails, extra: Record<string, string> = {}): Record<string, string> {
  const values: Record<string, string> = { ...extra };
  for (const field of LEGAL_FIELDS) {
    const value = details[field.key]?.trim();
    if (value) values[field.token] = value;
    else if (!field.required) values[field.token] = "";
  }
  const registration = [
    details.legal_company_number?.trim() && `Company number ${details.legal_company_number.trim()}.`,
    details.legal_vat_number?.trim() && `VAT number ${details.legal_vat_number.trim()}.`,
  ]
    .filter(Boolean)
    .join(" ");
  values.registration = registration;
  return values;
}

/** The gap printed for a detail not filled in yet. */
export function placeholderLabel(token: string): string {
  const field = LEGAL_FIELDS.find((f) => f.token === token);
  return `[${field ? field.label.replace(/ \(optional\)$/, "").toLowerCase() : token} to be added]`;
}
