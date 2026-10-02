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

// Front wordmark: the Figma glyphs, nudged 10px up from their Figma spot
// (user request) — the decal mask uses the same offset.
const WORDMARK_DY = -10;
function drawFrontWordmark(ctx, fill) {
  ctx.save();
  ctx.translate(0, WORDMARK_DY);
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
      drawFrontWordmark(ctx, '#000');
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
    drawFrontWordmark(ctx, '#00f');
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

// ─── crown plate ─────────────────────────────────────────────────────────
// A thin gloss-black plate across the crown front: the Figma visor band's
// footprint (its outline follows the shell cut by a plane through the two
// Figma snap points, constant Figma-band width, round ends centred on the
// snaps), now a solid fixed part sitting close on the shell, with a moulded
// rounded edge and the two snap studs. The glass visor clears it when raised.
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

// Figma "Snap L/R" centres
const SNAP = toXY(60, 58);
// shift: rad the whole plate (ends + snaps) is moved back over the crown,
//        about the x axis, then re-projected onto the shell
// back:  extra rad the centre is tipped back relative to the ends
const PLATE = { lift: 0.012, thick: 0.016, shift: 0.5, back: 0.2, scale: 1.55, snapScale: 1.3 };   // scale: band width/tabs vs the Figma band; snapScale: studs
const PLATE_PIVOT_Y = 0.05;
function shiftBack(v) {                               // rotate a front point back over the crown
  const a = -PLATE.shift, y = v.y - PLATE_PIVOT_Y;
  return new THREE.Vector3(v.x, y * Math.cos(a) - v.z * Math.sin(a) + PLATE_PIVOT_Y, y * Math.sin(a) + v.z * Math.cos(a));
}
// the plate's snap anchors (right side +x), moved back and seated on the shell
const PLATE_SNAP = projectToShell(shiftBack(shellPoint(Math.abs(SNAP[0]), SNAP[1], 0)));

function buildCrownPlate() {
  const { lift, thick } = PLATE;
  const Xs = PLATE_SNAP.x, Ys = PLATE_SNAP.y, zs = PLATE_SNAP.z;
  const toPlane = (Y, z) => Math.atan2(Y - Ys, z - zs);
  const [, yMid] = toXY(164, 22), [, yTop] = toXY(164, 10), [, yBot] = toXY(164, 34);
  const mid = projectToShell(shiftBack(shellPoint(0, yMid, 0)));
  const th = toPlane(mid.y, mid.z) + PLATE.back;
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
  const W = Math.max(0.085, shellPoint(0, yTop, 0).distanceTo(shellPoint(0, yBot, 0)) / 2) * PLATE.scale;

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
  const outer = [], inner = [], idx = [];
  const rimTop = [], rimBot = [];
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), L = new THREE.Vector3();
  const s0 = sL - W, s1 = sR + W;
  for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1);
    const sv = s0 + (s1 - s0) * (0.5 - 0.5 * Math.cos(u * Math.PI));   // denser toward the round ends
    const C = pointAt(sv);
    T.copy(pointAt(Math.min(s1, sv + 1e-3))).sub(pointAt(Math.max(s0, sv - 1e-3))).normalize();
    Nn.copy(shellNormalAt(C));
    L.crossVectors(Nn, T).normalize();
    if (L.y < 0) L.negate();
    const hw = halfW(sv);
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const P3 = projectToShell(C.clone().addScaledVector(L, (0.5 - v) * 2 * hw));
      const nP = shellNormalAt(P3);
      const o = P3.clone().addScaledVector(nP, lift + thick / 2), n = P3.clone().addScaledVector(nP, lift - thick / 2);
      const k = (j * cols + i) * 3;
      outer[k] = o.x; outer[k + 1] = o.y; outer[k + 2] = o.z;
      inner[k] = n.x; inner[k + 1] = n.y; inner[k + 2] = n.z;
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
    const ix = flip ? idx.slice() : idx;
    if (flip) for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
    geo.setIndex(ix);
    geo.computeVertexNormals();
    return geo;
  };
  const black = new THREE.MeshPhysicalMaterial({
    color: 0x0f1012, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.12, side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.name = 'Crown plate';
  group.add(new THREE.Mesh(skin(outer, false), black), new THREE.Mesh(skin(inner, true), black));
  // moulded rounded edge all the way round
  const loop = [...rimTop, ...rimBot.reverse()].filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 1e-4);
  group.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true, 'centripetal'), 1000, thick / 2, 16, true),
    black,
  ));
  return group;
}

