// "Orbi Soft Helmet" (Figma 1044:1770, used in 1060:79394) built 1:1 in 3D.
//
// Every shape comes from the component's SVG export, in its own coordinate
// space (328×328 viewBox; the ball's centre is at 164,158 and its radius is
// 120 → 1 unit). The front view is the Figma drawing:
//   • Shell     — the outer outline is revolved around the vertical axis, so
//                 its silhouette from the front is exactly the Figma outline.
//   • Artwork   — yellow crown, black outline, reflective strip, flap swooshes
//                 and the noon wordmark are drawn from the SVG paths into a
//                 canvas that is projected front-to-back onto the shell.
//   • Opening   — the inner cut-out (face opening + rounded flap ends) is the
//                 same SVG path, used as a discard mask on the front half.
//   • Liner, stitch, visor and snaps follow their SVG curves, lifted onto the
//                 shell surface.

import * as THREE from 'three';

const PX = 120;                        // SVG px per unit
const CX = 164, CY = 158;              // ball centre in SVG coordinates
const VB = 328;                        // viewBox size
const toXY = (x, y) => [(x - CX) / PX, (CY - y) / PX];

// ─── tiny SVG path sampler (M/L/H/V/C, absolute only) ─────────────────────
function samplePath(d, perCurve = 24) {
  const tok = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const pts = [];
  let i = 0, cmd = '', x = 0, y = 0;
  const num = () => parseFloat(tok[i++]);
  // straight runs are subdivided too, so a spline through the points
  // doesn't overshoot where a long line meets a densely sampled curve
  const line = (nx, ny) => {
    for (let k = 1; k <= perCurve; k++) pts.push([x + (nx - x) * (k / perCurve), y + (ny - y) * (k / perCurve)]);
    x = nx; y = ny;
  };
  while (i < tok.length) {
    if (/[A-Z]/i.test(tok[i])) cmd = tok[i++];
    if (cmd === 'Z') continue;
    if (cmd === 'M') { x = num(); y = num(); pts.push([x, y]); }
    else if (cmd === 'L') { const nx = num(), ny = num(); line(nx, ny); }
    else if (cmd === 'H') line(num(), y);
    else if (cmd === 'V') line(x, num());
    else if (cmd === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      for (let k = 1; k <= perCurve; k++) {
        const t = k / perCurve, u = 1 - t;
        pts.push([
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      x = x3; y = y3;
    }
  }
  return pts;
}

// ─── Figma paths ──────────────────────────────────────────────────────────
const P = {
  // left half of the outer outline, top → flap bottom
  outerLeft: 'M164 8C84 8 18 62 18 138C18 164 19 184 22 204C23 216 30 224 42 224',
  // the cut-out: face opening + rounded inner flap ends, closed below
  cut: 'M42 224C54 224 62 216 62 202V158C62 124 86 104 122 102H206C242 104 266 124 266 158V202C266 216 274 224 286 224L286 400L42 400Z',
  // Graphics follow the Figma layout but with the hard corners eased out:
  // the crown edge's two kinks become S-curves, the strip is a true parallel
  // offset of that edge, and the flap swooshes are curved, round-ended bands.
  crown: 'M-60 -60H388V150H316C294 150 286 112 256 112H72C42 112 34 150 12 150H-60Z',
  crownEdge: 'M-60 150H12C34 150 42 112 72 112H256C286 112 294 150 316 150H388',
  swooshL: 'M8 229C27 218 45 204 66 184',
  swooshR: 'M320 229C301 218 283 204 262 184',
  liner: 'M62 196V158C62 124 86 104 122 102H206C242 104 266 124 266 158V196',
  visorTop: 'M50 50C76 20 122 10 164 10C206 10 252 20 278 50',
  visorBottom: 'M56 68C82 44 122 34 164 34C206 34 246 44 272 68',
  wordmark: [
    'M186.063 67.8687C186.063 65.9763 187.343 64.0567 189.789 64.0567C191.7 64.0567 192.843 65.3923 192.843 67.6243V76.7604H197V67.3209C197 62.8751 194.398 60.0002 190.37 60.0002C188.518 60.0002 186.84 60.5979 185.546 61.6935L185.176 60.3941H181.911V76.7559H186.067V67.8642L186.063 67.8687Z',
    'M155.246 60.0039C150.587 60.0039 146.938 63.7616 146.938 68.5651C146.938 73.3686 150.587 77.1263 155.246 77.1263C159.905 77.1263 163.554 73.364 163.554 68.5651C163.554 63.7661 159.905 60.0039 155.246 60.0039ZM155.246 73.0698C152.873 73.0698 151.154 71.1728 151.154 68.5606C151.154 65.9483 152.873 64.0559 155.246 64.0559C157.619 64.0559 159.338 65.9528 159.338 68.5606C159.338 71.1683 157.619 73.0698 155.246 73.0698Z',
    'M135.152 67.8679C135.152 65.9755 136.432 64.0559 138.878 64.0559C140.789 64.0559 141.932 65.3914 141.932 67.6234V76.7595H146.088V67.3201C146.088 62.8788 143.487 60.0039 139.459 60.0039C137.607 60.0039 135.929 60.6015 134.635 61.6971L134.265 60.3978H131V76.7595H135.156V67.8679H135.152Z',
    'M172.748 60.0039C168.089 60.0039 164.44 63.7616 164.44 68.5651C164.44 73.3686 168.089 77.1263 172.748 77.1263C177.407 77.1263 181.056 73.364 181.056 68.5651C181.056 63.7661 177.412 60.0039 172.748 60.0039ZM172.748 73.0698C170.375 73.0698 168.656 71.1728 168.656 68.5606C168.656 65.9483 170.38 64.0559 172.748 64.0559C175.117 64.0559 176.84 65.9528 176.84 68.5606C176.84 71.1683 175.117 73.0698 172.748 73.0698Z',
  ],
};

// ─── procedural surface detail (GLSL) ─────────────────────────────────────
// Everything is evaluated in object space, so there is no UV stretching on the
// lathe pole or the tubes. Height fields are turned into normal perturbations
// with screen-space derivatives (the same trick as three's bump mapping).
export const SURFACE_GLSL = `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.3 + vnoise(p * 4.01) * 0.2; }
vec2 cell3(vec3 p) {            // F1, F2 of a Worley field
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(hash13(i + g), hash13(i + g + 17.1), hash13(i + g + 41.7));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}
vec3 bumpN(vec3 n, float h) {    // h in object (= view) units
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}`;

// Figma "Shell" outline (with the face notch), for the 2D drop shadow
export const SHELL_PATH = 'M62 202V158C62 124 86 104 122 102H206C242 104 266 124 266 158V202C266 216 274 224 286 224C298 224 305 216 306 204C309 184 310 164 310 138C310 62 244 8 164 8C84 8 18 62 18 138C18 164 19 184 22 204C23 216 30 224 42 224C54 224 62 216 62 202Z';

// ─── shell profile (revolved outline) ─────────────────────────────────────
const profile = samplePath(P.outerLeft, 90).map(([x, y]) => toXY(x, y)).map(([X, Y]) => [Math.abs(X), Y]);
profile[0][0] = 0; // pole
// radius of the shell at height Y (profile is monotonic in Y)
function rAt(Y) {
  if (Y >= profile[0][1]) return 0;
  for (let i = 1; i < profile.length; i++) {
    const [r1, y1] = profile[i - 1], [r2, y2] = profile[i];
    if (Y <= y1 && Y >= y2) return r1 + (r2 - r1) * ((y1 - Y) / (y1 - y2 || 1));
  }
  return profile[profile.length - 1][0];
}
const zShell = (X, Y) => Math.sqrt(Math.max(0, rAt(Y) ** 2 - X * X));

// The reflective strip: the crown edge offset 4px along its normal (Figma
// spacing), so the gap stays even through the curves.
function stripPath() {
  const pts = samplePath(P.crownEdge, 48);
  const p = new Path2D();
  pts.forEach(([x, y], i) => {
    const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const tx = bx - ax, ty = by - ay, l = Math.hypot(tx, ty) || 1;
    const ox = x - (ty / l) * 4, oy = y + (tx / l) * 4;      // normal pointing down/out
    if (i) p.lineTo(ox, oy); else p.moveTo(ox, oy);
  });
  return p;
}
function strokeRound(ctx, d, width, style) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke(d instanceof Path2D ? d : new Path2D(d));
  ctx.restore();
}

// Back logo: the same wordmark glyphs, white, centred in the black band on the
// back. The back half samples the art by front-view X, so it is drawn mirrored
// to read correctly from behind.
const BACK_LOGO = { cy: 166, scale: 1.6 };
function drawBackLogo(ctx, fill) {
  ctx.save();
  ctx.translate(CX, BACK_LOGO.cy);
  ctx.scale(-BACK_LOGO.scale, BACK_LOGO.scale);
  ctx.translate(-CX, -68.56);                       // wordmark bbox centre (131–197, 60–77.1)
  ctx.fillStyle = fill;
  P.wordmark.forEach(d => ctx.fill(new Path2D(d)));
  ctx.restore();
}

// ─── artwork canvases (SVG space → texture) ───────────────────────────────
const S = 6;
function svgCanvas(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = VB * S;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  draw(ctx);
  return c;
}
function artCanvas(withWordmark) {
  return svgCanvas((ctx) => {
    ctx.fillStyle = '#161616';                        // shell black
    ctx.fillRect(-60, -60, VB + 120, VB + 120);
    ctx.fillStyle = '#FEEE00';                        // yellow crown
    ctx.fill(new Path2D(P.crown));
    strokeRound(ctx, P.crownEdge, 1, '#000');
    const g = ctx.createLinearGradient(4, 0, 324, 0); // reflective strip
    [[0, '#8E949E'], [0.3, '#E9ECF0'], [0.5, '#FFFFFF'], [0.7, '#C3C8D0'], [1, '#7C828C']].forEach(([o, c]) => g.addColorStop(o, c));
    strokeRound(ctx, stripPath(), 5, g);
    for (const d of [P.swooshL, P.swooshR]) {          // flap swooshes: 1px black keyline
      strokeRound(ctx, d, 12, '#000');
      strokeRound(ctx, d, 10, '#FEEE00');
    }
    if (withWordmark) {
      ctx.fillStyle = '#000';
      P.wordmark.forEach(d => ctx.fill(new Path2D(d)));
    } else {
      drawBackLogo(ctx, '#FFFFFF');
    }
  });
}
// R = reflective-strip mask, G = cut-out mask, B = wordmark decal
function maskCanvas() {
  return svgCanvas((ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(-60, -60, VB + 120, VB + 120);
    strokeRound(ctx, stripPath(), 5, '#f00');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#0f0';
    ctx.fill(new Path2D(P.cut));
    ctx.fillStyle = '#00f';
    P.wordmark.forEach(d => ctx.fill(new Path2D(d)));
    drawBackLogo(ctx, '#00f');
  });
}
function tex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ─── shell ────────────────────────────────────────────────────────────────
function buildShell() {
  // bottom → top so the lathe's faces point outward
  const lathe = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 320);
  const mat = new THREE.MeshPhysicalMaterial({
    roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.14, side: THREE.DoubleSide,
  });
  const uniforms = {
    artFront: { value: tex(artCanvas(true), true) },
    artBack: { value: tex(artCanvas(false), true) },
    maskMap: { value: tex(maskCanvas(), false) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D artFront, artBack, maskMap;
varying vec3 vObj;
float metalMask = 0.0;
${SURFACE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 auv = vec2((vObj.x * ${PX}.0 + ${CX}.0) / ${VB}.0, 1.0 - (${CY}.0 - vObj.y * ${PX}.0) / ${VB}.0);
vec4 mk = texture2D(maskMap, auv);
if (vObj.z > 0.0 && mk.g > 0.5) discard;
vec3 art = vObj.z > 0.0 ? texture2D(artFront, auv).rgb : texture2D(artBack, auv).rgb;
metalMask = gl_FrontFacing ? mk.r : 0.0;
// decal mask holds both logos at different heights: front wordmark high, back logo low
float decal = !gl_FrontFacing ? 0.0 : (vObj.z > 0.0 ? mk.b * step(0.5, vObj.y) : mk.b * step(vObj.y, 0.3));
diffuseColor.rgb = gl_FrontFacing ? art : vec3(0.025);
// paint detail: orange peel (in the clear coat) + soft handling smudges
float peel = vnoise(vObj * 34.0) * 0.7 + vnoise(vObj * 61.0) * 0.3;
float smudge = smoothstep(0.35, 0.8, fbm3(vObj * 3.2 + 7.0));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// the white back logo is printed ink: keep it reading white on the shaded back
totalEmissiveRadiance += (vObj.z < 0.0 ? decal : 0.0) * art * 0.16;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.35, metalMask);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.26, metalMask);
roughnessFactor += smudge * 0.12;
roughnessFactor = mix(roughnessFactor, 0.48, decal);           // printed vinyl reads satin
if (!gl_FrontFacing) roughnessFactor = 0.9;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (gl_FrontFacing) {
  // base coat: faint peel; reflective tape: raised edge + micro-prism grid; decal: raised edge
  vec2 sp = vObj.xy * ${PX}.0 * 0.55;
  float prism = abs(fract(sp.x + sp.y) - 0.5) + abs(fract(sp.x - sp.y) - 0.5);
  float h = peel * 0.00008 * (1.0 - metalMask)
          + metalMask * (0.0007 + prism * 0.00045)
          + decal * 0.0004;
  normal = bumpN(normal, h);
}`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
if (gl_FrontFacing) clearcoatNormal = bumpN(clearcoatNormal, peel * 0.00022 + decal * 0.0003);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
if (!gl_FrontFacing) { material.clearcoat = 0.0; material.specularColorBlended *= 0.15; material.specularF90 = 0.0; }
material.clearcoatRoughness = min(1.0, material.clearcoatRoughness + smudge * 0.1 + decal * 0.12);`);
  };
  // helmet-on-ball shading is an analytic occlusion term in the ball shader
  return new THREE.Mesh(lathe, mat);
}

