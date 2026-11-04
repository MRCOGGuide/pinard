/**
 * Finding decision aids from inside the app: which sources are searched
 * by themselves, and that a crop lands on the same part of the page
 * however the page is turned.
 *
 *   npx tsx --conditions=react-server scripts/test-aid-search.mts
 */
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { cutParts, guidelineWithAids } from "../src/lib/decision-aid-extract";

const doc = (title: string, source_reference: string, extra = {}) => ({ title, source_reference, tog_year: null, section_id: 1, ...extra });

// Guidelines are searched; articles, leaflets and summaries are left to the button.
assert.equal(guidelineWithAids(doc("Reducing the Risk of Thrombosis", "RCOG GTG No. 37a")), true);
assert.equal(guidelineWithAids(doc("Hypertension in pregnancy", "NICE guideline NG133")), true);
assert.equal(guidelineWithAids(doc("Hormone-secreting adrenal tumours", "https://doi.org/10.1111/tog.12518", { tog_year: 2018 })), false);
assert.equal(guidelineWithAids(doc("Gestational diabetes: information for you", "RCOG")), false);
assert.equal(guidelineWithAids(doc("Summary of Green-top Guideline 37a", "RCOG GTG No. 37a")), false);
assert.equal(guidelineWithAids(doc("Correction to Green-top Guideline No. 31", "RCOG GTG No. 31")), false);

// A 600 x 800 page; the box is a fraction of the page as seen, upright.
const box = [0.1, 0.2, 0.5, 0.6];
const expected: Record<number, [number, number, number, number]> = {
  0: [60, 320, 300, 640],
  90: [120, 80, 360, 400],
  180: [300, 160, 540, 480],
  270: [240, 400, 480, 720],
};
for (const [angle, [x0, y0, x1, y1]] of Object.entries(expected)) {
  const src = await PDFDocument.create();
  src.addPage([600, 800]).setRotation(degrees(Number(angle)));
  const out = await PDFDocument.load(await cutParts(src, [{ page: 1, box }], () => 0));
  const crop = out.getPage(0).getCropBox();
  assert.deepEqual([crop.x, crop.y, crop.x + crop.width, crop.y + crop.height].map(Math.round), [x0, y0, x1, y1], `angle ${angle}`);
}

// Turned upright first, the crop follows the turn.
const src = await PDFDocument.create();
src.addPage([600, 800]);
const turned = await PDFDocument.load(await cutParts(src, [{ page: 1, box }], () => 1));
assert.equal(turned.getPage(0).getRotation().angle, 90);
const crop = turned.getPage(0).getCropBox();
assert.deepEqual([crop.x, crop.y].map(Math.round), [120, 80]);

console.log("aid search: all passed");