function buildSnap(side) {
  const g = new THREE.Group();
  const base = PLATE_SNAP.clone(); base.x *= side;
  const n = shellNormalAt(base);
  g.position.copy(base).addScaledVector(n, PLATE.lift + PLATE.thick / 2);   // seated on the plate
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
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
  g.scale.setScalar(PLATE.snapScale);
  return g;
}

// ─── glass flip-up visor + hinge ──────────────────────────────────────────
// A real bubble-visor mechanism: the shield is a section of a sphere centred
// ON the hinge axis (x axis through VISOR_C, at the helmet's temples), so it
// swings around the helmet without ever changing its gap to the shell. The
// radius clears the furthest helmet part in the swept range (liner end caps,
// ≈1.32 from the centre) by ~0.04. Down = covers brow → chin; up = rotated
// over the crown, its leading edge resting on the forehead like the Figma
// band. Hinge stack each side: shell → spacer → visor tab → knurled hub → cap.
const VISOR_C = new THREE.Vector3(0, 0.1, 0);
const VISOR_R = 1.36;
const VISOR_UP = -1.45;                                // rad about the hinge (0 = down)
const DEG = Math.PI / 180;

// Smoked polycarbonate. Deliberately NOT a transmission (refraction)
// material: three's transmission pass re-renders the scene behind the glass
// with an offset, which showed the visor's own rim and pull tab as ghost
// copies. Plain alpha glass with a Fresnel-weighted opacity reads as glass
// (clear face-on, silvery at grazing angles) with no doubling.
function glassMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x7f8794,                                   // light smoke tint
    roughness: 0.04,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
float fresG = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
diffuseColor.a = mix(diffuseColor.a, 0.62, fresG);   // denser and more reflective at grazing angles
#include <opaque_fragment>`);
  };
  return mat;
}

function buildGlassVisor() {
  // outline in (φ around y from the front, θ from the top), down pose
  const PHI_END = 97 * DEG, PHI_TAB = 84 * DEG;        // past ±84° it narrows into a round hinge tab
  const thTop = (ph) => THREE.MathUtils.lerp(66, 79, THREE.MathUtils.smoothstep(Math.abs(ph), 40 * DEG, PHI_TAB)) * DEG;
  const thBot = (ph) => THREE.MathUtils.lerp(122, 102, THREE.MathUtils.smoothstep(Math.abs(ph), 30 * DEG, PHI_TAB)) * DEG;
  const pt = (ph, th) => new THREE.Vector3(
    VISOR_R * Math.sin(th) * Math.sin(ph), VISOR_R * Math.cos(th), VISOR_R * Math.sin(th) * Math.cos(ph));

  const cols = 220, rows = 40;
  const pos = [], uv = [], idx = [], rimTop = [], rimBot = [];
  for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1);
    const ph = -PHI_END + 2 * PHI_END * (0.5 - 0.5 * Math.cos(u * Math.PI));   // denser toward the tabs
    let t0 = thTop(ph), t1 = thBot(ph);
    const ax = Math.abs(ph);
    if (ax > PHI_TAB) {                                 // round tab end around the hinge (θ = 90°)
      const k = Math.sqrt(Math.max(0, 1 - ((ax - PHI_TAB) / (PHI_END - PHI_TAB)) ** 2));
      t0 = 90 * DEG - (90 * DEG - t0) * k;
      t1 = 90 * DEG + (t1 - 90 * DEG) * k;
    }
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const p = pt(ph, t0 + (t1 - t0) * v);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
    rimTop.push(pt(ph, t0));
    rimBot.push(pt(ph, t1));
  }
  for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows; j++) {
    const a = i * (rows + 1) + j, b = a + 1, c = a + rows + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const pivot = new THREE.Group();                      // rotates about the hinge axis
  pivot.position.copy(VISOR_C);
  const shield = new THREE.Mesh(geo, glassMaterial());
  shield.name = 'Visor glass';
  shield.renderOrder = 6;
  pivot.add(shield);

  // polished rim all the way round (the shield's moulded edge)
  const loop = [...rimTop, ...rimBot.reverse()].filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-4);
  const rim = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true, 'centripetal'), 900, 0.012, 12, true),
    new THREE.MeshPhysicalMaterial({ color: 0x23262d, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.05 }),
  );
  rim.name = 'Visor rim';
  pivot.add(rim);

  // rubber pull tab at the bottom centre
  const tab = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.022, 0.12, 4, 12),
    new THREE.MeshPhysicalMaterial({ color: 0x111214, roughness: 0.55 }),
  );
  const tb = pt(0, thBot(0) + 1.2 * DEG);
  tab.position.copy(tb).addScaledVector(tb.clone().normalize(), 0.012);
  tab.rotation.z = Math.PI / 2;
  tab.name = 'Visor pull tab';
  pivot.add(tab);

  return { pivot, pickables: [shield, rim, tab] };
}

