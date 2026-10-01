/**
 * A filling cystometrogram, described rather than drawn.
 *
 * Urodynamics is read, not recalled: the diagnosis is in the shape of
 * three pressure lines and where the leaks sit against the coughs. A
 * candidate who has only ever met "urodynamic stress incontinence is
 * leakage in the presence of raised abdominal pressure without a
 * detrusor contraction" as a sentence has never had to find it on a
 * trace, which is what the clinic asks of them.
 *
 * Stored as a description — capacity, where the coughs were, what the
 * detrusor did, where she leaked — and drawn by one component, for the
 * same three reasons the explanation tables are structured: it renders
 * the same everywhere, it can be checked against the passages, and
 * nobody has to paste an image into a database.
 *
 * Pves is not stored. It is Pabd + Pdet, which is what the machine
 * subtracts to get Pdet in the first place, and a figure that can
 * disagree with itself is a figure a candidate cannot trust.
 *
 * Pure functions — no I/O.
 */

export type DetrusorBehaviour =
  /** "no change in Pdet throughout filling, despite provocation" */
  | { kind: "stable" }
  /** Unprovoked phasic rises, each at a volume, in cmH2O. */
  | { kind: "phasic"; rises: { at: number; amplitude: number }[] }
  /** A steep sustained climb, as after radiotherapy. */
  | { kind: "low-compliance"; endPressure: number };

export type Cystometrogram = {
  /** What the trace is of: "Filling cystometry, 55-year-old woman". */
  caption: string;
  /** Maximum cystometric capacity, in ml. The x axis ends here. */
  capacity: number;
  /** Volumes at which a cough was annotated. */
  coughs: number[];
  /** First, normal and strong desire to void, in ml. */
  sensations?: { fd?: number; nd?: number; sd?: number };
  detrusor: DetrusorBehaviour;
  /** Where urine was seen, and what she was doing. */
  leaks?: { at: number; during: "cough" | "contraction" }[];
};

const MAX_CAPACITY = 1000;
const MIN_CAPACITY = 100;
const MAX_EVENTS = 8;

/** A figure worth drawing, or null. */
export function parseCystometrogram(value: unknown): Cystometrogram | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== undefined && raw.kind !== "cystometrogram") return null;

  const caption = typeof raw.caption === "string" ? raw.caption.trim() : "";
  const capacity = Number(raw.capacity);
  if (!caption) return null;
  if (!Number.isFinite(capacity) || capacity < MIN_CAPACITY || capacity > MAX_CAPACITY) {
    return null;
  }

  const volumes = (list: unknown): number[] =>
    Array.isArray(list)
      ? list
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 0 && n <= capacity)
          .slice(0, MAX_EVENTS)
      : [];

  const coughs = volumes(raw.coughs);

  const sensationsRaw = (raw.sensations ?? {}) as Record<string, unknown>;
  const sensation = (key: string): number | undefined => {
    const n = Number(sensationsRaw[key]);
    return Number.isFinite(n) && n >= 0 && n <= capacity ? n : undefined;
  };
  const sensations = {
    fd: sensation("fd"),
    nd: sensation("nd"),
    sd: sensation("sd"),
  };

  const detrusorRaw = (raw.detrusor ?? {}) as Record<string, unknown>;
  let detrusor: DetrusorBehaviour;
  if (detrusorRaw.kind === "phasic") {
    const rises = Array.isArray(detrusorRaw.rises)
      ? (detrusorRaw.rises as Record<string, unknown>[])
          .map((r) => ({ at: Number(r.at), amplitude: Number(r.amplitude) }))
          .filter(
            (r) =>
              Number.isFinite(r.at) &&
              r.at >= 0 &&
              r.at <= capacity &&
              Number.isFinite(r.amplitude) &&
              r.amplitude > 0 &&
              r.amplitude <= 100
          )
          .slice(0, MAX_EVENTS)
      : [];
    if (rises.length === 0) return null;
    detrusor = { kind: "phasic", rises };
  } else if (detrusorRaw.kind === "low-compliance") {
    const endPressure = Number(detrusorRaw.endPressure);
    if (!Number.isFinite(endPressure) || endPressure <= 0 || endPressure > 100) return null;
    detrusor = { kind: "low-compliance", endPressure };
  } else {
    detrusor = { kind: "stable" };
  }

  const leaks = Array.isArray(raw.leaks)
    ? (raw.leaks as Record<string, unknown>[])
        .map((l) => ({
          at: Number(l.at),
          during: l.during === "contraction" ? ("contraction" as const) : ("cough" as const),
        }))
        .filter((l) => Number.isFinite(l.at) && l.at >= 0 && l.at <= capacity)
        .slice(0, MAX_EVENTS)
    : [];

  return { caption, capacity, coughs, sensations, detrusor, leaks };
}

