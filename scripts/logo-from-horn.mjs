/**
 * The mark, drawn from the horn.
 *
 *   node scripts/logo-from-horn.mjs
 *
 * The landing page draws the Pinard horn live, as one outline spun about
 * an axis (src/components/landing/horn-gl.ts). The logo used to be a
 * separate drawing with its own, squatter proportions. This prints the
 * logo's paths from the same outline, so the mark and the object are the
 * same shape, and it is kept so the mark can be drawn again if the
 * outline changes: paste what it prints into src/components/Logo.tsx.
 *
 * The horn stands upright and is seen from a little below, so its bell
 * opens toward the reader, as it does on the landing page: the bell's
 * rim and bore at the foot, the underside of the ear plate at the top
 * with the near edge of the plate above it.
 */

/* The same figures as horn-gl.ts. */
const LENGTH = 2.74;
const Y_BELL = -LENGTH / 2;
const BELL = 0.64;
const NECK = 0.15;
const EAR = 0.5;
const Y_NECK = 0.94;
const Y_PLATE = 1.2;
const EDGE = 0.045;
const Y_TOP = Y_PLATE + 2 * EDGE;

function flare(y) {
  const t = Math.max(0, Math.min(1, (y - Y_BELL) / (Y_NECK - Y_BELL)));
  const u = 1 - t;
  return NECK + (BELL - NECK) * (0.7 * Math.pow(u, 2.3) + 0.3 * Math.pow(u, 8));
}

/* The stem opening into the underside of the plate, as in horn-gl. */
function fillet(t) {
  const a = { r: NECK, y: Y_NECK };
  const b = { r: EAR - EDGE, y: Y_PLATE };
  const c1 = { r: NECK, y: Y_NECK + 0.19 };
  const c2 = { r: b.r - 0.27, y: Y_PLATE - 0.012 };
  const k = 1 - t;
  return {
    r: k * k * k * a.r + 3 * k * k * t * c1.r + 3 * k * t * t * c2.r + t * t * t * b.r,
    y: k * k * k * a.y + 3 * k * k * t * c1.y + 3 * k * t * t * c2.y + t * t * t * b.y,
  };
}

/* Onto the page: 27 units to one of the horn's, seen from 20 degrees
   below, centred on x = 70 with the bell's rim ending at y = 116.

   WIDEN is the one liberty taken with the object. A Pinard is slim, and
   at the 36 pixels the mark has in the top bar its true neck is two
   pixels wide and the horn reads as a pin under its own arcs. Every
   radius is drawn a sixth wider, the same correction a typeface makes
   to its thin strokes at small sizes; lengths are untouched, so it is
   still the same horn, standing a little stockier. */
const S = 27;
const WIDEN = 1.16;
const TILT = (20 * Math.PI) / 180;
const CX = 70;
const squash = Math.sin(TILT);
const Y0 = 116 - BELL * WIDEN * S * squash + Y_BELL * Math.cos(TILT) * S;
const X = (r) => r * S * WIDEN;
const Y = (y) => Y0 - y * Math.cos(TILT) * S;
const f = (n) => n.toFixed(2).replace(/\.?0+$/, "");

/* The outside of the cone, bell to neck, then a little way into the
   plate so the body covers the join. */
const profile = [];
for (let i = 0; i <= 26; i++) {
  const y = Y_BELL + ((Y_NECK - Y_BELL) * Math.pow(i / 26, 1.35));
  profile.push({ r: flare(y), y });
}
for (let i = 1; i <= 6; i++) profile.push(fillet((i / 6) * 0.82));

function side(share, sign) {
  return profile.map((p) => `${f(CX + sign * X(p.r) * share)} ${f(Y(p.y))}`);
}

const left = side(1, -1);
const right = side(1, 1).reverse();
const bellY = Y(Y_BELL);
const body =
  `M${left[0]} L${left.slice(1).join(" ")} L${right.join(" ")} ` +
  `A${f(X(BELL))} ${f(X(BELL) * squash)} 0 0 1 ${left[0]} Z`;

/* The light down the near side, and the rose light on the far edge. */
const band = (from, to, sign) => {
  const a = side(from, sign);
  const b = side(to, sign).reverse();
  return `M${a[0]} L${a.slice(1).join(" ")} L${b.join(" ")} Z`;
};

const plateUnder = { cy: Y(Y_PLATE), rx: X(EAR), ry: X(EAR) * squash };
const plateTop = { cy: Y(Y_TOP), rx: X(EAR), ry: X(EAR) * squash };
const plateEdge =
  `M${f(CX - plateTop.rx)} ${f(plateTop.cy)} A${f(plateTop.rx)} ${f(plateTop.ry)} 0 0 1 ${f(CX + plateTop.rx)} ${f(plateTop.cy)} ` +
  `L${f(CX + plateUnder.rx)} ${f(plateUnder.cy)} A${f(plateUnder.rx)} ${f(plateUnder.ry)} 0 0 0 ${f(CX - plateUnder.rx)} ${f(plateUnder.cy)} Z`;

/* The listening arcs, about the same centre line, each a chord seven
   tenths of its radius either side, stepping up and out from the plate. */
const arc = (r, y) => {
  const half = r * 0.7;
  return `M${f(CX - half)} ${f(y)} A${r} ${r} 0 0 1 ${f(CX + half)} ${f(y)}`;
};
const lowest = plateTop.cy - plateTop.ry - 6.5;
const arcs = [arc(15, lowest), arc(23, lowest - 8), arc(31, lowest - 16)];

console.log(
  JSON.stringify(
    {
      arcs,
      arcWidth: 3,
      body,
      light: band(0.86, 0.5, -1),
      rose: band(0.82, 1, 1),
      bell: { cx: CX, cy: +f(bellY), rx: +f(X(BELL)), ry: +f(X(BELL) * squash) },
      bore: { cx: CX, cy: +f(bellY + 0.25), rx: +f(X(BELL) * 0.86), ry: +f(X(BELL) * squash * 0.8) },
      plateUnder: { cx: CX, cy: +f(plateUnder.cy), rx: +f(plateUnder.rx), ry: +f(plateUnder.ry) },
      plateEdge,
      top: +f(plateTop.cy - plateTop.ry),
    },
    null,
    1
  )
);
