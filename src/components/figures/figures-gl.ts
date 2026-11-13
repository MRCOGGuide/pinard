import { STUDIO } from "@/components/landing/horn-gl";

/**
 * Four small machined objects, one for each figure on Today, drawn live.
 *
 * Asked for by the owner on 13 November 2026: the four figures "with 3D
 * logos similar to landing page". They are made the way the horn is: an
 * outline turned on a lathe, in the same anodised aluminium, lit in the
 * same studio (STUDIO, from the horn). Each one shows its figure rather
 * than decorating it:
 *
 *   Days to go    an hourglass, plates, bulbs and three pillars;
 *   Readiness     a ring that fills to the share, with a jewel at 70%;
 *   Questions     discs threaded on a spindle, as many as the share;
 *   Topics done   a dial of one segment per topic, the finished ones
 *                 raised and coloured.
 *
 * The figure's band (green, amber, rose) is the colour the metal is
 * anodised, so the object and the number agree.
 *
 * Everything is in one buffer and drawn into one canvas over the whole
 * card: one graphics context for the four, not four.
 */

type Pt = { r: number; y: number; open?: number; polish?: number };

/** A piece of the buffer: where its triangles start and how many. */
export type Piece = { first: number; count: number };

const FLOATS = 10;

export class Builder {
  data: number[] = [];
  index: number[] = [];

  private get vertices() {
    return this.data.length / FLOATS;
  }

  begin() {
    return this.index.length;
  }

  end(first: number): Piece {
    return { first, count: this.index.length - first };
  }

  /**
   * Spin an outline about an upright axis through (cx, cz), from angle
   * a0 through `span`. The surface faces to the right of the way the
   * outline travels, so an outline is walked up the outside and in
   * across the top. `t` runs from 0 at a0 as a share of a whole turn.
   */
  lathe(
    pts: Pt[],
    {
      loop = false,
      steps = 48,
      a0 = 0,
      span = Math.PI * 2,
      cx = 0,
      cz = 0,
      part = 0,
    }: { loop?: boolean; steps?: number; a0?: number; span?: number; cx?: number; cz?: number; part?: number }
  ) {
    const n = pts.length;
    const base = this.vertices;
    const cols = steps + 1;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const before = pts[loop ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const after = pts[loop ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let nr = after.y - before.y;
      let ny = -(after.r - before.r);
      const len = Math.hypot(nr, ny) || 1;
      nr /= len;
      ny /= len;
      for (let j = 0; j < cols; j++) {
        const f = j / steps;
        const th = a0 + span * f;
        const c = Math.cos(th);
        const s = Math.sin(th);
        this.data.push(
          cx + p.r * c, p.y, cz + p.r * s,
          nr * c, ny, nr * s,
          p.open ?? 1, p.polish ?? 0, (span * f) / (Math.PI * 2), part
        );
      }
    }
    const rows = loop ? n : n - 1;
    for (let i = 0; i < rows; i++) {
      const i2 = (i + 1) % n;
      for (let j = 0; j < steps; j++) {
        const a = base + i * cols + j;
        const b = base + i2 * cols + j;
        const c = base + i2 * cols + j + 1;
        const d = base + i * cols + j + 1;
        this.index.push(a, b, c, a, c, d);
      }
    }
  }

  /** Close the cut end of a part-turned outline at angle `th`, facing
   *  on round the turn (+1) or back along it (-1). */
  cap(pts: Pt[], th: number, facing: 1 | -1, part: number, t: number) {
    const c = Math.cos(th);
    const s = Math.sin(th);
    const nx = -s * facing;
    const nz = c * facing;
    let mr = 0;
    let my = 0;
    for (const p of pts) {
      mr += p.r;
      my += p.y;
    }
    mr /= pts.length;
    my /= pts.length;
    const base = this.vertices;
    this.data.push(mr * c, my, mr * s, nx, 0, nz, 1, 0, t, part);
    for (const p of pts) this.data.push(p.r * c, p.y, p.r * s, nx, 0, nz, p.open ?? 1, p.polish ?? 0, t, part);
    for (let i = 0; i < pts.length; i++) {
      this.index.push(base, base + 1 + i, base + 1 + ((i + 1) % pts.length));
    }
  }
}

/** A quarter round from angle a (radians), centred at (cr, cy): the
 *  machined edge, cut bright at its crown. */
function round(pts: Pt[], cr: number, cy: number, radius: number, a: number, polish: number, k = 5) {
  for (let i = 0; i <= k; i++) {
    const t = a + (Math.PI / 2) * (i / k);
    pts.push({ r: cr + radius * Math.cos(t), y: cy + radius * Math.sin(t), polish: polish * (0.35 + 0.65 * Math.sin((Math.PI * i) / k)) });
  }
}

/** A straight run, with points just inside each end so the flat face is
 *  flat to its edges. */
function run(pts: Pt[], from: [number, number], to: [number, number], polish = 0) {
  for (const f of [0.06, 0.5, 0.94]) {
    pts.push({ r: from[0] + (to[0] - from[0]) * f, y: from[1] + (to[1] - from[1]) * f, polish });
  }
}

/** The section of a ring, round-cornered, walked so it faces outward. */
function section(r0: number, r1: number, y0: number, y1: number, c: number, polish = 1): Pt[] {
  const pts: Pt[] = [];
  round(pts, r1 - c, y0 + c, c, -Math.PI / 2, polish);
  run(pts, [r1, y0 + c], [r1, y1 - c]);
  round(pts, r1 - c, y1 - c, c, 0, polish);
  run(pts, [r1 - c, y1], [r0 + c, y1]);
  round(pts, r0 + c, y1 - c, c, Math.PI / 2, polish);
  run(pts, [r0, y1 - c], [r0, y0 + c]);
  round(pts, r0 + c, y0 + c, c, Math.PI, polish);
  run(pts, [r0 + c, y0], [r1 - c, y0]);
  return pts;
}

/** A ball of radius 1, pole to pole. */
function ball(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 14;
    pts.push({ r: Math.cos(a), y: Math.sin(a), polish: 0.8 });
  }
  pts[0].r = 0;
  pts[pts.length - 1].r = 0;
  return pts;
}