// Rolled edge bead along the shell's whole free edge (face opening + flap
// ends + bottom rim), so no paper-thin edge shows anywhere and the hard
// discard edge of the opening is covered.
function buildEdgeBead() {
  const front = samplePath('M42 224C54 224 62 216 62 202V158C62 124 86 104 122 102H206C242 104 266 124 266 158V202C266 216 274 224 286 224', 40)
    .map(([x, y]) => { const [X, Y] = toXY(x, y); return new THREE.Vector3(X, Y, zShell(X, Y)); });
  const [rb, yb] = profile[profile.length - 1];
  const back = [];
  for (let i = 1; i < 160; i++) {
    const phi = Math.PI / 2 + Math.PI * (i / 160);          // right side → around the back → left side
    back.push(new THREE.Vector3(rb * Math.sin(phi), yb, rb * Math.cos(phi)));
  }
  const loop = [...front, ...back].filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-4);
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true, 'centripetal'), 1400, 0.016, 16, true),
    new THREE.MeshPhysicalMaterial({ color: 0x0e0e0e, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.25 }),
  );
}

// ─── liner + stitch ───────────────────────────────────────────────────────
// SVG curve → 3D: keep the front-view (X, Y) and lift onto the shell.
function liftedCurve(d, dz) {
  const pts = samplePath(d, 30).map(([x, y]) => {
    const [X, Y] = toXY(x, y);
    return new THREE.Vector3(X, Y, zShell(X, Y) + dz);
  });
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

function buildLiner() {
  const g = new THREE.Group();
  const R = 12 / PX;                                  // 24px stroke
  // pad sits a touch proud of the shell, so the shell never z-fights through it
  const curve = liftedCurve(P.liner, -R + 0.03);
  const mat = leatherMaterial();
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 900, R, 40, false), mat);
  g.add(tube);
  for (const t of [0, 1]) {                            // round caps
    // geometry baked in place, so the grain is evaluated in helmet space
    const capGeo = new THREE.SphereGeometry(R, 40, 28);
    const at = curve.getPoint(t);
    capGeo.translate(at.x, at.y, at.z);
    const cap = new THREE.Mesh(capGeo, mat);
    g.add(cap);
  }
  g.add(buildStitch(curve, R));
  return g;
}

