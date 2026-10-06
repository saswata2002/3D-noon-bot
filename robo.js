// Bot 2 ("robo") — 3D build of the Figma "new bot" frame (1154:78182).
//
// Only the look lives here; motion, states, face morphs, intro, colour
// themes and shadows are shared with Orbi in main.js. The group's origin is
// the head centre. Figma px → units: 1 unit = 120 px (same scale as Orbi,
// whose 240 px ball is 2 units wide).
//
//   Head    200 × 190, corner radii 100 (top) / 75 (bottom): an inflated
//           rounded shape meshed from a signed distance field, purple
//           gradient #b886ff → #7924ff (45%) → #3a089e, 90 white speckles
//   Ears    45 × 80 pods behind the head sides, #b07aff → #3e0aa8, each with
//           a silver-rimmed lens ("Light · off") facing out
//   Bezel   150 × 105 r35 silver frame; Screen 138 × 93 r30, dark glass with
//           scanlines and a top reflection; the face is drawn on it
//           in glowing green (Figma eyes: 28 × 38, radial #d9ffd2 → #5cff4f
//           → #2fc423, glows 15 px @90% + 40 px @50%)
import * as THREE from 'three';

export const PX = 1 / 120;

// ─── shapes (units, head-centre origin, y up) ─────────────────────────────
const HEAD = { hw: 100 * PX, hh: 95 * PX, rTop: 100 * PX, rBot: 75 * PX, dz: 0.72, rz: 0.5 };
// Figma head-local px (origin top-left of the 200 × 190 head) → units
const hx = (x) => (x - 100) * PX;
const hy = (y) => (95 - y) * PX;
const BEZ = { cy: hy(97.5), hw: 75 * PX, hh: 52.5 * PX, r: 35 * PX, lift: 0.02, hd: 0.05, rr: 0.045 };
const SCR = { cy: BEZ.cy, hw: 69 * PX, hh: 46.5 * PX, r: 30 * PX };

function sdRR(x, y, hw, hh, r) {             // 2D rounded rectangle
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}
function sdHead2(x, y) {                      // front silhouette: round top, softer bottom corners
  // the corner radius blends 75 → 100 across the middle (a hard switch at y = 0 left a crease)
  const t = THREE.MathUtils.smoothstep(y, -0.3, 0.3);
  return sdRR(x, y, HEAD.hw, HEAD.hh, HEAD.rBot + (HEAD.rTop - HEAD.rBot) * t);
}
// inflated extrusion: rounded in depth with radius rz, so the face is a
// gentle dome and the sides roll round
function sdHead(x, y, z) {
  const wx = sdHead2(x, y) + HEAD.rz, wy = Math.abs(z) - (HEAD.dz - HEAD.rz);
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - HEAD.rz;
}
function gradHead(x, y, z, out) {
  const e = 1e-3;
  out.set(
    sdHead(x + e, y, z) - sdHead(x - e, y, z),
    sdHead(x, y + e, z) - sdHead(x, y - e, z),
    sdHead(x, y, z + e) - sdHead(x, y, z - e),
  ).normalize();
  return out;
}