/** A rod of radius r from y0 to y1, round at the top. */
function rod(r: number, y0: number, y1: number, polish: number): Pt[] {
  const pts: Pt[] = [{ r: 0, y: y0, polish }, { r, y: y0, polish }];
  run(pts, [r, y0], [r, y1 - r], polish);
  for (let i = 0; i <= 5; i++) {
    const a = (Math.PI / 2) * (i / 5);
    pts.push({ r: r * Math.cos(a), y: y1 - r + r * Math.sin(a), polish });
  }
  pts[pts.length - 1].r = 0;
  return pts;
}

/* ---- Days to go: the hourglass ------------------------------------- */

const G_PLATE = 0.64;
const G_THICK = 0.13;
const G_Y0 = -1.0;
const G_PILLAR = 0.555;

function hourglass(): Pt[] {
  const lower: Pt[] = [];
  const c = 0.045;
  // The underside of the plate, from the axis out, round its edge, and
  // in across its top to the foot of the bulb.
  lower.push({ r: 0, y: G_Y0 }, { r: 0.3, y: G_Y0 }, { r: G_PLATE - c - 0.02, y: G_Y0 });
  round(lower, G_PLATE - c, G_Y0 + c, c, -Math.PI / 2, 1);
  round(lower, G_PLATE - c, G_Y0 + G_THICK - c, c, 0, 1);
  lower.push({ r: G_PLATE - c - 0.03, y: G_Y0 + G_THICK }, { r: 0.52, y: G_Y0 + G_THICK });
  // The bulb, up to the waist: full, then drawn in quickly to the neck.
  const yFoot = G_Y0 + G_THICK;
  for (let i = 1; i <= 30; i++) {
    const u = i / 30;
    const y = yFoot + (0 - yFoot) * u;
    const r = 0.065 + 0.425 * Math.pow(Math.max(0, 1 - Math.pow(u, 2.3)), 0.55);
    lower.push({ r, y, polish: 0.6 });
  }
  // The top half is the bottom half turned over.
  const upper = lower
    .slice(0, -1)
    .reverse()
    .map((p) => ({ ...p, y: -p.y }));
  return [...lower, ...upper];
}

