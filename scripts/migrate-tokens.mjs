/**
 * Rename brand colours to the roles they play.
 *
 * The brand names say what a colour IS; the roles say what it is FOR,
 * and only the second kind can take a different value in a dark theme
 * without the name becoming a lie. Porcelain cannot be near-black.
 * Surface can.
 *
 * Which prefix a name takes decides which role it maps to, because two
 * of them do two jobs:
 *
 *   theatre    text → ink-strong (headings)   bg → brand (buttons)
 *   porcelain  text → on-brand (on a fill)    bg → surface (cards)
 *
 * That split is the whole reason this is a rename rather than a change
 * of values: one variable cannot go light for a heading and stay dark
 * for the button behind it.
 *
 * Light is unaffected — every role is defined as an alias of the brand
 * colour it replaces — so a screenshot before and after should match.
 *
 *   node scripts/migrate-tokens.mjs --dry
 *   node scripts/migrate-tokens.mjs
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = "src";
const DRY = process.argv.includes("--dry");

/** Prefixes that colour text or a shape's ink. */
const INK_PREFIXES = ["text", "fill", "stroke", "placeholder", "caret", "decoration"];
/** Prefixes that colour a surface or an edge. */
const FILL_PREFIXES = ["bg", "border", "ring", "divide", "outline", "shadow", "accent", "from", "via", "to"];

/** brand name → [role when it is ink, role when it is a fill] */
const MAP = {
  theatre: ["ink-strong", "brand"],
  porcelain: ["on-brand", "surface"],
  graphite: ["ink", "ink"],
  sage: ["ink", "sunk"],
  hairline: ["line", "line"],
  greentop: ["good", "good"],
  heartbeat: ["accent", "accent"],
  amber: ["warn", "warn"],
  // Raw white only ever appears as a fill here, and is the reason the
  // raised role exists: white has no dark counterpart, a lifted
  // surface does.
  white: [null, "raised"],
};

const rules = [];
for (const [brand, [inkRole, fillRole]] of Object.entries(MAP)) {
  for (const prefix of INK_PREFIXES) {
    if (inkRole) rules.push([`${prefix}-${brand}`, `${prefix}-${inkRole}`]);
  }
  for (const prefix of FILL_PREFIXES) {
    if (fillRole) rules.push([`${prefix}-${brand}`, `${prefix}-${fillRole}`]);
  }
}
// Longest first, so "text-ink-strong" is never produced by a shorter rule.
rules.sort((a, b) => b[0].length - a[0].length);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// globals.css defines the roles in terms of the brand names, so
// rewriting it would make every role point at itself.
const KEEP = new Set([path.join("src", "app", "globals.css")]);

let changedFiles = 0;
let changedUses = 0;
const perRule = new Map();

for (const file of walk(ROOT)) {
  if (KEEP.has(file)) continue;
  const before = fs.readFileSync(file, "utf8");
  let after = before;
  for (const [from, to] of rules) {
    // A whole utility only: it may carry a variant prefix (hover:) and
    // an opacity suffix (/70), neither of which should block a match,
    // but "bg-sage" must not match inside "bg-sagebrush".
    const re = new RegExp(`(?<![\\w-])${from}(?![\\w-])`, "g");
    const hits = (after.match(re) ?? []).length;
    if (!hits) continue;
    after = after.replace(re, to);
    perRule.set(from, (perRule.get(from) ?? 0) + hits);
    changedUses += hits;
  }
  if (after !== before) {
    changedFiles++;
    if (!DRY) fs.writeFileSync(file, after);
  }
}

console.log(`${DRY ? "would change" : "changed"} ${changedUses} utilities across ${changedFiles} files\n`);
for (const [from, n] of Array.from(perRule.entries()).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${from}`);
}

// Anything left that names a colour rather than a role.
const leftover = new Map();
for (const file of walk(ROOT)) {
  if (KEEP.has(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(
    /(?<![\w-])(?:text|fill|stroke|placeholder|caret|decoration|bg|border|ring|divide|outline|shadow|accent|from|via|to)-(?:theatre|porcelain|graphite|sage|hairline|greentop|heartbeat|amber|white|black)(?:\/\d+)?(?![\w-])/g
  )) {
    leftover.set(m[0], (leftover.get(m[0]) ?? 0) + 1);
  }
}
console.log(`\nstill naming a colour: ${Array.from(leftover.values()).reduce((a, b) => a + b, 0)}`);
for (const [name, n] of Array.from(leftover.entries()).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${name}`);
}