function buildHinge(side) {
  const g = new THREE.Group();
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const knurl = new THREE.MeshPhysicalMaterial({ color: 0x141518, roughness: 0.45, flatShading: true });
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xc9cfd6, metalness: 0.9, roughness: 0.3, anisotropy: 0.8 });
  const xs = rAt(VISOR_C.y);                            // shell surface at the hinge
  const parts = [
    // [radius, from x, to x, material, radial segments]
    [0.11, xs - 0.04, VISOR_R - 0.01, black, 48],        // spacer from the shell to the visor tab
    [0.15, VISOR_R + 0.012, VISOR_R + 0.062, knurl, 40], // knurled hub over the tab
    [0.075, VISOR_R + 0.062, VISOR_R + 0.088, metal, 48],// chrome cap
  ];
  for (const [r, x0, x1, mat, seg] of parts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - x0, seg), mat);
    m.rotation.z = Math.PI / 2;
    m.position.set(side * (x0 + x1) / 2, VISOR_C.y, VISOR_C.z);
    g.add(m);
  }
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.016), black);
  slot.position.set(side * (VISOR_R + 0.09), VISOR_C.y, VISOR_C.z);
  slot.rotation.x = 0.5;
  g.add(slot);
  return g;
}

// ─── assembly ─────────────────────────────────────────────────────────────
// Returns the helmet group plus a visor controller: toggle()/setDown(),
// update(dt) for the hinge motion, and the meshes to hit-test for clicks.
export function createHelmet() {
  const group = new THREE.Group();
  group.name = 'Orbi Soft Helmet';
  const visor = buildGlassVisor();
  group.add(buildShell(), buildEdgeBead(), buildLiner(), buildCrownPlate(), buildSnap(-1), buildSnap(1),
    visor.pivot, buildHinge(1), buildHinge(-1));

  // hinge motion: a weighted spring with a little detent bounce at each end
  // (user toggles), or a softer one for the automatic lower after the intro —
  // still snappy (~0.6 s) with a very subtle elastic settle (~2° past closed);
  // `slow` picks that spring
  const SNAPPY = { k: 75, d: 11.5 };                  // ζ ≈ 0.66
  const SLOW = { k: 30, d: 8.2 };                     // ζ ≈ 0.75
  const v = { a: VISOR_UP, va: 0, target: VISOR_UP, spring: SNAPPY };
  visor.pivot.rotation.x = v.a;
  return {
    group,
    visorPickables: visor.pickables,
    get visorDown() { return v.target === 0; },
    setVisorDown(down, { slow = false } = {}) { v.target = down ? 0 : VISOR_UP; v.spring = slow ? SLOW : SNAPPY; },
    toggleVisor() { v.target = v.target === 0 ? VISOR_UP : 0; v.spring = SNAPPY; return v.target === 0; },
    update(dt) {
      v.va += (v.spring.k * (v.target - v.a) - v.spring.d * v.va) * dt;
      v.a += v.va * dt;
      visor.pivot.rotation.x = v.a;
    },
  };
}