/* ---- Readiness: the ring ------------------------------------------- */

export const RING = 0.74;
const TRACK = 0.07;
export const FILL = 0.1;

function torus(tube: number, radius = RING): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 18;
    pts.push({ r: radius + tube * Math.cos(a), y: tube * Math.sin(a), polish: 0.15 + 0.2 * Math.max(0, Math.sin(a)) });
  }
  return pts;
}

/* ---- Questions: discs on a spindle --------------------------------- */

export const DISCS = 8;
export const DISC_PITCH = 0.15;
export const DISC_FOOT = 0.075;
const DISC_H = 0.115;
export const STACK_TOP = DISC_FOOT + DISCS * DISC_PITCH + 0.07;

function stand(): Pt[] {
  const pts: Pt[] = [{ r: 0, y: 0 }, { r: 0.3, y: 0 }];
  round(pts, 0.63, 0.03, 0.03, -Math.PI / 2, 1);
  round(pts, 0.63, DISC_FOOT - 0.03, 0.03, 0, 1);
  pts.push({ r: 0.4, y: DISC_FOOT - 0.002 }, { r: 0, y: DISC_FOOT });
  return pts;
}

/* ---- Topics done: the dial ----------------------------------------- */

const DIAL_IN = 0.42;
const DIAL_OUT = 0.82;
export const DIAL_LIFT = 0.08;
const GAP = 0.032;

function dialBase(): Pt[] {
  const pts: Pt[] = [{ r: 0, y: -0.07 }, { r: 0.4, y: -0.07 }];
  round(pts, 0.84, -0.045, 0.025, -Math.PI / 2, 0.8);
  round(pts, 0.84, -0.025, 0.025, 0, 0.8);
  pts.push({ r: 0.6, y: 0 }, { r: 0, y: 0 });
  return pts;
}

function hub(): Pt[] {
  const pts: Pt[] = [{ r: 0, y: 0 }, { r: 0.2, y: 0 }];
  round(pts, 0.27, 0.02, 0.02, -Math.PI / 2, 1);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push({ r: 0.29 * (1 - t), y: 0.04 + 0.08 * Math.sin((Math.PI / 2) * t), polish: 0.7 });
  }
  pts[pts.length - 1].r = 0;
  return pts;
}

/* -------------------------------------------------------------------- */

export type Pieces = {
  glass: Piece;
  track: Piece;
  fill: Piece;
  ball: Piece;
  stand: Piece;
  spindle: Piece;
  disc: Piece;
  dialBase: Piece;
  dial: Piece;
  hub: Piece;
};

