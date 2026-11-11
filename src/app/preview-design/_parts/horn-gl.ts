/**
 * The Pinard horn, drawn live.
 *
 * A Pinard is turned on a lathe, so its whole shape is one outline spun
 * about an axis. That is all this file holds: the outline, the spin, and
 * a studio to light it in. No model file and no 3D library, so the horn
 * costs the page a few kilobytes and nothing to download.
 *
 * The finish is satin anodised aluminium in Pinard's green, with the two
 * rims cut bright, the way a machined part is. It is lit like a product
 * photograph: one large soft light up and to the left, a thin rose light
 * behind (the heartbeat colour, and the one that can pulse), a lamp
 * overhead and a little fill. The lights belong to the room, not to the
 * horn, so tilting it moves the highlights across it.
 */

/** Length of the horn in its own units, bell to ear plate. */
const LENGTH = 2.74;
const Y_BELL = -LENGTH / 2;
const BELL = 0.64;
const NECK = 0.15;
const EAR = 0.5;
const Y_NECK = 0.94;
const Y_PLATE = 1.2;
const EDGE = 0.045;
const HOLE = 0.105;
const LIP = 0.028;
const Y_TOP = Y_PLATE + 2 * EDGE;

type Point = {
  r: number;
  y: number;
  /** 1 in the open, falling inside the bore and under the ear plate. */
  open: number;
  /** 1 where the metal is cut bright rather than blasted satin. */
  polish: number;
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The outside of the cone at a height: slim at the neck, opening into
 *  the bell, with the last of the opening quick, as on a trumpet. */
function flare(y: number): number {
  const t = Math.max(0, Math.min(1, (y - Y_BELL) / (Y_NECK - Y_BELL)));
  const u = 1 - t;
  return NECK + (BELL - NECK) * (0.7 * Math.pow(u, 2.3) + 0.3 * Math.pow(u, 8));
}

/** The horn's outline, once round: up the outside, over the ear plate,
 *  down the bore and back around the lip of the bell. */
function outline(): Point[] {
  const pts: Point[] = [];

  // Up the outside of the cone, closer together where it curves most.
  const y0 = Y_BELL + LIP;
  for (let i = 0; i <= 84; i++) {
    const s = Math.pow(i / 84, 1.45);
    const y = mix(y0, Y_NECK, s);
    pts.push({ r: flare(y), y, open: mix(1, 0.5, smooth(Y_NECK - 0.42, Y_NECK, y)), polish: 0 });
  }

  // The stem opening into the underside of the ear plate.
  const a = { r: NECK, y: Y_NECK };
  const b = { r: EAR - EDGE, y: Y_PLATE };
  const c1 = { r: NECK, y: Y_NECK + 0.19 };
  const c2 = { r: b.r - 0.27, y: Y_PLATE - 0.012 };
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const k = 1 - t;
    pts.push({
      r: k * k * k * a.r + 3 * k * k * t * c1.r + 3 * k * t * t * c2.r + t * t * t * b.r,
      y: k * k * k * a.y + 3 * k * k * t * c1.y + 3 * k * t * t * c2.y + t * t * t * b.y,
      open: mix(0.5, 0.86, t * t),
      polish: 0,
    });
  }

  // Round the edge of the plate: the first bright cut.
  for (let i = 1; i <= 12; i++) {
    const phi = (-90 + (180 * i) / 12) * (Math.PI / 180);
    pts.push({
      r: EAR - EDGE + EDGE * Math.cos(phi),
      y: Y_PLATE + EDGE + EDGE * Math.sin(phi),
      open: 1,
      polish: Math.sin((Math.PI * i) / 12),
    });
  }

  // Across the top, very slightly dished toward the hole.
  const rim = HOLE + 0.022;
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    const r = mix(EAR - EDGE, rim, t);
    const d = 1 - (r - rim) / (EAR - EDGE - rim);
    pts.push({ r, y: Y_TOP - 0.034 * d * d, open: 1, polish: 0 });
  }

  // Over the edge of the hole and down the bore.
  const yHole = Y_TOP - 0.034;
  for (let i = 1; i <= 6; i++) {
    const phi = (90 + (90 * i) / 6) * (Math.PI / 180);
    pts.push({
      r: rim + 0.022 * Math.cos(phi),
      y: yHole - 0.022 + 0.022 * Math.sin(phi),
      open: mix(1, 0.5, i / 6),
      polish: 0.6,
    });
  }
  const yIn = yHole - 0.022;
  const yLip = Y_BELL + LIP;
  for (let i = 1; i <= 70; i++) {
    const s = 1 - Math.pow(1 - i / 70, 1.45);
    const y = mix(yIn, yLip, s);
    const wall = mix(0.05, 2 * LIP, smooth(Y_NECK, Y_BELL, y));
    const r = y > Y_NECK - 0.2 ? mix(HOLE, Math.max(0.09, flare(y) - wall), smooth(Y_NECK, Y_NECK - 0.2, y)) : Math.max(0.09, flare(y) - wall);
    const fromBell = Math.exp(-(y - Y_BELL) / 0.5);
    const fromEar = Math.exp(-(yHole - y) / 0.05);
    pts.push({ r, y, open: 0.035 + 0.965 * Math.max(fromBell * 0.9, fromEar * 0.5), polish: 0 });
  }

  // Around the lip of the bell: the second bright cut.
  const cr = BELL - LIP;
  const cy = Y_BELL + LIP;
  for (let i = 1; i < 12; i++) {
    const phi = (180 + (180 * i) / 12) * (Math.PI / 180);
    pts.push({
      r: cr + LIP * Math.cos(phi),
      y: cy + LIP * Math.sin(phi),
      open: mix(0.9, 1, i / 12),
      polish: Math.sin((Math.PI * i) / 12),
    });
  }
  return pts;
}