/**
 * The detrusor pressure at a volume, in cmH2O.
 *
 * A stable detrusor sits on its baseline whatever the provocation,
 * which is the whole point of the stress test: a cough lifts Pabd and
 * Pves together and leaves Pdet where it was.
 */
export function detrusorAt(trace: Cystometrogram, volume: number): number {
  const baseline = 5;
  if (trace.detrusor.kind === "stable") return baseline;
  if (trace.detrusor.kind === "low-compliance") {
    const fraction = Math.max(0, Math.min(1, volume / trace.capacity));
    return baseline + (trace.detrusor.endPressure - baseline) * fraction;
  }
  /* Each unprovoked rise is a bell around the volume it happened at. */
  let pressure = baseline;
  for (const rise of trace.detrusor.rises) {
    const width = trace.capacity * 0.06;
    const distance = (volume - rise.at) / width;
    pressure += rise.amplitude * Math.exp(-(distance * distance));
  }
  return pressure;
}

/** Abdominal pressure: a resting line, with a spike at each cough. */
export function abdominalAt(trace: Cystometrogram, volume: number): number {
  const baseline = 20;
  let pressure = baseline;
  for (const cough of trace.coughs) {
    const width = trace.capacity * 0.012;
    const distance = (volume - cough) / width;
    pressure += 60 * Math.exp(-(distance * distance));
  }
  return pressure;
}

/** Vesical pressure is what the two other channels add up to. */
export function vesicalAt(trace: Cystometrogram, volume: number): number {
  return abdominalAt(trace, volume) + detrusorAt(trace, volume);
}

/** Points along one channel, for drawing. */
export function series(
  trace: Cystometrogram,
  channel: "pves" | "pabd" | "pdet",
  steps = 240
): { volume: number; pressure: number }[] {
  const at =
    channel === "pves" ? vesicalAt : channel === "pabd" ? abdominalAt : detrusorAt;
  const out: { volume: number; pressure: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const volume = (trace.capacity * i) / steps;
    out.push({ volume, pressure: at(trace, volume) });
  }
  return out;
}

/**
 * What the trace says, in words, for a screen reader and for anyone
 * who cannot see the figure.
 */
export function describe(trace: Cystometrogram): string {
  const parts: string[] = [
    `Filling cystometry to a maximum cystometric capacity of ${Math.round(trace.capacity)} ml.`,
  ];
  if (trace.coughs.length) {
    parts.push(
      `Coughs at ${trace.coughs.map((c) => `${Math.round(c)} ml`).join(", ")}, each raising abdominal and vesical pressure together.`
    );
  }
  if (trace.detrusor.kind === "stable") {
    parts.push("Detrusor pressure is unchanged throughout filling.");
  } else if (trace.detrusor.kind === "phasic") {
    parts.push(
      `Unprovoked rises in detrusor pressure at ${trace.detrusor.rises
        .map((r) => `${Math.round(r.at)} ml`)
        .join(", ")}.`
    );
  } else {
    parts.push(
      `Detrusor pressure climbs steadily through filling to about ${Math.round(trace.detrusor.endPressure)} cmH2O.`
    );
  }
  for (const leak of trace.leaks ?? []) {
    parts.push(
      `Leakage at ${Math.round(leak.at)} ml, during a ${leak.during === "cough" ? "cough" : "detrusor contraction"}.`
    );
  }
  return parts.join(" ");
}