function build(topics: number) {
  const b = new Builder();
  let at: number;

  at = b.begin();
  b.lathe(hourglass(), { steps: 56 });
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 6 + (k * Math.PI * 2) / 3;
    b.lathe(rod(0.03, G_Y0 + G_THICK, -(G_Y0 + G_THICK) + 0.03, 0.85), {
      steps: 10,
      cx: G_PILLAR * Math.cos(a),
      cz: G_PILLAR * Math.sin(a),
    });
  }
  const glass = b.end(at);

  // Both ring tubes start at the top and run clockwise as the ring
  // faces the reader (see `ringPoint`).
  at = b.begin();
  b.lathe(torus(TRACK), { loop: true, steps: 96, a0: -Math.PI / 2 });
  const track = b.end(at);
  at = b.begin();
  b.lathe(torus(FILL), { loop: true, steps: 120, a0: -Math.PI / 2 });
  const fill = b.end(at);

  at = b.begin();
  b.lathe(ball(), { steps: 24 });
  const ballPiece = b.end(at);

  at = b.begin();
  b.lathe(stand(), { steps: 56 });
  const standPiece = b.end(at);
  at = b.begin();
  b.lathe(rod(0.038, DISC_FOOT - 0.01, STACK_TOP, 0.9), { steps: 14 });
  const spindle = b.end(at);
  at = b.begin();
  b.lathe(section(0.07, 0.54, 0, DISC_H, 0.028, 1), { loop: true, steps: 56 });
  const disc = b.end(at);

  at = b.begin();
  b.lathe(dialBase(), { steps: 64 });
  const dialBasePiece = b.end(at);
  at = b.begin();
  const n = Math.max(1, Math.min(72, topics));
  const sweep = (Math.PI * 2) / n;
  const gap = Math.min(GAP, sweep * 0.3);
  const wedge = section(DIAL_IN, DIAL_OUT, 0, 0.08, 0.02, 0.4);
  for (let k = 0; k < n; k++) {
    const a0 = -Math.PI / 2 + k * sweep + gap / 2;
    const span = sweep - gap;
    b.lathe(wedge, { loop: true, steps: Math.max(2, Math.ceil(span / 0.06)), a0, span, part: k });
    b.cap(wedge, a0, -1, k, 0);
    b.cap(wedge, a0 + span, 1, k, 0);
  }
  const dial = b.end(at);
  at = b.begin();
  b.lathe(hub(), { steps: 40 });
  const hubPiece = b.end(at);

  return {
    data: new Float32Array(b.data),
    index: new Uint32Array(b.index),
    pieces: {
      glass,
      track,
      fill,
      ball: ballPiece,
      stand: standPiece,
      spindle,
      disc,
      dialBase: dialBasePiece,
      dial,
      hub: hubPiece,
    } satisfies Pieces,
  };
}

/* ---- Ask Pinard, at work: the gimbal ------------------------------ */

/**
 * Three rings, one inside another, and a bead at their middle: the
 * gimbal of a precision instrument. Each ring turns on pins in the one
 * outside it, so together they move the way a gyroscope's cage does.
 * Radii and tubes, outermost first.
 */
export const GIMBAL = [
  { radius: 0.92, tube: 0.056 },
  { radius: 0.7, tube: 0.05 },
  { radius: 0.48, tube: 0.045 },
] as const;
export const BEAD = 0.15;

export type ListeningPieces = { rings: Piece[]; bead: Piece };

function buildListening() {
  const b = new Builder();
  const rings = GIMBAL.map(({ radius, tube }) => {
    const at = b.begin();
    b.lathe(torus(tube, radius), { loop: true, steps: 72 });
    return b.end(at);
  });
  const at = b.begin();
  b.lathe(ball(), { steps: 24 });
  const bead = b.end(at);
  return {
    data: new Float32Array(b.data),
    index: new Uint32Array(b.index),
    pieces: { rings, bead } satisfies ListeningPieces,
  };
}

/** Where on the ring a share of the way round falls, in the ring's own
 *  units: 0 at the top, clockwise as the ring faces the reader. */
export function ringPoint(share: number): [number, number, number] {
  const a = -Math.PI / 2 + share * Math.PI * 2;
  return [RING * Math.cos(a), 0, RING * Math.sin(a)];
}