const AROUND = 144;

function build() {
  const pts = outline();
  const n = pts.length;
  const data = new Float32Array(n * AROUND * 8);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const before = pts[(i - 1 + n) % n];
    const after = pts[(i + 1) % n];
    // The surface faces to the right of the way the outline travels.
    let nr = after.y - before.y;
    let ny = -(after.r - before.r);
    const len = Math.hypot(nr, ny) || 1;
    nr /= len;
    ny /= len;
    for (let j = 0; j < AROUND; j++) {
      const th = (j / AROUND) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const o = (i * AROUND + j) * 8;
      data[o] = p.r * c;
      data[o + 1] = p.y;
      data[o + 2] = p.r * s;
      data[o + 3] = nr * c;
      data[o + 4] = ny;
      data[o + 5] = nr * s;
      data[o + 6] = p.open;
      data[o + 7] = p.polish;
    }
  }
  const index = new Uint32Array(n * AROUND * 6);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < AROUND; j++) {
      const j2 = (j + 1) % AROUND;
      const a = i * AROUND + j;
      const b = i2 * AROUND + j;
      const c = i2 * AROUND + j2;
      const d = i * AROUND + j2;
      index[k++] = a;
      index[k++] = b;
      index[k++] = c;
      index[k++] = a;
      index[k++] = c;
      index[k++] = d;
    }
  }
  return { data, index };
}