// Ears: capsule pods (r 22.5, straight 35 px, depth ×1.25) tucked behind the
// head sides, as in Figma. They're fused into the head with a smooth union
// (a ~10 px fillet), so head and pods are one moulded shape instead of two
// solids jammed together.
const EAR = { r: 22.5 * PX, len: 35 * PX, depth: 1.25, x: 97.5 * PX, y: -5 * PX, lensAng: 0.4, fillet: 10 * PX };
function sdEarAt(side, x, y, z) {
  const lx = x - side * EAR.x, ly = y - EAR.y, lz = z / EAR.depth;
  return Math.hypot(lx, Math.max(Math.abs(ly) - EAR.len / 2, 0), lz) - EAR.r;
}
function smin(a, b, k) {                      // polynomial smooth minimum
  const h = THREE.MathUtils.clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
function sdBody(x, y, z) {
  const d = smin(sdHead(x, y, z), sdEarAt(-1, x, y, z), EAR.fillet);
  return smin(d, sdEarAt(1, x, y, z), EAR.fillet);
}
function gradBody(x, y, z, out) {
  const e = 1e-3;
  return out.set(
    sdBody(x + e, y, z) - sdBody(x - e, y, z),
    sdBody(x, y + e, z) - sdBody(x, y - e, z),
    sdBody(x, y, z + e) - sdBody(x, y, z - e),
  ).normalize();
}

// front surface height of the head, z = zf(x, y), on a grid (bilinear lookup)
const ZG = { n: 241, m: 229 };
const zGrid = new Float32Array(ZG.n * ZG.m);
for (let j = 0; j < ZG.m; j++) {
  for (let i = 0; i < ZG.n; i++) {
    const x = -HEAD.hw + (2 * HEAD.hw * i) / (ZG.n - 1);
    const y = -HEAD.hh + (2 * HEAD.hh * j) / (ZG.m - 1);
    let z = 0;
    if (sdHead2(x, y) < 0) {
      let lo = 0, hi = HEAD.dz + 0.01;
      for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (sdHead(x, y, mid) < 0) lo = mid; else hi = mid; }
      z = (lo + hi) / 2;
    }
    zGrid[j * ZG.n + i] = z;
  }
}
function zf(x, y) {
  const u = THREE.MathUtils.clamp((x + HEAD.hw) / (2 * HEAD.hw) * (ZG.n - 1), 0, ZG.n - 1.001);
  const v = THREE.MathUtils.clamp((y + HEAD.hh) / (2 * HEAD.hh) * (ZG.m - 1), 0, ZG.m - 1.001);
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const a = zGrid[j * ZG.n + i], b = zGrid[j * ZG.n + i + 1];
  const c = zGrid[(j + 1) * ZG.n + i], d = zGrid[(j + 1) * ZG.n + i + 1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

// Mesh a star-shaped SDF by casting rays from `center` through an ellipsoid-
// scaled sphere (so vertices spread evenly over flat shapes); normals come
// from `normalAt` so the UV seam never shows.
function meshSDF(sd, center, scale, tMax, wSeg, hSeg, normalAt) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const dir = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    dir.set(pos.getX(i) * scale.x, pos.getY(i) * scale.y, pos.getZ(i) * scale.z).normalize();
    let lo = 0, hi = tMax;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      p.copy(center).addScaledVector(dir, mid);
      if (sd(p.x, p.y, p.z) < 0) lo = mid; else hi = mid;
    }
    p.copy(center).addScaledVector(dir, (lo + hi) / 2);
    pos.setXYZ(i, p.x, p.y, p.z);
    normalAt(p, n);
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// ─── face (drawn on the screen) ───────────────────────────────────────────
// Screen px, origin at the screen centre (Figma eye centres: x ±22.5, y 0).
// Same stroke-morph model as Orbi: every eye is two strokes of NP points.
const NP = 28;
const linePts = (x0, y0, x1, y1) => Array.from({ length: NP }, (_, i) => {
  const t = i / (NP - 1); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
});
const arcPts = (cx, cy, r, a0, a1) => Array.from({ length: NP }, (_, i) => {
  const a = a0 + (a1 - a0) * (i / (NP - 1)); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
const EX = -22.5;
export const FACE = {
  LEFT_EYE: {
    pill:     () => { const l = linePts(EX, -5, EX, 5); return { a: l, b: l, w: 28 }; },        // drawn as the Figma 28 × 38 ellipse
    greeting: () => { const l = arcPts(EX, 5, 11, Math.PI + 0.38, Math.PI * 2 - 0.38); return { a: l, b: l, w: 6.5 }; },
    error:    () => { const l = linePts(EX - 12, 0, EX + 12, 0); return { a: l, b: l, w: 8 }; },
    dizzy:    () => ({ a: linePts(EX - 10, -10, EX + 10, 10), b: linePts(EX + 10, -10, EX - 10, 10), w: 6.5 }),
    sleepy:   () => { const l = arcPts(EX, -4, 10.5, Math.PI - 0.32, 0.32); return { a: l, b: l, w: 6 }; },
    angry:    () => ({ a: linePts(EX + 1, 0, EX + 1, 9), b: linePts(EX - 14, -22, EX + 12, -11), w: 18 }),
  },
  MOUTH: {
    smile: () => ({ a: arcPts(0, 18, 9, Math.PI - 0.55, 0.55), w: 5 }),
    frown: () => ({ a: arcPts(0, 33, 8.5, Math.PI + 0.6, Math.PI * 2 - 0.6), w: 5 }),
    none:  () => ({ a: linePts(0, 27, 0, 27), w: 0 }),
  },
  CLOSED_LINE: () => linePts(EX - 14, 0, EX + 14, 0),   // a pill squashed shut: 28 wide × 7
  SQUASH: 7 / 38,
};

const SC = 12;                                // canvas px per Figma px
const SW = 138, SH = 93;
function screenPath(ctx) {
  ctx.beginPath();
  ctx.roundRect(0, 0, SW * SC, SH * SC, 30 * SC);
}

// ─── materials helpers ────────────────────────────────────────────────────
const U = (value, glsl) => ({ value, glsl });

// ─── chrome studio: what the metal bezel reflects ─────────────────────────
// A light gradient dome (bright overhead, soft grey horizon, dark floor) with
// a big key softbox up-left, a strip light on each side and a top bar, so the
// chrome reads bright with crisp highlights and a darker lower band.
function chromeEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(20, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 floorC = vec3(0.03, 0.03, 0.04), horizon = vec3(0.26, 0.27, 0.31), sky = vec3(0.92, 0.93, 0.98);
          vec3 c = h < 0.0 ? mix(horizon * 0.6, floorC, smoothstep(0.0, -0.4, h)) : mix(horizon, sky, smoothstep(0.12, 0.75, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  ));
  const panel = (w, h, intensity, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(12, 9, 3.2, [-7, 7, 10]);    // key softbox, up-left in front
  panel(2.2, 14, 2.4, [-12, 1, 3]);  // left strip
  panel(2.2, 14, 1.8, [12, 1, 3]);   // right strip
  panel(16, 1.6, 2.6, [0, 11, 4]);   // top bar
  return env;
}

// ─── build ────────────────────────────────────────────────────────────────
export function createRobo() {
  const group = new THREE.Group();

  // palette (themed): the Figma purple by default
  const pal = {
    headTop: U(new THREE.Color(0xb886ff), 'vec3'), headMid: U(new THREE.Color(0x7924ff), 'vec3'), headBot: U(new THREE.Color(0x3a089e), 'vec3'),
    earTop: U(new THREE.Color(0xb07aff), 'vec3'), earBot: U(new THREE.Color(0x3e0aa8), 'vec3'),
    rimLow: U(new THREE.Color(0xcca6ff), 'vec3'), refl: U(new THREE.Color(0xe3d0ff), 'vec3'),
  };

  // ── head ──
  const speck = document.createElement('canvas');
  speck.width = 1000; speck.height = 950;
  {
    const c = speck.getContext('2d');
    for (const [x, y, w, a] of SPECKLES) {
      c.fillStyle = `rgba(255,255,255,${a * 0.8})`;
      c.beginPath(); c.arc(x * 5, y * 5, w * 2.1, 0, Math.PI * 2); c.fill();
    }
  }
  const speckTex = new THREE.CanvasTexture(speck);
  speckTex.anisotropy = 8;
  const headUniforms = {
    uHeadTop: pal.headTop, uHeadMid: pal.headMid, uHeadBot: pal.headBot, uRimLow: pal.rimLow, uRefl: pal.refl,
    uEarTop: pal.earTop, uEarBot: pal.earBot,
    speckMap: U(speckTex, 'sampler2D'),
  };
  const headMat = new THREE.MeshPhysicalMaterial({
    roughness: 0.42, clearcoat: 0.85, clearcoatRoughness: 0.18, specularIntensity: 0.6,
    sheen: 0.25, sheenColor: new THREE.Color(0xe9dcff), sheenRoughness: 0.7,
  });
  headMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, headUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;\nvObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
varying vec3 vObjN;
uniform vec3 uHeadTop, uHeadMid, uHeadBot, uRimLow, uRefl, uEarTop, uEarBot;
uniform sampler2D speckMap;
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
// Figma Head fill: linear #b886ff → #7924ff (45%) → #3a089e, top to bottom
float gy = clamp((${HEAD.hh.toFixed(4)} - vObj.y) / ${(2 * HEAD.hh).toFixed(4)}, 0.0, 1.0);
vec3 base = gy < 0.45 ? mix(uHeadTop, uHeadMid, gy / 0.45) : mix(uHeadMid, uHeadBot, (gy - 0.45) / 0.55);
// ear pods: their own Figma gradient #b07aff → #3e0aa8 over the pod, blended across the fillet
float earW = smoothstep(${(HEAD.hw - 6 * PX).toFixed(4)}, ${(HEAD.hw + 5 * PX).toFixed(4)}, abs(vObj.x));
float gyE = clamp((${(40 * PX).toFixed(4)} - (vObj.y - (${EAR.y.toFixed(4)}))) / ${(80 * PX).toFixed(4)}, 0.0, 1.0);
base = mix(base, mix(uEarTop, uEarBot, gyE), earW);
diffuseColor.rgb = base;
// speckles (front/back projection, faded where the surface turns sideways)
vec2 suv = vec2(vObj.x / ${(2 * HEAD.hw).toFixed(4)} + 0.5, vObj.y / ${(2 * HEAD.hh).toFixed(4)} + 0.5);
float speckA = texture2D(speckMap, suv).a * smoothstep(0.2, 0.55, abs(normalize(vObjN).z)) * (1.0 - earW);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), speckA);
// bezel drop shadow on the face (Figma: #14002e 60%, y +7, blur 10)
float bezSd = sdRR(vec2(vObj.x, vObj.y - (${BEZ.cy.toFixed(4)}) + ${(7 * PX).toFixed(4)}), vec2(${BEZ.hw.toFixed(4)}, ${BEZ.hh.toFixed(4)}), ${BEZ.r.toFixed(4)});
float bezSh = (1.0 - smoothstep(-0.02, ${(0.1).toFixed(3)}, bezSd)) * step(0.0, vObj.z) * 0.6;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(speckA * 0.12);        // glitter stays readable in shade`)
      .replace('#include <opaque_fragment>', `
outgoingLight *= 1.0 - bezSh * 0.8;
{
  // painted edge light (view-dependent, like the Figma strokes):
  //  • 5 px inside stroke: white 70% at the top fading out by 35%, lilac 55% at the bottom
  //  • "Clearcoat edge" arc, upper-left: white 55%; "Reflection · low" arc, lower-right: lilac 40%
  vec3 vn = normalize(normal);
  float fr = 1.0 - saturate(dot(vn, normalize(vViewPosition)));
  vec2 dir2 = normalize(vn.xy + vec2(1e-4));
  float topness = vn.y * 0.5 + 0.5;
  vec3 edge = mix(uRimLow * 0.55, vec3(0.7), smoothstep(0.45, 0.85, topness)) * (1.0 - smoothstep(0.38, 0.62, topness) * (1.0 - smoothstep(0.62, 0.85, topness)));
  float onHeadOnly = 1.0 - earW;                   // the painted edge light belongs to the head outline, not the pods
  outgoingLight += edge * smoothstep(0.62, 0.92, fr) * 0.9 * onHeadOnly;
  float band = smoothstep(0.32, 0.46, fr) * (1.0 - smoothstep(0.52, 0.64, fr));
  float ul = smoothstep(0.55, 0.95, dot(dir2, normalize(vec2(-1.0, 1.1))));
  float lr = smoothstep(0.6, 0.95, dot(dir2, normalize(vec2(1.0, -0.9))));
  outgoingLight += band * (vec3(0.55) * ul + uRefl * 0.4 * lr) * onHeadOnly;
  // Figma "Softbox" (white 26%, blur 22, top-left), "Shine" and "Specular" (white 75%, 35 × 15 at 25°)
  vec3 sbDir = normalize(vec3(-0.42, 0.62, 0.66));
  float sb = max(dot(vn, sbDir), 0.0);
  outgoingLight += vec3(0.24) * pow(sb, 5.0);
  outgoingLight += vec3(0.55) * smoothstep(0.93, 0.985, sb);
  // bottom: lilac inner glow (inner shadow #c29bff 45% y −7 blur 14 + the 55% lilac stroke)
  float bottomness = smoothstep(-0.05, -0.75, vn.y);
  outgoingLight += uRimLow * 0.42 * bottomness * smoothstep(0.25, 0.8, fr) * onHeadOnly;
}
#include <opaque_fragment>`);
  };
  const headScale = new THREE.Vector3(EAR.x + EAR.r, HEAD.hh, HEAD.dz);
  const headGeo = meshSDF(sdBody, new THREE.Vector3(), headScale, 1.3, 384, 256,
    (p, n) => gradBody(p.x, p.y, p.z, n));
  const head = new THREE.Mesh(headGeo, headMat);
  group.add(head);

  // ── bezel: a rounded slab following the face's curve ──
  const bz0 = zf(0, BEZ.cy) + BEZ.lift;
  const sdBezFlat = (x, y, z) => {
    const wx = sdRR(x, y - BEZ.cy, BEZ.hw, BEZ.hh, BEZ.r) + BEZ.rr, wy = Math.abs(z - bz0) - (BEZ.hd - BEZ.rr);
    return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - BEZ.rr;
  };
  const bezGeo = meshSDF(sdBezFlat, new THREE.Vector3(0, BEZ.cy, bz0), new THREE.Vector3(BEZ.hw, BEZ.hh, BEZ.hd), 1.2, 192, 128,
    (p, n) => {
      const e = 1e-3;
      n.set(
        sdBezFlat(p.x + e, p.y, p.z) - sdBezFlat(p.x - e, p.y, p.z),
        sdBezFlat(p.x, p.y + e, p.z) - sdBezFlat(p.x, p.y - e, p.z),
        sdBezFlat(p.x, p.y, p.z + e) - sdBezFlat(p.x, p.y, p.z - e),
      ).normalize();
    });
  {
    // bend it onto the face: z += zf(x, y) − zf(centre); normals by the inverse-transpose
    const pos = bezGeo.attributes.position, nrm = bezGeo.attributes.normal, e = 2e-3;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const b = zf(x, y) + BEZ.lift - bz0;
      const bx = (zf(x + e, y) - zf(x - e, y)) / (2 * e), by = (zf(x, y + e) - zf(x, y - e)) / (2 * e);
      pos.setZ(i, pos.getZ(i) + b);
      const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
      const v = new THREE.Vector3(nx - bx * nz, ny - by * nz, nz).normalize();
      nrm.setXYZ(i, v.x, v.y, v.z);
    }
  }
  // Bezel: fully metallic, satin finish (roughness 0.36 — mirror chrome read too hard). A metal shows only what it reflects,
  // so it gets its own bright chrome-studio environment (see chromeEnvironment;
  // main.js bakes it and hands it over through setMetalEnv) instead of the dim
  // satin-ball studio the rest of the scene uses.
  const bezMat = new THREE.MeshPhysicalMaterial({ color: 0xeef0f6, metalness: 1, roughness: 0.36, envMapIntensity: 1.1 });   // satin-brushed, not mirror
  const bezel = new THREE.Mesh(bezGeo, bezMat);
  group.add(bezel);

  // ── screen: a grid patch lying on the bezel front, face drawn on a canvas ──
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SW * SC; screenCanvas.height = SH * SC;
  const sctx = screenCanvas.getContext('2d');
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 8;
  const scrGeo = new THREE.PlaneGeometry(2 * SCR.hw, 2 * SCR.hh, 138, 93);
  {
    const pos = scrGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) + SCR.cy;
      pos.setXYZ(i, x, y, zf(x, y) + BEZ.lift + BEZ.hd + 0.002);
    }
    scrGeo.computeVertexNormals();
  }
  const scrMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000, map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, alphaTest: 0.5,
    roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.18, specularIntensity: 0.15,
  });
  // Retro-TV scanlines (Figma: 3 px black 35% every 8 px from y 5), animated in
  // the screen shader so the face canvas needn't redraw:
  //   • the lines crawl down CRT.crawl px/s
  //   • a soft refresh bar rolls top → bottom every CRT.roll s, brightening the
  //     picture and thinning the lines as it passes
  //   • a faint brightness flicker
  // All blended in sRGB space over the emitted screen colour, like the Figma layers.
  const CRT = { pitch: 8, line: 3, dark: 0.35, crawl: 14, roll: 3.2, barH: 9, barGain: 0.07, flicker: 0.025 };
  const crtU = { uScroll: { value: 0 }, uBarY: { value: -30 }, uFlicker: { value: 1 } };
  scrMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, crtU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uScroll, uBarY, uFlicker;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float py = (1.0 - vEmissiveMapUv.y) * ${SH.toFixed(1)};                 // screen px, y down
  float bar = exp(-pow((py - uBarY) / ${CRT.barH.toFixed(1)}, 2.0));      // rolling refresh bar
  float ly = mod(py - 5.0 - uScroll, ${CRT.pitch.toFixed(1)});
  float aa = fwidth(py);
  float line = smoothstep(-aa, aa, ly) * (1.0 - smoothstep(${CRT.line.toFixed(1)} - aa, ${CRT.line.toFixed(1)} + aa, ly));
  vec3 srgb = pow(max(totalEmissiveRadiance, 0.0), vec3(1.0 / 2.2));
  srgb *= 1.0 - ${CRT.dark.toFixed(2)} * line * (1.0 - 0.55 * bar);
  srgb += ${CRT.barGain.toFixed(3)} * bar;
  srgb *= uFlicker;
  totalEmissiveRadiance = pow(max(srgb, 0.0), vec3(2.2));
}`);
  };
  const screen = new THREE.Mesh(scrGeo, scrMat);
  group.add(screen);

  // ── ear lenses (the pods themselves are part of the head mesh, see sdBody) ──
  const silverMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe3f2, roughness: 0.22, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.06 });
  const lightMat = new THREE.MeshPhysicalMaterial({ color: 0x1a142e, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 });
  const zAxis = new THREE.Vector3(0, 0, 1);
  // Lens parts are moulded onto the pod rather than stuck on: every vertex is
  // laid out on an ellipse in the lens plane, dropped onto the pod's curved
  // surface along the lens axis, then raised by a cross-section profile
  // (px, along the pod's normal). Rings share their seam vertex, so normals are
  // smooth all the way round.
  //   rim:   rounded silver bead, outer 25 × 55 → inner 15 × 40 (Figma "Rim"),
  //          rising out of the pod and dropping into the recess
  //   glass: dark, slightly domed lens sat in the recess (Figma "Light · off")
  const LENS = { ao: 12.5, bo: 27.5, ai: 7.5, bi: 20, bead: 3.6, recess: 0.45, seg: 128 };   // recess: glass edge height above the pod (px), below the bead top
  function lensGeometry(at, axis, rows, centre = null) {
    const u = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), axis).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    const q = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
    const sd = (P) => sdBody(P.x, P.y, P.z);          // the fused head + pod surface (fillet included)
    const place = (ex, ey, hPx, out) => {
      q.copy(at).addScaledVector(u, ex * PX).addScaledVector(v, ey * PX);
      let lo = -0.2, hi = 0.2;                       // onto the pod along the lens axis
      for (let k = 0; k < 32; k++) {
        const mid = (lo + hi) / 2;
        p.copy(q).addScaledVector(axis, mid);
        if (sd(p) < 0) lo = mid; else hi = mid;
      }
      p.copy(q).addScaledVector(axis, (lo + hi) / 2);
      gradBody(p.x, p.y, p.z, n);
      out.push(p.x + n.x * hPx * PX, p.y + n.y * hPx * PX, p.z + n.z * hPx * PX);
    };
    const pos = [], idx = [], S = LENS.seg;
    if (centre) place(0, 0, centre, pos);
    for (const r of rows) {
      for (let i = 0; i < S; i++) {
        const t = (i / S) * Math.PI * 2;
        place(Math.cos(t) * r.a, Math.sin(t) * r.b, r.h, pos);
      }
    }
    const base = centre ? 1 : 0;
    if (centre) for (let i = 0; i < S; i++) idx.push(0, 1 + i, 1 + ((i + 1) % S));
    for (let j = 0; j < rows.length - 1; j++) {
      for (let i = 0; i < S; i++) {
        const a = base + j * S + i, b = base + j * S + ((i + 1) % S);
        const c = base + (j + 1) * S + i, d = base + (j + 1) * S + ((i + 1) % S);
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // keep the faces pointing out of the pod whichever way round the rings wound
    // (judged on a ring halfway across the part — the rim's first ring is its
    // inner wall, whose normal faces sideways and can't tell)
    const nr = g.attributes.normal;
    const mid = base + Math.floor(rows.length / 2) * S;
    if (new THREE.Vector3(nr.getX(mid), nr.getY(mid), nr.getZ(mid)).dot(axis) < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    return g;
  }
  const rimRows = () => {
    const rows = [];
    // inner wall: from the recess floor up to the bead's inner shoulder
    const T0 = 0.45, W = 0.55;
    const bead = (t) => LENS.bead * Math.sqrt(Math.max(0, 1 - ((t - T0) / W) ** 2));
    rows.push({ a: LENS.ai * 0.995, b: LENS.bi * 0.995, h: LENS.recess - 0.2 });
    rows.push({ a: LENS.ai, b: LENS.bi, h: bead(0) * 0.55 });
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      rows.push({ a: LENS.ai + (LENS.ao - LENS.ai) * t, b: LENS.bi + (LENS.bo - LENS.bi) * t, h: k === 16 ? -0.4 : bead(t) });
    }
    return rows;
  };
  const glassRows = () => {
    const rows = [];
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      rows.push({ a: LENS.ai * 0.985 * t, b: LENS.bi * 0.985 * t, h: LENS.recess + 1.1 * (1 - t * t) });
    }
    return rows;
  };
  for (const side of [-1, 1]) {
    // lens on the outer front of the pod, turned ~23° out: Figma rim 25 × 55 centred 105 px out, inset in the pod
    const a = EAR.lensAng;
    const axis = new THREE.Vector3(side * Math.sin(a), 0, Math.cos(a) / EAR.depth).normalize();
    const at = new THREE.Vector3(side * EAR.x + side * Math.sin(a) * EAR.r, EAR.y, Math.cos(a) * EAR.r * EAR.depth);
    group.add(new THREE.Mesh(lensGeometry(at, axis, rimRows()), silverMat));
    group.add(new THREE.Mesh(lensGeometry(at, axis, glassRows(), LENS.recess + 1.1), lightMat));
  }

  // (the Figma forehead rails and all bolts were removed on request)

  // ── face drawing (screen canvas) ──
  const X = (x) => (SW / 2 + x) * SC, Y = (y) => (SH / 2 + y) * SC;
  const GREEN = [92, 255, 79], RED = [255, 72, 64];
  const mixRGB = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function strokePts(pts, w) {
    sctx.lineWidth = w * SC;
    sctx.beginPath();
    pts.forEach(([x, y], i) => (i ? sctx.lineTo(X(x), Y(y)) : sctx.moveTo(X(x), Y(y))));
    sctx.stroke();
  }
  function glowStroke(pts, w, col) {
    sctx.save();
    sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    sctx.strokeStyle = rgba(col, 1);
    sctx.shadowColor = rgba(col, 0.5); sctx.shadowBlur = 40 * SC * 0.5;
    strokePts(pts, w);
    sctx.shadowColor = rgba(col, 0.9); sctx.shadowBlur = 15 * SC * 0.5;
    strokePts(pts, w);
    sctx.shadowColor = 'transparent';
    sctx.strokeStyle = rgba(mixRGB(col, [255, 255, 255], 0.75), 0.9);   // hot core
    strokePts(pts, w * 0.38);
    sctx.restore();
  }
  function drawFace(spec, open = 1) {
    const W = SW * SC, Hh = SH * SC;
    sctx.clearRect(0, 0, W, Hh);
    sctx.save();
    screenPath(sctx);
    sctx.clip();
    // glass: #2b2945 → #080512
    const bg = sctx.createLinearGradient(0, 0, 0, Hh);
    bg.addColorStop(0, '#2b2945'); bg.addColorStop(1, '#080512');
    sctx.fillStyle = bg;
    sctx.fillRect(0, 0, W, Hh);
    const col = mixRGB(GREEN, RED, spec.flush || 0);

    if (spec.flush > 0.01) {                         // angry: the screen flushes red
      sctx.save();
      sctx.globalAlpha = spec.flush;
      sctx.filter = `blur(${14 * SC}px)`;
      sctx.fillStyle = 'rgba(255,50,40,0.28)';
      sctx.beginPath(); sctx.ellipse(X(0), Y(4), 60 * SC, 30 * SC, 0, 0, Math.PI * 2); sctx.fill();
      sctx.restore();
    }
    if (spec.cheeks > 0.01) {                        // greeting blush, as pink light
      sctx.save();
      sctx.globalAlpha = spec.cheeks;
      sctx.filter = `blur(${4 * SC}px)`;
      sctx.fillStyle = 'rgba(255,120,190,0.6)';
      for (const cx of [-45, 45]) { sctx.beginPath(); sctx.ellipse(X(cx), Y(19), 11 * SC, 6 * SC, 0, 0, Math.PI * 2); sctx.fill(); }
      sctx.restore();
    }
    if (spec.mouth.w > 0.05) glowStroke(spec.mouth.a, spec.mouth.w, col);

    const k = spec.glint;                            // "pill-ness": the round Figma eye
    for (const e of spec.eyes) {
      const all = e.a.concat(e.b);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (k > 0.5) {
        // Figma eye: ellipse w × (len + w), radial #d9ffd2 → #5cff4f (55%) → #2fc423
        const sq = THREE.MathUtils.lerp(1, Math.max(open, 5 / 38), spec.blink);
        const rx = e.w / 2, ry = ((y1 - y0) + e.w) / 2 * sq;
        sctx.save();
        sctx.translate(X(cx), Y(cy));
        const g = sctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, rgba(mixRGB([217, 255, 210], [255, 214, 210], spec.flush || 0), 1));
        g.addColorStop(0.55, rgba(col, 1));
        g.addColorStop(1, rgba(mixRGB([47, 196, 35], [196, 40, 35], spec.flush || 0), 1));
        const blob = (glowA, blur) => {
          sctx.save();
          sctx.shadowColor = rgba(col, glowA); sctx.shadowBlur = blur * SC * 0.5;
          sctx.scale(rx * SC, ry * SC);
          sctx.fillStyle = g;
          sctx.beginPath(); sctx.arc(0, 0, 1, 0, Math.PI * 2); sctx.fill();
          sctx.restore();
        };
        blob(0.5, 40);
        blob(0.9, 15);
        sctx.restore();
      } else {
        const widths = [e.w, THREE.MathUtils.lerp(e.w, 6, spec.brow || 0)];
        const same = e.a.every((p, i) => Math.abs(p[0] - e.b[i][0]) + Math.abs(p[1] - e.b[i][1]) < 0.01);
        (same ? [e.a] : [e.a, e.b]).forEach((pts, si) => glowStroke(pts, widths[si], col));
      }
    }

    // (scanlines are animated in the screen shader — see CRT)
    // (the Figma glare band was removed on request)
    // reflection: top 40 px, white 14% → 0
    const rf = sctx.createLinearGradient(0, 0, 0, 40 * SC);
    rf.addColorStop(0, 'rgba(255,255,255,0.14)'); rf.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = rf;
    sctx.fillRect(0, 0, W, 40 * SC);
    // inner shadows: black 85% y +9 blur 14, white 8% y −1 blur 2
    const inner = (color, dy, blur) => {
      sctx.save();
      sctx.shadowColor = color; sctx.shadowOffsetY = dy * SC; sctx.shadowBlur = blur * SC * 0.5;
      sctx.beginPath();
      sctx.rect(-W, -Hh, 3 * W, 3 * Hh);
      sctx.roundRect(0, 0, W, Hh, 30 * SC);
      sctx.fillStyle = '#000';
      sctx.fill('evenodd');
      sctx.restore();
    };
    inner('rgba(0,0,0,0.85)', 9, 14);
    inner('rgba(255,255,255,0.08)', -1, 2);
    sctx.restore();
    screenTex.needsUpdate = true;
  }

  // ── shadows (Figma): head #05001a 40% y +44 blur 60; ears #1a004d 35% y +10 blur 15 ──
  function headOutline(ctx, k) {
    const w = 2 * HEAD.hw * k, h = 2 * HEAD.hh * k;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, [HEAD.rTop * k, HEAD.rTop * k, HEAD.rBot * k, HEAD.rBot * k]);
  }
  const shadows = [
    {
      dy: 44 * PX,
      draw(ctx, k) {
        ctx.filter = `blur(${30 * PX * k}px)`;
        ctx.fillStyle = 'rgba(5,0,26,0.4)';
        headOutline(ctx, k);
        ctx.fill();
      },
    },
    {
      dy: 10 * PX,
      draw(ctx, k) {
        ctx.filter = `blur(${7.5 * PX * k}px)`;
        ctx.fillStyle = 'rgba(26,0,77,0.35)';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.roundRect(side * EAR.x * k - EAR.r * k, -EAR.y * k - 40 * PX * k, 2 * EAR.r * k, 80 * PX * k, EAR.r * k);
          ctx.fill();
        }
      },
    },
  ];

  return {
    group,
    screenCanvas,
    drawFace,
    shadows,
    bottom: HEAD.hh,                             // head bottom below the origin (sits on the floor when asleep)
    top: HEAD.hh,
    palette: pal,
    // neutral-cool studio light (Orbi's is warm): keeps the silver silver
    lights: { key: 0xffffff, sky: 0xf4f2ff, ground: 0x4c4466, rim: 0xeeeaff },
    chromeEnvironment,
    update(t) {                                  // retro-TV scanlines: crawl, refresh bar, flicker
      crtU.uScroll.value = (t * CRT.crawl) % CRT.pitch;
      crtU.uBarY.value = -30 + ((t / CRT.roll) % 1) * (SH + 60);
      crtU.uFlicker.value = 1 + CRT.flicker * Math.sin(t * 47) * Math.sin(t * 13.3);
    },
    setMetalEnv(tex) { bezMat.envMap = tex; bezMat.needsUpdate = true; },
    setPalette(p) { for (const k in p) if (pal[k]) pal[k].value.copy(p[k]); },
  };
}

// Figma "Speckles": [cx, cy, diameter, opacity] in head px (200 × 190)
const SPECKLES = [[145.6,165.9,1.33,0.36],[93,163.8,2.6,0.54],[158.5,165.9,1.44,0.63],[82.4,31.2,1.37,0.72],[127,29.9,2.21,0.52],[127.5,174.1,1.25,0.67],[193.2,108.5,2.69,0.35],[82.6,168.2,2.43,0.4],[90.9,34.2,2.66,0.48],[184.1,97.4,1.47,0.33],[73.1,17.7,1.95,0.66],[138.6,169.8,1.58,0.33],[139.9,35.3,1.46,0.53],[13.4,131.5,2.09,0.62],[86.8,164.6,2.94,0.58],[171.6,38.8,2.78,0.3],[9.1,90.6,2.43,0.29],[53.2,167.5,3.11,0.56],[35.3,160.6,2.65,0.63],[158.6,156.8,1.29,0.34],[8.1,110.9,2.99,0.53],[21,121,2.09,0.45],[89,40.4,2.54,0.51],[116.9,179.8,1.87,0.23],[187.2,109.5,2.57,0.32],[195.6,91.6,1.81,0.48],[149.8,19.3,1.83,0.42],[39.1,158.8,1.94,0.72],[88.9,27.7,3.03,0.23],[144.5,168.9,2.67,0.56],[10.2,106.2,3.24,0.23],[83.7,17.7,1.87,0.4],[133.9,38.2,3.33,0.66],[66.7,40.2,1.27,0.3],[183.2,128.9,2.79,0.69],[135.1,40,1.21,0.24],[11,86.3,2.68,0.53],[132.9,18.2,2.44,0.68],[181.4,48.7,2.52,0.24],[85.3,182.7,3.01,0.7],[72,24,1.58,0.34],[183.1,139.5,2.65,0.64],[122.3,165.4,1.49,0.45],[119.2,36.5,3.14,0.58],[76.7,29.7,3.07,0.33],[126.5,9.6,2.12,0.33],[188.3,134.9,2.83,0.63],[9.1,94.9,1.98,0.41],[108.2,167.7,1.48,0.34],[65.6,26.2,2.08,0.47],[88.3,172.2,2.2,0.58],[12.4,89.8,2.18,0.71],[124.2,177.1,3.03,0.66],[140.1,159.7,2.67,0.23],[107.3,32.5,2.51,0.54],[100.6,174.8,2.6,0.64],[11,83.3,2.5,0.22],[80,39.9,1.99,0.24],[8.6,113.8,1.71,0.35],[118.1,166.9,1.26,0.59],[143.7,33.9,1.66,0.32],[79.8,157.5,1.66,0.42],[112.6,18.7,3.05,0.37],[60.3,38.1,2.81,0.29],[138.8,170.9,1.87,0.38],[57.3,160.7,2.51,0.44],[190.7,70.4,1.61,0.47],[64.5,35.6,3.06,0.57],[115,17.9,1.67,0.45],[148,163.7,3.21,0.51],[95.4,180.8,1.74,0.44],[122.6,165.5,1.44,0.24],[91.8,179.6,2.99,0.25],[82.6,31.1,3.32,0.41],[155.8,21.6,3.27,0.53],[97.2,10,2.54,0.43],[16.9,61.1,2.01,0.45],[109.6,184.8,3.15,0.44],[144.4,16.7,1.66,0.67],[77,172.4,1.8,0.59],[132.4,33.2,2.88,0.63],[147.6,161.3,1.98,0.4],[60.3,164.7,2.01,0.51],[102.7,180.1,2.76,0.68],[93,17.8,2.97,0.54],[98.2,23.1,1.54,0.3],[86.8,18.3,2.55,0.7],[60.5,18.9,1.39,0.54],[169.9,41,2.86,0.53],[139.2,41.4,2.92,0.63]];