const VERT = `#version 300 es
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in vec4 a_aux;
uniform mat3 u_rot;
uniform float u_size;
uniform vec3 u_off;
uniform vec3 u_shift;
uniform float u_done;
uniform float u_lift;
uniform vec2 u_k;
uniform vec2 u_at;
uniform float u_d;
out vec3 v_n;
out vec3 v_p;
out vec4 v_aux;
out float v_lit;
void main() {
  // A dial segment stands up as the count passes it.
  float lit = clamp(u_done - a_aux.w, 0.0, 1.0);
  vec3 q = a_pos * u_size + u_off + vec3(0.0, u_lift * lit, 0.0);
  vec3 p = u_rot * q + u_shift;
  v_n = u_rot * a_nrm;
  v_p = p;
  v_aux = a_aux;
  v_lit = lit;
  float w = u_d - p.z;
  float near = u_d - 3.0;
  float far = u_d + 3.0;
  gl_Position = vec4(p.xy * u_k + u_at * w, (far + near) / (far - near) * w - 2.0 * far * near / (far - near), w);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_n;
in vec3 v_p;
in vec4 v_aux;
in float v_lit;
uniform float u_d;
uniform float u_key;
uniform float u_rim;
uniform float u_pulse;
uniform float u_alpha;
uniform float u_sweep;
uniform float u_dim;
uniform vec3 u_tint;
out vec4 o_col;

${STUDIO}

void main() {
  // The ring's fill ends where the share does; a ball covers the cut.
  if (v_aux.z > u_sweep) discard;
  vec3 n = normalize(v_n);
  vec3 v = normalize(vec3(0.0, 0.0, u_d) - v_p);
  float lit = v_lit;
  float polish = v_aux.y * mix(0.45, 1.0, lit);
  float open = v_aux.x * mix(u_dim, 1.0, lit);

  float rough = mix(0.22, 0.07, polish);
  float nv = sat(dot(n, v));
  vec3 r = reflect(-v, n);

  // Anodised in the figure's colour; a part not yet reached is bare
  // dark metal. The cut edges are bright either way.
  vec3 dye = mix(vec3(0.075, 0.105, 0.095), u_tint, lit);
  vec3 tint = mix(dye, vec3(0.80, 0.88, 0.85), polish * 0.85);
  vec3 fres = tint + (vec3(1.0) - tint) * pow(1.0 - nv, 5.0);
  vec3 spec = (room(r, rough) + lights(r, rough)) * fres;
  vec3 body = dye * 0.26 * (
    0.22 +
    C_KEY * sat(dot(n, L_KEY) * 0.7 + 0.3) * u_key +
    C_COOL * sat(n.y) * 0.25 * u_key +
    C_ROSE * sat(dot(n, L_RIM)) * 0.7 * u_rim
  ) * (1.0 - polish);

  vec3 col = (body + spec) * mix(0.02, 1.0, open) * mix(open, 1.0, 0.25);
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o_col = vec4(col * u_alpha, u_alpha);
}`;

/** The colours aluminium is anodised in, by the figure's band: the
 *  horn's own green, a gold, and the heartbeat's rose. */
export const DYE = {
  green: [0.03, 0.25, 0.18],
  amber: [0.36, 0.215, 0.035],
  red: [0.37, 0.05, 0.1],
  steel: [0.5, 0.56, 0.54],
  graphite: [0.05, 0.075, 0.068],
} as const;

export type Dye = keyof typeof DYE;

export type Draw = {
  piece: Piece;
  /** Column by column, as uniformMatrix3fv reads it. */
  rot: Float32Array;
  /** Where the object's middle is, in CSS pixels from the canvas's top
   *  left, and how many CSS pixels one of its units is. */
  x: number;
  y: number;
  unit: number;
  /** The piece's own scale and where it sits in the object, and where
   *  the object then sits once turned. */
  size?: number;
  off?: [number, number, number];
  shift?: [number, number, number];
  dye: Dye;
  /** How dark a part not yet reached is. */
  dim?: number;
  /** For the ring: how far round the fill is drawn. */
  sweep?: number;
  /** For the dial: how many segments are raised, and how far. */
  done?: number;
  lift?: number;
  key: number;
  rim: number;
  /** The rose light's heartbeat on top of `rim`, 0 to 1. */
  pulse?: number;
  alpha: number;
};

type Renderer<T> = {
  pieces: T;
  draw(list: Draw[]): void;
  fit(): void;
  dispose(): void;
};

export type Figures = Renderer<Pieces>;
export type Listening = Renderer<ListeningPieces>;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`figures shader: ${log}`);
  }
  return shader;
}

/** Null where the browser cannot draw them; the card keeps its bars. */
export function createFigures(canvas: HTMLCanvasElement, topics: number, density = 2): Figures | null {
  return createRenderer(canvas, build(topics), density);
}