// Black padded liner as pebbled leather: Worley creases for the grain, a
// little tonal variation and a soft leather sheen; colour stays #1C1C1C.
function leatherMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x1c1c1c, roughness: 0.62, specularIntensity: 0.5,
    sheen: 0.5, sheenColor: new THREE.Color(0x4a4a4a), sheenRoughness: 0.45,
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
${SURFACE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 c = cell3(vObj * 150.0);
float crease = 1.0 - smoothstep(0.0, 0.16, c.y - c.x);       // valleys between pebbles
float pebble = 1.0 - c.x;
float tone = vnoise(vObj * 22.0);
diffuseColor.rgb *= 0.88 + 0.22 * tone - 0.25 * crease;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + crease * 0.18 - pebble * 0.08 + (tone - 0.5) * 0.1, 0.3, 0.95);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = bumpN(normal, (pebble * 0.6 - crease * 0.4) * 0.0009);`);
  };
  return mat;
}

// Dashed stitch (Figma: 5 on / 5 off, 1.5px, #FEEE00 @ 80%, path stops 6px
// short of the liner ends). Built as real thread: rounded capsule dashes laid
// along the liner's own curve, evenly spaced, sitting on the front of the pad
// (slightly pressed in) instead of a uv-clipped tube buried in its surface.
function buildStitch(curve, linerR) {
  const len = curve.getLength();
  const trim = 6 / PX;
  const r = 0.75 / PX, dash = 5 / PX;
  const run = len - 2 * trim;
  const n = Math.round(run / (10 / PX));          // dash + gap
  const period = run / n;                         // stretch slightly so both ends land on a dash
  const geo = new THREE.CapsuleGeometry(r, dash - 2 * r, 4, 8);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xe9db00, roughness: 0.7, emissive: 0x3a3500,
    sheen: 1, sheenColor: new THREE.Color(0xfff6a0), sheenRoughness: 0.35,   // fibrous thread
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n + 1);
  const front = new THREE.Vector3(0, 0, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const t = new THREE.Vector3(), out = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i <= n; i++) {
    const u = (trim + i * period) / len;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    // the pad's front face: body +z, made perpendicular to the liner here
    out.copy(front).addScaledVector(t, -t.dot(front)).normalize();
    p.addScaledVector(out, linerR - r * 0.35);
    q.setFromUnitVectors(Y, t);                   // capsule axis along the liner
    mesh.setMatrixAt(i, m4.compose(p, q, s));
  }
  mesh.count = n + 1;
  return mesh;
}

// ─── visor + snaps ────────────────────────────────────────────────────────
// Point on the shell at front-view (X, Y), pushed `off` along the true lathe
// normal (∇ of x² + z² − r(y)²), so parts layered on the shell keep an even gap.
function shellPoint(X, Y, off) {
  const z = zShell(X, Y), e = 1e-3;
  const dr = (rAt(Y + e) - rAt(Y - e)) / (2 * e);
  const n = new THREE.Vector3(X, -rAt(Y) * dr, z).normalize();
  return new THREE.Vector3(X, Y, z).addScaledVector(n, off);
}

// Robust projection onto the shell from an interior point (works over the
// crown pole, where recomputing z from (X, Y) breaks down), and the true normal.
const SHELL_TOP = profile[0][1];
const SHELL_C = new THREE.Vector3(0, 0.25, 0);
function projectToShell(Q) {
  const d = Q.clone().sub(SHELL_C).normalize();
  const outside = (t) => {
    const p = SHELL_C.clone().addScaledVector(d, t);
    return p.y >= SHELL_TOP || p.x * p.x + p.z * p.z - rAt(p.y) ** 2 > 0;
  };
  let a = 0, b = 3;
  for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (outside(m)) b = m; else a = m; }
  return SHELL_C.clone().addScaledVector(d, (a + b) / 2);
}
function shellNormalAt(P) {
  const e = 1e-3, dr = (rAt(P.y + e) - rAt(P.y - e)) / (2 * e);
  return new THREE.Vector3(P.x, -rAt(P.y) * dr, P.z).normalize();
}

// Visor pivots — Figma "Snap L/R" centres
const SNAP = toXY(60, 58);
const VISOR = { lift: 0.04, thick: 0.024 };

// Smoked flip-up visor, built like the real part: it hinges on the axis
// through the two snap pivots, so its centre line is the shell cut by a plane
// through that axis (aimed at the Figma visor's centre, X 0 / svg y 22). Along
// that line it is a constant-width band (Figma height 24px at the centre) that
// ends in round tabs centred on each snap — a clean stadium outline from every
// angle. Built as a solid: outer + inner skins and a rounded rim all round.
function buildVisor() {
  const { lift, thick } = VISOR;
  const Xs = Math.abs(SNAP[0]), Ys = SNAP[1], zs = zShell(-Xs, Ys);
  const toPlane = (Y, z) => Math.atan2(Y - Ys, z - zs);
  const [, yMid] = toXY(164, 22), [, yTop] = toXY(164, 10), [, yBot] = toXY(164, 34);
  const th = toPlane(yMid, zShell(0, yMid));
  const sn = Math.sin(th), cs = Math.cos(th);
  // The hinge plane meets the shell in a closed loop through both snaps. Work
  // in plane coordinates (X, t) — t runs from the hinge axis toward the visor —
  // and trace the loop by angle around a point inside it.
  const toWorld = (X, tt) => new THREE.Vector3(X, Ys + tt * sn, zs + tt * cs);
  const f = (X, tt) => { const Y = Ys + tt * sn, z = zs + tt * cs; return X * X + z * z - rAt(Y) ** 2; };
  const firstExit = (ox, ot, dx, dt) => {      // march out to the shell, then bisect
    let a = 0, b = 0;
    for (let k = 1; k < 400; k++) { b = k * 0.01; if (f(ox + dx * b, ot + dt * b) > 0) break; a = b; }
    for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (f(ox + dx * m, ot + dt * m) > 0) b = m; else a = m; }
    return (a + b) / 2;
  };
  const tF = firstExit(0, 0, 0, 1), tB = -firstExit(0, 0, 0, -1);
  const tc = (tF + tB) / 2;
  // the visor arc is the upper side (toward +t): sweep from the left snap,
  // over the top, to the right snap, plus a margin for the round tabs
  const psiR = Math.atan2(-tc, Xs);
  let psiL = Math.atan2(-tc, -Xs);
  if (psiL < psiR) psiL += Math.PI * 2;
  const raw = [];
  for (let i = 0, N = 500; i <= N; i++) {
    const psi = (psiL + 0.45) + ((psiR - 0.45) - (psiL + 0.45)) * (i / N);
    const dx = Math.cos(psi), dt = Math.sin(psi);
    const rho = firstExit(0, tc, dx, dt);
    raw.push(toWorld(dx * rho, tc + dt * rho));
  }
  // half-width: half the 3D distance across the Figma band at the centre
  const W = Math.max(0.085, shellPoint(0, yTop, 0).distanceTo(shellPoint(0, yBot, 0)) / 2);

  const arc = [0];
  for (let i = 1; i < raw.length; i++) arc.push(arc[i - 1] + raw[i].distanceTo(raw[i - 1]));
  const sNear = (P3) => {
    let best = 0, bd = Infinity;
    raw.forEach((q, i) => { const d = q.distanceToSquared(P3); if (d < bd) { bd = d; best = i; } });
    return arc[best];
  };
  const sL = sNear(toWorld(-Xs, 0)), sR = sNear(toWorld(Xs, 0));
  const pointAt = (sv) => {
    for (let i = 1; i < raw.length; i++) if (arc[i] >= sv) {
      const f = (sv - arc[i - 1]) / (arc[i] - arc[i - 1] || 1);
      return raw[i - 1].clone().lerp(raw[i], f);
    }
    return raw[raw.length - 1].clone();
  };
  // stadium half-width along the line: full between the snaps, round past them
  const halfW = (sv) => {
    const d = sv < sL ? sL - sv : sv > sR ? sv - sR : 0;
    return Math.sqrt(Math.max(0, W * W - d * d));
  };

  const cols = 360, rows = 20;
  const outer = [], inner = [], col = [], uv = [], idx = [];
  const cTop = new THREE.Color(0x5b6170).multiplyScalar(0.62), cBot = new THREE.Color(0x14161c);
  const rimTop = [], rimBot = [];
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), L = new THREE.Vector3();
  const s0 = sL - W, s1 = sR + W;
  for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1);
    // denser toward the tabs so the round ends stay round
    const sv = s0 + (s1 - s0) * (0.5 - 0.5 * Math.cos(u * Math.PI));
    const C = pointAt(sv);
    T.copy(pointAt(Math.min(s1, sv + 1e-3))).sub(pointAt(Math.max(s0, sv - 1e-3))).normalize();
    Nn.copy(shellNormalAt(C));
    L.crossVectors(Nn, T).normalize();
    if (L.y < 0) L.negate();                       // v = 0 is the upper edge
    const hw = halfW(sv);
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const P3 = projectToShell(C.clone().addScaledVector(L, (0.5 - v) * 2 * hw));
      const nP = shellNormalAt(P3);
      const o = P3.clone().addScaledVector(nP, lift + thick / 2), n = P3.clone().addScaledVector(nP, lift - thick / 2);
      const k = (j * cols + i) * 3;
      outer[k] = o.x; outer[k + 1] = o.y; outer[k + 2] = o.z;
      inner[k] = n.x; inner[k + 1] = n.y; inner[k + 2] = n.z;
      const c = cTop.clone().lerp(cBot, v);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      uv[(j * cols + i) * 2] = u; uv[(j * cols + i) * 2 + 1] = v;
      if (j === 0) rimTop.push(P3.clone().addScaledVector(nP, lift));
      if (j === rows) rimBot.push(P3.clone().addScaledVector(nP, lift));
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const skin = (positions, flip) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const ix = flip ? idx.slice() : idx;
    if (flip) for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
    geo.setIndex(ix);
    geo.computeVertexNormals();
    return geo;
  };

  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.16, clearcoat: 0.35, clearcoatRoughness: 0.1, specularIntensity: 0.45,
    side: THREE.DoubleSide,
  });
  mat.defines = { USE_UV: '' };
  // dark 1px rim (#0A0B0E @ 60%)
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float e = min(min(vUv.x, 1.0 - vUv.x) * 18.0, min(vUv.y, 1.0 - vUv.y) * 2.2);
diffuseColor.rgb = mix(vec3(0.04), diffuseColor.rgb, smoothstep(0.0, 0.12, e));`)
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
${SURFACE_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
// polycarbonate: soft wipe marks + sparse hairline scratches along the visor
float wipe = smoothstep(0.45, 0.85, fbm3(vObj * vec3(5.0, 9.0, 5.0) + 3.0));
float sc = vnoise(vec3(vUv.x * 900.0, vUv.y * 6.0, 1.7));
float scratch = smoothstep(0.93, 0.99, sc) * step(0.6, vnoise(vObj * 14.0));
roughnessFactor = clamp(roughnessFactor + wipe * 0.12 + scratch * 0.35, 0.05, 0.8);`);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
  };
  const group = new THREE.Group();
  for (const geo of [skin(outer, false), skin(inner, true)]) {
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 5;
    group.add(m);
  }
  // rounded rim: top edge, round the tab, back along the bottom edge
  const loop = [...rimTop, ...rimBot.reverse()].filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 1e-4);
  const rim = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true, 'centripetal'), 1000, thick / 2, 16, true),
    new THREE.MeshPhysicalMaterial({ color: 0x101216, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.1 }),
  );
  rim.renderOrder = 5;
  group.add(rim);
  return group;
}

function buildSnap(x, y) {
  const g = new THREE.Group();
  const [X, Y] = toXY(x, y);
  const base = shellPoint(X, Y, 0);
  const at = shellPoint(X, Y, VISOR.lift + VISOR.thick / 2);   // seated on the visor tab
  g.position.copy(at);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), at.clone().sub(base).normalize());
  const ring = new THREE.Mesh(
    new THREE.SphereGeometry(8 / PX, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    // spun metal: sphere uv runs around the cap axis, so the anisotropic
    // highlight streaks concentrically like a machined stud
    new THREE.MeshPhysicalMaterial({ color: 0xc9cfd6, metalness: 0.9, roughness: 0.32, anisotropy: 0.85 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1, 0.45, 1);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(3.6 / PX, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x9aa3ad, metalness: 0.9, roughness: 0.38, anisotropy: 0.85 }),
  );
  core.rotation.x = Math.PI / 2;
  core.scale.set(1, 0.4, 1);
  core.position.z = 0.032;
  g.add(ring, core);
  return g;
}

// ─── assembly ─────────────────────────────────────────────────────────────
export function createHelmet() {
  const group = new THREE.Group();
  group.name = 'Orbi Soft Helmet';
  group.add(buildShell(), buildEdgeBead(), buildLiner(), buildVisor(), buildSnap(60, 58), buildSnap(268, 58));
  return group;
}
