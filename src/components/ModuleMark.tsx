/**
 * The emblem beside each syllabus module on Practise, in the manner of
 * Today's card marks (components/CardMark, .card-mark): a tile of the
 * stage's dark green with its pool of light, a drawing in fine lines,
 * and one stroke in the heartbeat's rose (owner, 17 November 2026: "add
 * logos to them").
 *
 *   obstetrics   a pregnant woman in profile, the baby curled inside;
 *   gynaecology  the uterus, tubes and ovaries;
 *   governance   a shield with a tick: safety and standards;
 *   articles     a journal, its impact rising.
 *
 * Under the pointer the rose stroke draws itself again (.module-mark-draw);
 * still otherwise, and always under reduced motion. Decorative: the
 * heading beside it names the module.
 */
export type ModuleKind = "obstetrics" | "gynaecology" | "governance" | "articles" | "other";

const ROSE = "rgb(246 132 158)";
const MINT = "rgb(150 226 200)";

export function moduleKind(heading: string): ModuleKind {
  const h = heading.toLowerCase();
  if (h.startsWith("obstetric")) return "obstetrics";
  if (h.startsWith("gynaecolog")) return "gynaecology";
  if (h.startsWith("governance")) return "governance";
  if (h.includes("article") || h.includes("paper")) return "articles";
  return "other";
}

/**
 * The modules' order wherever they are listed: Obstetrics, Gynaecology,
 * Governance, then the high-impact papers (owner, 17 November 2026);
 * anything else after.
 */
export function moduleRank(heading: string): number {
  return { obstetrics: 0, gynaecology: 1, governance: 2, articles: 3, other: 4 }[moduleKind(heading)];
}

export function ModuleMark({ kind }: { kind: ModuleKind }) {
  return (
    <span className="card-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {kind === "obstetrics" && <Pregnant />}
        {kind === "gynaecology" && <Uterus />}
        {kind === "governance" && <Shield />}
        {(kind === "articles" || kind === "other") && <Journal />}
      </svg>
    </span>
  );
}

/* A pregnant woman in profile (owner, 17 November 2026: "make the logo
   for obstetrics a pregnant lady"), her hand on the bump, and the baby
   curled inside it in rose. */
function Pregnant() {
  return (
    <>
      <circle cx="23.4" cy="9.8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M21.4 13.6c-1.7 2.4-2.3 6.1-1.9 9.4.3 3.4-1.4 6.1-.8 9.4.5 3 .9 6 .7 9.2h3.9c.2-3 .4-5.9 1.1-8.3 6.3-.6 9.1-4.5 7.8-8.6-1.2-3.4-4.7-4.9-5.7-5.9 1-1.2.4-3-1.6-3.6-.6-.2-.8-1-.6-1.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      {/* Her arm, resting on the bump. */}
      <path d="M22.8 17.2c.5 3.3 2.2 5.9 5.5 7.3" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
      {/* The baby, curled, in rose. */}
      <path
        className="module-mark-draw"
        pathLength={1}
        d="M26.6 26.2c2.4-1.3 4.6.2 4.2 2.6-.4 2.2-3.1 3.1-4.7 1.9"
        stroke={ROSE}
        strokeWidth="1.9"
      />
    </>
  );
}

function Uterus() {
  return (
    <>
      {/* Body and cervix. */}
      <path
        d="M17.5 17.5c0-1.9 1.6-3.2 3.6-3.2h5.8c2 0 3.6 1.3 3.6 3.2v5.6c0 3.9-2.6 6.6-4.6 8.3v4.1h-3.8v-4.1c-2-1.7-4.6-4.4-4.6-8.3z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {/* Tubes and ovaries. */}
      <path d="M17.5 18.2c-3-2.2-6.4-2.1-8.4 0.4M30.5 18.2c3-2.2 6.4-2.1 8.4 0.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.6" cy="22" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="39.4" cy="22" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      {/* The cavity, in rose. */}
      <path className="module-mark-draw" pathLength={1} d="M21.2 18.2h5.6L24 24.6z" stroke={ROSE} strokeWidth="1.8" />
    </>
  );
}

function Shield() {
  return (
    <>
      <path
        d="M24 9.5l11.5 4.2v9.1c0 7.3-5 12.4-11.5 15.6-6.5-3.2-11.5-8.3-11.5-15.6v-9.1z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path className="module-mark-draw" pathLength={1} d="M18.4 24.6l4 4 7.8-8.4" stroke={ROSE} strokeWidth="2.2" />
    </>
  );
}

function Journal() {
  return (
    <>
      <rect x="12.5" y="9.5" width="23" height="29" rx="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 15.5h14M17 19.5h9.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
      <path className="module-mark-draw" pathLength={1} d="M17 32.5l4.2-4.2 3.1 2.2 6.9-7.2" stroke={ROSE} strokeWidth="2" />
      <circle cx="31.2" cy="23.3" r="1.6" fill={MINT} />
    </>
  );
}