const VERT = `#version 300 es
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in vec2 a_aux;
uniform mat3 u_rot;
uniform vec2 u_k;
uniform vec2 u_at;
uniform float u_d;
out vec3 v_n;
out vec3 v_p;
out vec2 v_aux;
out float v_y;
void main() {
  vec3 p = u_rot * a_pos;
  v_n = u_rot * a_nrm;
  v_p = p;
  v_aux = a_aux;
  v_y = a_pos.y;
  float w = u_d - p.z;
  float near = u_d - 4.0;
  float far = u_d + 4.0;
  gl_Position = vec4(p.xy * u_k + u_at * w, (far + near) / (far - near) * w - 2.0 * far * near / (far - near), w);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_n;
in vec3 v_p;
in vec2 v_aux;
in float v_y;
uniform vec3 u_axis;
uniform float u_d;
uniform float u_key;
uniform float u_rim;
uniform float u_pulse;
uniform float u_alpha;
out vec4 o_col;

float sat(float x) { return clamp(x, 0.0, 1.0); }

// A soft light of a given size as the surface sees it in reflection:
// wider and dimmer on a rougher finish.
float lobe(vec3 r, vec3 l, float size, float rough) {
  float spread = size * size + rough * rough * 0.9;
  return exp((dot(r, l) - 1.0) / spread) / (1.0 + rough * 9.0);
}

const vec3 L_KEY = vec3(-0.560, 0.585, 0.587);
const vec3 L_RIM = vec3(0.796, 0.243, -0.554);
const vec3 L_KICK = vec3(-0.846, 0.086, -0.526);
const vec3 L_TOP = vec3(0.070, 0.990, 0.120);
const vec3 L_FILL = vec3(0.372, -0.248, 0.895);

const vec3 C_KEY = vec3(1.00, 0.985, 0.955);
const vec3 C_ROSE = vec3(1.00, 0.36, 0.50);
const vec3 C_COOL = vec3(0.80, 0.96, 0.92);

// What the room looks like in a given direction: dim, a little lighter
// overhead, with a pale band at the horizon as in any studio.
vec3 room(vec3 r, float rough) {
  float up = r.y;
  vec3 c = mix(vec3(0.012, 0.026, 0.022), vec3(0.085, 0.125, 0.112), smoothstep(-0.5, 0.95, up));
  float band = exp(-pow((up - 0.06) / mix(0.07, 0.3, rough), 2.0));
  c += vec3(0.10, 0.15, 0.135) * band * (1.0 - rough * 0.6);
  // The floor, lit faintly rose by the light behind.
  c += C_ROSE * 0.035 * smoothstep(0.1, -0.9, up) * u_rim;
  return c;
}

vec3 lights(vec3 r, float rough) {
  vec3 c = vec3(0.0);
  c += C_KEY * (lobe(r, L_KEY, 0.42, rough) * 5.2 + lobe(r, L_KEY, 0.16, rough) * 3.0) * u_key;
  c += C_COOL * lobe(r, L_TOP, 0.30, rough) * 2.1 * u_key;
  c += C_COOL * lobe(r, L_KICK, 0.20, rough) * 3.6 * mix(u_rim, u_key, 0.5);
  c += C_ROSE * lobe(r, L_RIM, 0.21, rough) * (5.4 + 3.2 * u_pulse) * u_rim;
  c += C_COOL * lobe(r, L_FILL, 0.5, rough) * 0.42 * u_key;
  return c;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 n = normalize(v_n);
  vec3 v = normalize(vec3(0.0, 0.0, u_d) - v_p);
  if (dot(n, v) < 0.0) n = -n;

  float open = v_aux.x;
  float polish = v_aux.y;

  // The lathe's own marks: fine rings about the axis, too fine to see as
  // lines, only as the way the light drags along the metal. Faded out
  // where they would be finer than a pixel.
  float fine = fwidth(v_y);
  float rings = sin(v_y * 310.0) * 0.6 + sin(v_y * 131.0 + 1.7) * 0.4;
  float keep = sat(1.0 - fine * 310.0 / 2.2) * (1.0 - polish);
  n = normalize(n + u_axis * rings * 0.035 * keep);

  float rough = mix(0.36, 0.09, polish);
  float nv = sat(dot(n, v));
  vec3 r = reflect(-v, n);

  // Anodised: the colour is in the reflection itself, turning to plain
  // white only at a glancing angle. The cut rims are bare metal.
  vec3 tint = mix(vec3(0.060, 0.300, 0.228), vec3(0.78, 0.86, 0.83), polish * 0.85);
  vec3 fres = tint + (vec3(1.0) - tint) * pow(1.0 - nv, 5.0);

  vec3 spec = (room(r, rough) + lights(r, rough)) * fres;

  // The dyed layer scatters a little light of its own, which is what
  // keeps a blasted finish from going black between highlights.
  vec3 body = vec3(0.030, 0.150, 0.112) * (
    0.20 +
    C_KEY * sat(dot(n, L_KEY) * 0.75 + 0.25) * 1.25 * u_key +
    C_COOL * sat(n.y) * 0.35 * u_key +
    C_ROSE * sat(dot(n, L_RIM)) * 0.55 * u_rim
  ) * (1.0 - polish);

  vec3 col = (body + spec) * mix(0.02, 1.0, open) * mix(open, 1.0, 0.25);

  // Filmic shoulder, then to the screen's own curve.
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(sat3(col), vec3(1.0 / 2.2));
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o_col = vec4(col * u_alpha, u_alpha);
}`.replace("sat3(col)", "clamp(col, 0.0, 1.0)");