/** Null where the browser cannot draw it; Ask Pinard keeps its trace.
 *  So small, with rings so fine, that it is always drawn at three pixels
 *  to each one shown, whatever the screen, and the browser's scaling
 *  smooths them. */
export function createListening(canvas: HTMLCanvasElement): Listening | null {
  return createRenderer(canvas, buildListening(), 3, 3);
}

function createRenderer<T>(
  canvas: HTMLCanvasElement,
  built: { data: Float32Array; index: Uint32Array; pieces: T },
  density: number,
  /** Draw at no fewer device pixels than this to each CSS pixel. */
  floor = 1
): Renderer<T> | null {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return null;
  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  } catch (e) {
    console.warn(e);
    return null;
  }

  const { data, index, pieces } = built;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const stride = FLOATS * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 24);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const loc = {
    rot: u("u_rot"),
    size: u("u_size"),
    off: u("u_off"),
    shift: u("u_shift"),
    done: u("u_done"),
    lift: u("u_lift"),
    k: u("u_k"),
    at: u("u_at"),
    d: u("u_d"),
    key: u("u_key"),
    rim: u("u_rim"),
    pulse: u("u_pulse"),
    alpha: u("u_alpha"),
    sweep: u("u_sweep"),
    dim: u("u_dim"),
    tint: u("u_tint"),
  };

  const D = 8;
  let cssW = 1;
  let cssH = 1;
  function fit() {
    const dpr = Math.max(floor, Math.min(window.devicePixelRatio || 1, density));
    cssW = canvas.clientWidth || 1;
    cssH = canvas.clientHeight || 1;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  fit();

  return {
    pieces,
    fit,
    draw(list) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform1f(loc.d, D);
      for (const it of list) {
        if (it.alpha <= 0.003 || it.unit <= 0.5) continue;
        gl.uniform2f(loc.k, (D * 2 * it.unit) / cssW, (D * 2 * it.unit) / cssH);
        gl.uniform2f(loc.at, (it.x / cssW) * 2 - 1, 1 - (it.y / cssH) * 2);
        gl.uniformMatrix3fv(loc.rot, false, it.rot);
        gl.uniform1f(loc.size, it.size ?? 1);
        const off = it.off ?? [0, 0, 0];
        gl.uniform3f(loc.off, off[0], off[1], off[2]);
        const shift = it.shift ?? [0, 0, 0];
        gl.uniform3f(loc.shift, shift[0], shift[1], shift[2]);
        gl.uniform1f(loc.done, it.done ?? 1e4);
        gl.uniform1f(loc.lift, it.lift ?? 0);
        gl.uniform1f(loc.sweep, it.sweep ?? 2);
        gl.uniform1f(loc.dim, it.dim ?? 1);
        const dye = DYE[it.dye];
        gl.uniform3f(loc.tint, dye[0], dye[1], dye[2]);
        gl.uniform1f(loc.key, it.key);
        gl.uniform1f(loc.rim, it.rim);
        gl.uniform1f(loc.pulse, it.pulse ?? 0);
        gl.uniform1f(loc.alpha, Math.min(1, it.alpha));
        if (it.alpha < 0.999) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          gl.disable(gl.BLEND);
        }
        gl.drawElements(gl.TRIANGLES, it.piece.count, gl.UNSIGNED_INT, it.piece.first * 4);
      }
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

/* ---- Turning things ------------------------------------------------ */

export type M3 = Float32Array;

export function rx(a: number): M3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, c, s, 0, -s, c]);
}
export function ry(a: number): M3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 1, 0, s, 0, c]);
}
export function rz(a: number): M3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, s, 0, -s, c, 0, 0, 0, 1]);
}
/** a then b applied after it: the product b·a, column by column. */
export function then(...ms: M3[]): M3 {
  let out = ms[0];
  for (let m = 1; m < ms.length; m++) {
    const a = out;
    const b = ms[m];
    const r = new Float32Array(9);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        r[j * 3 + i] = b[i] * a[j * 3] + b[3 + i] * a[j * 3 + 1] + b[6 + i] * a[j * 3 + 2];
      }
    }
    out = r;
  }
  return out;
}