export type Pose = {
  /** The way the horn points, bell to ear plate, as the viewer sees it:
   *  x to the right, y up, z out of the screen. Need not be unit length. */
  axis: [number, number, number];
  /** Where its middle sits, in CSS pixels from the canvas's top left. */
  x: number;
  y: number;
  /** How long it is drawn, in CSS pixels, when seen side on. */
  size: number;
  /** The main lights, 0 to 1. */
  key: number;
  /** The rose light behind, 0 to 1, and its heartbeat on top of that. */
  rim: number;
  pulse: number;
  opacity: number;
};

export type Horn = {
  draw(poses: Pose[]): void;
  /** Match the drawing surface to the canvas's size on the page. */
  fit(): void;
  dispose(): void;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`horn shader: ${log}`);
  }
  return shader;
}

/** The rotation that stands the horn's own upright along `axis`. */
function upright(axis: [number, number, number]): Float32Array {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const ax = axis[0] / len;
  const ay = axis[1] / len;
  const az = axis[2] / len;
  // About (0,1,0) x axis, by the angle between them.
  const vx = az;
  const vz = -ax;
  const s2 = vx * vx + vz * vz;
  if (s2 < 1e-10) {
    const f = ay < 0 ? -1 : 1;
    return new Float32Array([1, 0, 0, 0, f, 0, 0, 0, f]);
  }
  const k = (1 - ay) / s2;
  // Column by column, as uniformMatrix3fv reads it. The middle column
  // is where the horn's own upright lands, which is the axis asked for.
  return new Float32Array([
    1 - k * vz * vz, vz, k * vx * vz,
    -vz, 1 - k * s2, vx,
    k * vx * vz, -vx, 1 - k * vx * vx,
  ]);
}

/** Null where the browser cannot draw it; the caller shows the still mark. */
export function createHorn(canvas: HTMLCanvasElement): Horn | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
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

  const { data, index } = build();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const loc = {
    rot: u("u_rot"),
    k: u("u_k"),
    at: u("u_at"),
    d: u("u_d"),
    axis: u("u_axis"),
    key: u("u_key"),
    rim: u("u_rim"),
    pulse: u("u_pulse"),
    alpha: u("u_alpha"),
  };

  const D = 9.5;
  let cssW = 1;
  let cssH = 1;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    fit,
    draw(poses) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform1f(loc.d, D);
      for (const pose of poses) {
        if (pose.opacity <= 0.003 || pose.size <= 1) continue;
        const ky = (D * 2 * pose.size) / (LENGTH * cssH);
        gl.uniform2f(loc.k, (ky * cssH) / cssW, ky);
        gl.uniform2f(loc.at, (pose.x / cssW) * 2 - 1, 1 - (pose.y / cssH) * 2);
        gl.uniformMatrix3fv(loc.rot, false, upright(pose.axis));
        const len = Math.hypot(pose.axis[0], pose.axis[1], pose.axis[2]) || 1;
        gl.uniform3f(loc.axis, pose.axis[0] / len, pose.axis[1] / len, pose.axis[2] / len);
        gl.uniform1f(loc.key, pose.key);
        gl.uniform1f(loc.rim, pose.rim);
        gl.uniform1f(loc.pulse, pose.pulse);
        gl.uniform1f(loc.alpha, Math.min(1, pose.opacity));
        if (pose.opacity < 0.999) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          gl.disable(gl.BLEND);
        }
        gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_INT, 0);
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
