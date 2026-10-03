// Orbi — 3D build of the Figma "Bot 3D 01" set (1032:19174).
//
// The body is a rigid ball: it never squashes or deforms. All motion is
// whole-body — a light hover spring, airy hops with a couple of rebounds and
// a nod/rock wobble kicked by each landing. The bot ignores the cursor; press
// and drag sideways to rotate it freely (it follows the pointer 1:1 and glides
// on with momentum when released, then springs back to face the camera);
// swipe up / down to raise / lower the visor.
//
// The face is not geometry: each state is drawn into a canvas in Figma
// coordinates and sampled in the shader by the vertex's rest direction.

import * as THREE from 'three';
import { createHelmet, SURFACE_GLSL, SHELL_PATH } from './helmet.js';

// ─── constants ────────────────────────────────────────────────────────────
const R = 1;                    // body radius (Figma body = 240px → 120px = 1 unit)
const HOVER_Y = 0;              // resting centre height while floating
const FLOOR_Y = -1.18;          // Figma: body bottom 270, contact shadow 288 → 0.15R gap
const GRAVITY = 17;              // low: a light, floaty toy ball
const DRAG_YAW = 0.0105;        // rad per px of horizontal drag (~360° over 600px)
const DRAG_PITCH = 0.006;       // rad per px of vertical drag (tilt while swiping the visor)
const MAX_TILT = 0.5;
const BASE_PITCH = -0.2;        // tip the face up toward the camera

const STATES = [
  { key: 'idle',     label: 'Idle' },
  { key: 'greeting', label: 'Greeting' },
  { key: 'working',  label: 'Working' },
  { key: 'error',    label: 'Error' },
  { key: 'dizzy',    label: 'Dizzy' },
  { key: 'sleepy',   label: 'Sleepy' },
  { key: 'angry',    label: 'Angry' },
];

// ─── renderer / scene ─────────────────────────────────────────────────────
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);
// No shadow maps: at the softness wanted they turned blocky/kinked on the
// curved face. Helmet-on-ball shading is an analytic occlusion term in the
// ball's shader instead (see HELMET_AO_GLSL).

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);   // matches the page
const pmrem = new THREE.PMREMGenerator(renderer);

// Studio environment: a dim warm gradient dome plus one large softbox up-left
// and two weak fills. Replaces RoomEnvironment, whose many small panel lights
// read as scattered hot spots on the ball.
function studioEnvironment() {
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(20, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 floorC = vec3(0.045, 0.042, 0.035);
          vec3 sky = vec3(0.30, 0.29, 0.27);
          gl_FragColor = vec4(mix(floorC, sky, smoothstep(-0.25, 0.85, h)), 1.0);
        }`,
    }),
  );
  env.add(dome);
  const panel = (w, h, intensity, pos) => {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.93).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    p.position.set(...pos);
    p.lookAt(0, 0, 0);
    env.add(p);
  };
  panel(15, 12, 1.9, [-7, 8, 9]);  // key softbox — large, so highlights stay broad and soft
  panel(7, 10, 0.6, [10, 1, 5]);   // right fill
  panel(8, 2.5, 0.7, [3, 5, -10]); // back rim strip
  return env;
}
scene.environment = pmrem.fromScene(studioEnvironment(), 0.06).texture;
scene.environmentIntensity = 1.2;

// long lens: close to the flat Figma front view, so near parts (forehead,
// wordmark) aren't magnified by perspective
const FOV = 13.5;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
const CAM_TARGET = new THREE.Vector3(0, -0.22, 0);
camera.position.set(0, 3.1, 15.2);
camera.lookAt(CAM_TARGET);

const key = new THREE.DirectionalLight(0xfff8e6, 2.0);
key.position.set(-3.6, 5, 4);
scene.add(key);
const bounce = new THREE.HemisphereLight(0xfffcf0, 0x6a6040, 0.85);   // brighter, warmer fill: lifts the shadow side
scene.add(bounce);
const rim = new THREE.DirectionalLight(0xfff4c0, 0.25);
rim.position.set(3.5, 2.5, -3);   // upper back: rims the silhouette without glaring on the flap tips
scene.add(rim);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the bot a comfortable size on narrow screens
  camera.fov = w / h < 0.8 ? FOV / Math.max(w / h, 0.45) * 0.8 : FOV;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ─── body geometry ────────────────────────────────────────────────────────
const geometry = new THREE.SphereGeometry(R, 256, 192);
// rest direction = object-space unit normal; the face shader samples by it
geometry.setAttribute('aRest', geometry.attributes.normal.clone());

// ─── face texture ─────────────────────────────────────────────────────────
// Canvas covers ±90 Figma px around the body centre (body radius = 120 px).
const FACE_EXTENT = 0.75;
const FACE_PX = 2048;
const S = FACE_PX / 180;
const faceCanvas = document.createElement('canvas');
faceCanvas.width = faceCanvas.height = FACE_PX;
const fctx = faceCanvas.getContext('2d');
const faceTex = new THREE.CanvasTexture(faceCanvas);
faceTex.colorSpace = THREE.SRGBColorSpace;
faceTex.anisotropy = 8;
faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;

const X = x => FACE_PX / 2 + x * S;
const Y = y => FACE_PX / 2 + y * S;

// ── Morphable face ────────────────────────────────────────────────────────
// Every eye of every state is two brush strokes (N points each) with one
// width: a pill is a short vertical stroke 28 wide, a dash a short
// horizontal one, ^ and ◡ thin arcs, X two crossing strokes (single-stroke
// eyes just repeat the stroke). Because all faces share that shape, a state
// change interpolates points + widths + the glint / lip / cheek weights, so
// pills flow into ^^, a dash splits into an X, etc. The right eye is the
// mirror of the left (same point order), so morphs stay symmetric.
const FACE_DY = 20;   // whole face sits 20 Figma px lower than the Bot 3D 01 layout (clears the helmet liner)
const NP = 28;
const linePts = (x0, y0, x1, y1) => Array.from({ length: NP }, (_, i) => {
  const t = i / (NP - 1); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
});
const arcPts = (cx, cy, r, a0, a1) => Array.from({ length: NP }, (_, i) => {
  const a = a0 + (a1 - a0) * (i / (NP - 1)); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
// left eye per face (Figma px, eye centre around x −32)
const LEFT_EYE = {
  pill:     () => { const l = linePts(-32, -24, -32, 10); return { a: l, b: l, w: 28 }; },          // 28 × 62 pill
  greeting: () => { const l = arcPts(-32, -7, 12.5, Math.PI + 0.38, Math.PI * 2 - 0.38); return { a: l, b: l, w: 6.5 }; },
  error:    () => { const l = linePts(-45, -6, -19, -6); return { a: l, b: l, w: 9 }; },
  dizzy:    () => ({ a: linePts(-44, -16, -22, 6), b: linePts(-22, -16, -44, 6), w: 7.5 }),
  sleepy:   () => { const l = arcPts(-32, -12, 12, Math.PI - 0.32, 0.32); return { a: l, b: l, w: 6.5 }; },
  // angry: a stroke is the narrowed eye (short pill), b the brow — high at the
  // outer side, dropping toward the nose
  angry:    () => ({ a: linePts(-31, -9, -31, 7), b: linePts(-49, -35, -17, -21), w: 22 }),
};
const FACE_OF = { idle: 'pill', working: 'pill', greeting: 'greeting', error: 'error', dizzy: 'dizzy', sleepy: 'sleepy', angry: 'angry' };
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
// Mouth: only the greeting smiles; every other face keeps it collapsed to a
// point (width 0) at the same spot, so the smile grows out of / shrinks into
// nothing as faces morph.
const MOUTH = {
  smile: () => ({ a: arcPts(0, 13, 10.5, Math.PI - 0.55, 0.55), w: 5.5 }),
  frown: () => ({ a: arcPts(0, 29, 9.5, Math.PI + 0.6, Math.PI * 2 - 0.6), w: 5.5 }),
  none: () => ({ a: linePts(0, 23, 0, 23), w: 0 }),
};
function faceSpec(state) {
  const kind = FACE_OF[state] || 'pill';
  const L = LEFT_EYE[kind]();
  const R = { a: mirror(L.a), b: mirror(L.b), w: L.w };
  const pill = kind === 'pill' ? 1 : 0;
  const happy = kind === 'greeting' ? 1 : 0;
  const angry = kind === 'angry' ? 1 : 0;
  const mouth = happy ? MOUTH.smile() : angry ? MOUTH.frown() : MOUTH.none();
  // brow width: the angry brow is a thinner stroke than its eye (stroke b)
  return { eyes: [L, R], mouth, glint: pill, lip: pill, cheeks: happy, flush: angry, brow: angry, blink: pill };
}
const lerp = (a, b, t) => a + (b - a) * t;
const lerpPts = (A, B, t) => A.map((p, i) => [lerp(p[0], B[i][0], t), lerp(p[1], B[i][1], t)]);
function lerpFace(A, B, t) {
  return {
    eyes: A.eyes.map((e, i) => ({ a: lerpPts(e.a, B.eyes[i].a, t), b: lerpPts(e.b, B.eyes[i].b, t), w: lerp(e.w, B.eyes[i].w, t) })),
    mouth: { a: lerpPts(A.mouth.a, B.mouth.a, t), w: lerp(A.mouth.w, B.mouth.w, t) },
    glint: lerp(A.glint, B.glint, t), lip: lerp(A.lip, B.lip, t),
    cheeks: lerp(A.cheeks, B.cheeks, t), blink: lerp(A.blink, B.blink, t),
    flush: lerp(A.flush || 0, B.flush || 0, t), brow: lerp(A.brow || 0, B.brow || 0, t),
  };
}

function drawFace(spec, open = 1) {
  fctx.clearRect(0, 0, FACE_PX, FACE_PX);
  fctx.save();
  fctx.translate(0, FACE_DY * S);

  if (spec.flush > 0.01) {                           // angry red flush
    fctx.save();
    fctx.globalAlpha = spec.flush;
    fctx.filter = `blur(${10 * S}px)`;
    fctx.fillStyle = 'rgba(232,70,40,0.32)';
    fctx.beginPath();
    fctx.ellipse(X(0), Y(-2), 70 * S, 34 * S, 0, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();
  }

  if (spec.cheeks > 0.01) {                          // greeting blush
    fctx.save();
    fctx.globalAlpha = spec.cheeks;
    fctx.filter = `blur(${3.5 * S}px)`;
    fctx.fillStyle = 'rgba(244,128,128,0.55)';
    for (const cx of [-61, 63]) {
      fctx.beginPath();
      fctx.ellipse(X(cx), Y(29), 17 * S, 9 * S, 0, 0, Math.PI * 2);
      fctx.fill();
    }
    fctx.restore();
  }

  if (spec.mouth.w > 0.05) {                         // smile
    fctx.save();
    fctx.strokeStyle = '#000';
    fctx.lineWidth = spec.mouth.w * S;
    fctx.lineCap = 'round';
    fctx.lineJoin = 'round';
    fctx.beginPath();
    spec.mouth.a.forEach(([x, y], i) => (i ? fctx.lineTo(X(x), Y(y)) : fctx.moveTo(X(x), Y(y))));
    fctx.stroke();
    fctx.restore();
  }

  const k = spec.glint;                              // "pill-ness": shading + glint weight
  const top = `rgb(${Math.round(59 * k)},${Math.round(59 * k)},${Math.round(59 * k)})`;
  for (const e of spec.eyes) {
    const all = e.a.concat(e.b);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const h = y1 - y0 + e.w;                         // visual height including the round caps
    fctx.save();
    // blink: squash the eye vertically about its centre (pill eyes only)
    const sq = lerp(1, Math.max(open, 5 / 62), spec.blink);
    fctx.translate(0, Y(cy)); fctx.scale(1, sq); fctx.translate(0, -Y(cy));
    // bottom lip — the 2px white drop shadow on the Figma eyes
    fctx.shadowColor = `rgba(255,255,236,${(0.75 * spec.lip).toFixed(3)})`;
    fctx.shadowOffsetY = 2 * S;
    fctx.shadowBlur = 1.5 * S;
    const g = fctx.createLinearGradient(0, Y(y0 - e.w / 2), 0, Y(y1 + e.w / 2));
    g.addColorStop(0, top);
    g.addColorStop(0.32, '#0c0c0c');
    g.addColorStop(1, '#000');
    fctx.strokeStyle = g;
    fctx.lineCap = 'round';
    fctx.lineJoin = 'round';
    // stroke b shares the eye's width, except as a brow (angry), where it thins
    const widths = [e.w, lerp(e.w, 8.5, spec.brow || 0)];
    const same = e.a.every((p, i) => Math.abs(p[0] - e.b[i][0]) + Math.abs(p[1] - e.b[i][1]) < 0.01);
    (same ? [e.a] : [e.a, e.b]).forEach((pts, si) => {   // single-stroke eyes: draw once (no doubled lip)
      fctx.lineWidth = widths[si] * S;
      fctx.beginPath();
      pts.forEach(([x, y], i) => (i ? fctx.lineTo(X(x), Y(y)) : fctx.moveTo(X(x), Y(y))));
      fctx.stroke();
    });
    fctx.restore();
    // glint
    const ga = 0.85 * k * THREE.MathUtils.clamp((open - 0.45) * 3, 0, 1);
    if (ga > 0.01) {
      const hh = h * Math.max(open, 5 / 62);
      fctx.save();
      fctx.globalAlpha = ga;
      fctx.filter = `blur(${0.6 * S}px)`;
      fctx.fillStyle = '#fff';
      fctx.beginPath();
      fctx.roundRect(X(cx - e.w * 0.22 - 3), Y(cy - hh * 0.36), 6 * S, hh * 0.26 * S, 3 * S);
      fctx.fill();
      fctx.restore();
    }
  }
  fctx.restore();
  faceTex.needsUpdate = true;
}

// ─── body material ────────────────────────────────────────────────────────
const bodyMat = new THREE.MeshPhysicalMaterial({
  color: 0xffeb45,
  roughness: 0.58,
  clearcoat: 0.18,
  clearcoatRoughness: 0.42,
  specularIntensity: 0.75,
  sheen: 0.3,
  sheenColor: new THREE.Color(0xfff6c8),
  sheenRoughness: 0.8,
  emissive: 0x141000,
});
const uniforms = {
  faceMap: { value: faceTex },
  uTint: { value: new THREE.Color(0xf2dc00) },
  uRimColor: { value: new THREE.Color(0xfffbe0) },
  uRim: { value: 0.18 },
};
// Helmet → ball occlusion, evaluated on the ball's rest sphere (the helmet is
// a child of the body, so they share that space). The face window is the
// liner's inner edge (Figma liner: sides x ±0.85, top y 0.467, 24px stroke →
// inner edge x ±0.75, y 0.37, corner r ≈ 0.37); its top is pulled down a touch
// because the light comes from above (the Figma "Liner shadow" sits 6px low).
//   • inside the window: dark at the liner, opening to full light ~0.34 in
//   • under the shell: deep shade (the inside of the helmet)
//   • below the shell rim (y −0.55): back into the light over ~0.35
// The shadow is a touch warm so it reads as yellow in shade, not grey.
const HELMET_AO_GLSL = `
{
  vec3 rp = normalize(vRest);
  float top = 0.30, bot = -1.7;
  vec2 q = abs(vec2(rp.x, rp.y - (top + bot) * 0.5)) - vec2(0.75, (top - bot) * 0.5) + 0.36;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.36;
  float faceAO = mix(0.46, 1.0, smoothstep(0.0, 0.34, -sd));
  float ao = (rp.z > 0.0 && sd < 0.0) ? faceAO : 0.42;
  ao = max(ao, mix(0.42, 1.0, smoothstep(-0.5, -0.88, rp.y)));   // below the rim
  outgoingLight *= ao * mix(vec3(0.9, 0.86, 0.74), vec3(1.0), ao);
}`;

bodyMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, uniforms);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aRest;\nvarying vec3 vRest;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
uniform sampler2D faceMap;
uniform vec3 uTint;
uniform vec3 uRimColor;
uniform float uRim;
varying vec3 vRest;
${SURFACE_GLSL}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float lower = smoothstep(0.25, -0.95, vRest.y) * smoothstep(-0.6, 0.4, vRest.z);
diffuseColor.rgb = mix(diffuseColor.rgb, uTint, lower * 0.6);
vec2 fuv = vRest.xy / (2.0 * ${FACE_EXTENT.toFixed(3)}) + 0.5;
vec4 face = texture2D(faceMap, fuv);
float faceA = face.a * smoothstep(0.15, 0.4, vRest.z)
  * step(abs(fuv.x - 0.5), 0.5) * step(abs(fuv.y - 0.5), 0.5);
diffuseColor.rgb = mix(diffuseColor.rgb, face.rgb, faceA);
// soft-touch vinyl, evaluated on the rest sphere so it turns with the face:
// gentle tonal depth, a fine moulded grain and a mottled satin sheen
float skin = 1.0 - faceA;
float tone = fbm3(vRest * 3.5 + 11.0);
float grain = vnoise(vRest * 24.0);                 // broad, soft undulation only
diffuseColor.rgb *= mix(1.0, 0.96 + 0.08 * tone, skin);
float mottle = smoothstep(0.3, 0.8, fbm3(vRest * 6.0 + 4.0));`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.32, faceA);
roughnessFactor += skin * (mottle * 0.07 - 0.035);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
// grain on the vinyl; the lacquered eyes only get a faint orange peel
normal = bumpN(normal, grain * 0.00012 * skin);`)
    .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
clearcoatNormal = bumpN(clearcoatNormal, grain * 0.0001 * skin);`)
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.sheenColor *= 1.0 - faceA;
material.clearcoat *= 1.0 - 0.5 * faceA;
material.specularColor *= 1.0 - 0.6 * faceA;
material.specularColorBlended *= 1.0 - 0.6 * faceA;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= 1.0 - faceA;`)
    .replace('#include <opaque_fragment>', `float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
outgoingLight += uRimColor * fres * uRim * (1.0 - faceA);
${HELMET_AO_GLSL}
#include <opaque_fragment>`);
};

const body = new THREE.Mesh(geometry, bodyMat);
body.frustumCulled = false;
scene.add(body);

const helmet = createHelmet();
body.add(helmet.group);

// ─── shadows, exactly as Figma frame 1060:79394 ───────────────────────────
// In the 80px frame the body is r 30, so 1 unit = 30px; Figma blur radius r
// is a Gaussian with σ = r / 2 (what its SVG export writes).
//   Body           DROP_SHADOW  #000 40%, y +5.5, blur 9   → offset 0.183, σ 0.15
//   Helmet shell   DROP_SHADOW  #000 45%, y +10,  blur 18 (in its 320 space, r 120)
//                                                          → offset 0.083, σ 0.075
//   Contact shadow ellipse 30.4×4.8 at y 74.4, #1D2539 16%, LAYER_BLUR 3.2
//                  → rx 0.507, ry 0.08, centre 1.31 below the body centre, σ 0.053
//   Bounce glow    hidden in Figma → not drawn
// They are screen-facing sprites, so they read exactly like the flat drawing:
// the drop shadows sit just behind the bot (scaled to stay the same on screen),
// the contact shadow stays on the ground line.
const SHADOW_EXTENT = 2;
function shadowSprite(draw) {
  const size = 1024, k = size / (2 * SHADOW_EXTENT);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  draw(ctx, k);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * SHADOW_EXTENT, 2 * SHADOW_EXTENT),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  scene.add(mesh);
  return mesh;
}
const bodyShadow = shadowSprite((ctx, k) => {
  ctx.filter = `blur(${0.22 * k}px)`;              // Figma σ 0.15, softened ×1.5
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.arc(0, 0, R * k, 0, Math.PI * 2);              // offset applied in placeShadows
  ctx.fill();
});
const helmetShadow = shadowSprite((ctx, k) => {
  ctx.filter = `blur(${0.11 * k}px)`;              // Figma σ 0.075, softened ×1.5
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.scale(k / 120, k / 120);
  ctx.translate(-164, -158);                          // offset applied in placeShadows
  ctx.fill(new Path2D(SHELL_PATH));
});
const CONTACT_Y = HOVER_Y - 1.31;
const contactShadow = shadowSprite((ctx, k) => {
  ctx.filter = `blur(${0.08 * k}px)`;              // Figma σ 0.053, softened ×1.5
  ctx.fillStyle = 'rgba(29,37,57,0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.507 * k, 0.08 * k, 0, 0, Math.PI * 2);
  ctx.fill();
});
const toCam = new THREE.Vector3(), camUp = new THREE.Vector3(), qRoll = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
let viewRoll = 0;                                     // the bot's on-screen roll this frame
const DROP = [[bodyShadow, 0.183], [helmetShadow, 0.083]];   // Figma y offsets (units)
function placeShadows() {
  toCam.subVectors(camera.position, body.position).normalize();
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const dBody = camera.position.distanceTo(body.position);
  qRoll.setFromAxisAngle(zAxis, viewRoll);
  for (const [sp, dy] of DROP) {
    sp.position.copy(body.position).addScaledVector(toCam, -1.6);   // just behind the bot
    const sc = camera.position.distanceTo(sp.position) / dBody;
    sp.scale.setScalar(sc * intro.scale);
    sp.position.addScaledVector(camUp, -dy * sc * intro.scale);   // light from above: offset stays straight down
    sp.quaternion.copy(camera.quaternion).multiply(qRoll);   // silhouette turns with the bot
  }
  // contact shadow stays on the ground line and softens as the bot rises
  const lift = Math.max(0, body.position.y - HOVER_Y);
  // drop shadows soften as the bot rises
  bodyShadow.material.opacity = helmetShadow.material.opacity = THREE.MathUtils.clamp((2.8 - lift) / 1.3, 0, 1);
  contactShadow.position.set(body.position.x, CONTACT_Y, 0);
  contactShadow.quaternion.copy(camera.quaternion);
  contactShadow.scale.setScalar((1 + Math.min(lift, 2) * 0.4) * intro.scale);
  contactShadow.material.opacity = THREE.MathUtils.clamp(1 - lift * 0.45, 0, 1) * Math.min(1, intro.scale);
  bodyShadow.visible = helmetShadow.visible = contactShadow.visible = body.visible;
}

// ─── props: dizzy orbit, Zz ───────────────────────────────────────────────
const satin = (color, emissive = 0x000000, ei = 0) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4, emissive, emissiveIntensity: ei,
});

const orbiters = [0.075, 0.055, 0.068].map((r, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), satin(0xfff6a8, 0xfff07a, 0.35));
  m.userData.phase = i * Math.PI * 2 / 3;
  m.scale.setScalar(0);
  scene.add(m);
  return m;
});

function zTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff6b0';
  x.font = '800 104px -apple-system, "SF Pro Rounded", system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('z', 64, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const zTex = zTexture();
const zs = [];
let zTimer = 0;

// ─── rigid-body motion ────────────────────────────────────────────────────
const m = {
  y: HOVER_Y, vy: 0, airborne: false, hoverY: HOVER_Y,
  x: 0, vx: 0,
  spin: 0, spinV: 0,                  // yaw: set by dragging; after release glides, then springs home
  homing: false, home: 0, glideF: 0,  // home = front-facing turn it settles into; glideF = coast friction
  tilt: 0, tiltV: 0,                  // vertical-drag tilt, eases back to level on release
  dragging: false, dragVel: 0, lastDir: 1,
  nod: 0, nodV: 0, rock: 0, rockV: 0, // pitch / roll wobble kicked by landings
  shake: 0,                           // error tremble amplitude
};

function hop(v) {
  if (m.airborne && m.y > m.hoverY + 0.12) return;   // no re-launching mid-air (rapid taps)
  m.airborne = true;
  m.vy = Math.min(Math.max(m.vy, 0) + v, 4.6);
}

// Where to come to rest after a release: the whole turn (face-on) nearest to
// where the flick would naturally stop. If that's ahead in the direction of
// travel, coast there with exactly the friction that stops on it (no
// overshoot-and-reverse on fast flicks); otherwise spring straight back.
function planReturn() {
  const TAU = Math.PI * 2;
  const proj = m.spin + m.spinV / 2.6;
  m.home = Math.round(proj / TAU) * TAU;
  const dist = m.home - m.spin;
  m.glideF = (Math.abs(m.spinV) > 0.5 && Math.sign(dist) === Math.sign(m.spinV) && Math.abs(dist) > 0.05)
    ? THREE.MathUtils.clamp(m.spinV / dist, 1, 8) : 0;
  m.homing = true;
}

// keyboard nudge: a flick of momentum in that direction
function nudge(dir) {
  m.lastDir = dir;
  m.homing = false;
  m.spinV += dir * 14;                                // about one full turn, then home
}

function stepMotion(h) {
  // yaw: the pointer drives it while held; after release it returns face-on
  if (!m.dragging && !intro.active) {
    // after a release (see planReturn): coast on the flick's momentum with a
    // friction tuned to come to rest on the chosen front-facing turn, then a
    // soft spring finishes the settle (or brings a slow release straight back)
    if (!m.homing) planReturn();
    if (m.glideF > 0) {
      m.spinV *= Math.exp(-h * m.glideF);
      if (Math.abs(m.spinV) < 1.2) m.glideF = 0;
    } else {
      m.spinV += (45 * (m.home - m.spin) - 9.5 * m.spinV) * h;   // ζ ≈ 0.7: one soft overshoot
      if (Math.abs(m.home - m.spin) < 1e-4 && Math.abs(m.spinV) < 1e-3) {
        m.spin -= m.home; m.home = 0;                  // keep the numbers small
      }
    }
    m.spin += m.spinV * h;
  }
  if (!m.dragging) {
    // tilt eases back to level (slightly under-damped)
    m.tiltV += (-70 * m.tilt - 11 * m.tiltV) * h;
    m.tilt += m.tiltV * h;
  }

  // vertical: ballistic in the air, light rebounds, then the hover spring.
  // Each touchdown nods the ball forward and rocks it toward the spin.
  if (m.airborne) {
    m.vy -= GRAVITY * h;
    m.y += m.vy * h;
    if (m.y <= m.hoverY && m.vy < 0) {
      const impact = -m.vy;
      m.y = m.hoverY;
      m.nodV += Math.min(impact, 4.5) * 0.55;
      m.rockV += m.lastDir * Math.min(impact, 4.5) * 0.35;
      if (impact > 1.5) m.vy = impact * 0.4;
      else { m.airborne = false; m.vy *= 0.3; }
    }
  } else {
    m.vy += (85 * (m.hoverY - m.y) - 11 * m.vy) * h;
    m.y += m.vy * h;
  }

  // wobble springs (ζ ≈ 0.24): two or three gentle rocks, then still
  m.nodV += (-95 * m.nod - 4.6 * m.nodV) * h;
  m.nod += m.nodV * h;
  m.rockV += (-95 * m.rock - 4.6 * m.rockV) * h;
  m.rock += m.rockV * h;

  m.vx += (90 * -m.x - 14 * m.vx) * h;
  m.x += m.vx * h;
}

// ─── state machine ────────────────────────────────────────────────────────
let state = 'idle';
let faceCur = faceSpec('idle');   // what's on the face right now
let morph = null;                 // { from, to, t } while a state change morphs the face
let stateTime = 0;
let eyeOpen = 1;
let blinkT = -1, nextBlink = 2.5;
const scripts = [];               // timed one-shots { at, fn }

function schedule(at, fn) { scripts.push({ at: stateTime + at, fn }); }

function setState(next, { quiet = false } = {}) {
  if (!STATES.some(s => s.key === next)) return;
  const prev = state;
  if (prev !== next) { prevState = prev; prevStateTime = stateTime; poseBlend = 0; }
  state = next;
  stateTime = 0;
  scripts.length = 0;
  {
    // into / out of the round pill eyes: go via a closed eye (natural blink
    // into the new expression) instead of twisting the pill into the shape
    const to = faceSpec(next);
    const fromPill = faceCur.blink > 0.5, toPill = to.blink > 0.5;
    morph = fromPill !== toPill ? { via: true, fromPill, from: faceCur, to, t: 0 } : { from: faceCur, to, t: 0 };
  }
  m.shake = 0;

  if (!quiet) {
    switch (next) {
      case 'greeting':
        hop(3.2);
        break;
      case 'error':
        m.vx -= 2.4;
        m.shake = 0.03;
        schedule(0.45, () => { m.shake = 0; });
        break;
      case 'dizzy':
        m.vx += 1.6;
        break;
      case 'angry': {
        // stiffen with a shudder, then a faint steady tremble with a little
        // huff (hop + shake burst) every couple of seconds
        m.shake = 0.024;
        m.nodV += 1.4;
        schedule(0.4, () => { m.shake = 0.006; });
        const huff = () => {
          if (state !== 'angry') return;
          hop(1.7);
          m.shake = 0.02;
          schedule(0.32, () => { if (state === 'angry') m.shake = 0.006; });
          schedule(2.2 + Math.random() * 0.8, huff);
        };
        schedule(1.6, huff);
        break;
      }
      default:
        if (prev === 'sleepy') hop(3.6);
    }
  }
  syncNav();
}

// ─── UI ───────────────────────────────────────────────────────────────────
const nav = document.getElementById('states');
STATES.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = s.label;
  b.dataset.state = s.key;
  b.title = `${s.label} (${i + 1})`;
  b.addEventListener('click', () => { endIntro(); setState(s.key); });
  nav.appendChild(b);
});
function syncNav() {
  nav.querySelectorAll('button[data-state]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.state === state)));
}
// visor toggle, after a divider in the same bar
const sep = document.createElement('span');
sep.className = 'sep';
nav.appendChild(sep);
const visorBtn = document.createElement('button');
visorBtn.type = 'button';
visorBtn.className = 'visor';
visorBtn.title = 'Visor up / down (V)';
nav.appendChild(visorBtn);
function syncVisor() {
  visorBtn.textContent = helmet.visorDown ? 'Visor up' : 'Visor down';
  visorBtn.setAttribute('aria-pressed', String(helmet.visorDown));
}
function setVisor(down, { slow = false } = {}) {
  if (helmet.visorDown === down) return;
  helmet.setVisorDown(down, { slow });
  m.nodV += (down ? 0.5 : -0.5) * (slow ? 0.4 : 1);   // a little nod as the visor swings
  syncVisor();
}
function toggleVisor() {
  endIntro();
  setVisor(!helmet.visorDown);
}
visorBtn.addEventListener('click', toggleVisor);
syncVisor();
addEventListener('keydown', (e) => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= STATES.length) { endIntro(); setState(STATES[n - 1].key); }
  if (e.key === 'v' || e.key === 'V') toggleVisor();
  if (e.key === 'ArrowLeft') nudge(-1);
  if (e.key === 'ArrowRight') nudge(1);
});

// ─── pointer: drag to rotate, swipe for the visor, tap to bounce ──────────
// The bot does not follow the cursor. Each gesture locks to an axis after a
// few pixels: horizontal drags spin the bot (release hands the velocity to
// the glide → spring back face-on); vertical swipes tilt the bot with the
// finger (eases back level on release) and work the visor — swipe up to raise
// it, down to lower it (once per swipe, after VISOR_SWIPE px).
// A short still press is a tap (a bounce).
const AXIS_LOCK_PX = 8;
const VISOR_SWIPE_PX = 35;
let gesture = null;

canvas.addEventListener('pointerdown', (e) => {
  gesture = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), t: performance.now(), moved: 0, axis: null, fired: false };
  if (intro.active) { const sp = m.spin; endIntro(); m.spin = sp; }   // grab takes over mid-turn
  m.dragging = true;
  m.homing = false;
  m.spinV = 0;
  m.dragVel = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  canvas.classList.add('grabbing');
});

canvas.addEventListener('pointermove', (e) => {
  if (!gesture) return;
  const now = performance.now();
  const dx = e.clientX - gesture.lx, dy = e.clientY - gesture.ly;
  const dt = Math.max(1, now - gesture.lt) / 1000;
  gesture.lx = e.clientX; gesture.ly = e.clientY; gesture.lt = now;
  gesture.moved = Math.max(gesture.moved, Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y));
  if (!gesture.axis) {
    if (gesture.moved < AXIS_LOCK_PX) return;          // let taps stay taps
    const tx = e.clientX - gesture.x, ty = e.clientY - gesture.y;
    gesture.axis = Math.abs(tx) >= Math.abs(ty) ? 'x' : 'y';
  }
  if (gesture.axis === 'y') {
    // the bot tilts with the finger as before…
    m.tilt = THREE.MathUtils.clamp(m.tilt + dy * DRAG_PITCH, -MAX_TILT, MAX_TILT);
    m.tiltV = 0;
    // …and the swipe works the visor: up raises it, down lowers it
    const ty = e.clientY - gesture.y;
    if (!gesture.fired && Math.abs(ty) >= VISOR_SWIPE_PX) {
      gesture.fired = true;
      setVisor(ty > 0);
    }
    return;
  }
  if (state === 'sleepy') setState('idle', { quiet: true });
  m.spin += dx * DRAG_YAW;
  // smoothed angular velocity, used for the release glide and the lean
  m.dragVel += ((dx * DRAG_YAW) / dt - m.dragVel) * 0.35;
  if (dx) m.lastDir = Math.sign(dx);
});

function endGesture() {
  if (!gesture) return;
  const g = gesture;
  gesture = null;
  m.dragging = false;
  // stale velocity (pointer held still before release) shouldn't fling it
  const idle = performance.now() - g.lt;
  m.spinV = idle > 80 ? 0 : THREE.MathUtils.clamp(m.dragVel, -14, 14);
  m.dragVel = 0;
  canvas.classList.remove('grabbing');
  if (g.moved < 6 && performance.now() - g.t < 300) tap();
}
canvas.addEventListener('pointerup', endGesture);
canvas.addEventListener('pointercancel', endGesture);

function tap() {
  if (state === 'sleepy') { setState('idle'); return; }
  hop(2.6);
  m.nodV += 1.2;
}

// ─── face animation ───────────────────────────────────────────────────────
const MORPH_S = 0.24;
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeInQuad = (x) => x * x;
const easeOutCubicF = (x) => 1 - (1 - x) ** 3;
// The "closed eye": a short horizontal stroke, exactly the size of a pill eye
// squashed shut (28 wide × ~7 tall), so the two can hand over seamlessly.
const SQUASH = 7.1 / 62;
const CLOSED = (() => {
  const l = linePts(-42.5, -7, -21.5, -7);
  return { eyes: [{ a: l, b: l, w: 7 }, { a: mirror(l), b: mirror(l), w: 7 }], mouth: MOUTH.none(), glint: 0, lip: 1, cheeks: 0, blink: 0 };
})();
const VIA = { close: 0.16, open: 0.26 };            // s: blink shut, then open into the new shape
const VIA_BACK = { reshape: 0.3, open: 0.26 };      // back to pills: relax shut, then open gently
function updateFace(dt) {
  // pill ⇄ other face: squash the pills shut, then the closed line bends into
  // the new shape (and the reverse: reshape to closed, then open into pills)
  if (morph && morph.via) {
    const total = morph.fromPill ? VIA.close + VIA.open : VIA_BACK.reshape + VIA_BACK.open;
    morph.t = Math.min(1, morph.t + dt / total);
    if (morph.fromPill) {
      const split = VIA.close / total;
      if (morph.t < split) {
        faceCur = morph.from;
        drawFace(morph.from, lerp(1, SQUASH, easeInQuad(morph.t / split)));
      } else {
        faceCur = lerpFace(CLOSED, morph.to, easeOutCubicF((morph.t - split) / (1 - split)));
        drawFace(faceCur, 1);
      }
    } else {
      const split = VIA_BACK.reshape / total;         // relax into a closed line, then open gently
      if (morph.t < split) {
        faceCur = lerpFace(morph.from, CLOSED, easeInOutCubic(morph.t / split));
        drawFace(faceCur, 1);
      } else {
        faceCur = morph.to;
        drawFace(morph.to, lerp(SQUASH, 1, easeInOutCubic((morph.t - split) / (1 - split))));
      }
    }
    if (morph.t >= 1) { faceCur = morph.to; morph = null; drawFace(faceCur, 1); }
    return;
  }
  // state change: morph the current face (even mid-morph) into the new one
  if (morph) {
    morph.t = Math.min(1, morph.t + dt / MORPH_S);
    faceCur = lerpFace(morph.from, morph.to, easeInOutCubic(morph.t));
    if (morph.t >= 1) { faceCur = morph.to; morph = null; }
    drawFace(faceCur, 1);
    return;
  }
  // blinks on the pill eyes
  if (faceCur.blink > 0.5) {
    nextBlink -= dt;
    if (nextBlink <= 0 && blinkT < 0) blinkT = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      const p = blinkT / 0.16;
      eyeOpen = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2;
      if (p >= 1) { eyeOpen = 1; blinkT = -1; nextBlink = 1.8 + Math.random() * 3.5; }
      drawFace(faceCur, ease(Math.max(0, eyeOpen)));
    }
  }
}
const ease = x => 1 - (1 - x) * (1 - x);

// ─── frame loop ───────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const up = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const H = 1 / 240;
let acc = 0;

let simT = 0;
// ─── intro: grow from nothing with a full turn, in place ──────────────────
// Scale 0 → 1 on an ease-out-back (overshoots ~8%, settles) while the bot
// makes one full turn on its vertical axis, ending face-on; shadows grow with
// it. A grab or a state pick finishes it instantly.
const intro = { active: true, t: 0, scale: 0, greeted: false };
const GREET_AT = 0.6;       // s into the intro: as the scale overshoot peaks and the turn swings home
const GREET_FOR = 1.7;      // s of greeting before it melts into idle
const INTRO = { delay: 0.12, scale: 0.75, spin: 0.95 };
const easeOutBack = (x, c = 1.9) => 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
const easeOutCubicI = (x) => 1 - (1 - x) ** 3;
function updateIntro(dt) {
  if (!intro.active) return;
  intro.t += dt;
  const t = Math.max(0, intro.t - INTRO.delay);
  const ps = Math.min(1, t / INTRO.scale), pr = Math.min(1, t / INTRO.spin);
  intro.scale = Math.max(0, easeOutBack(ps));
  m.spin = Math.PI * 2 * (1 - easeOutCubicI(pr));   // 360° → 0: turns to its left, ends face-on
  m.spinV = 0;
  if (!intro.greeted && intro.t >= GREET_AT) {
    // no pause: it greets while still settling — eyes morph to ^^, the smile
    // and cheeks bloom, a little happy hop + wave — then melts into idle
    intro.greeted = true;
    setState('greeting', { quiet: true });
    hop(2.2);
    schedule(GREET_FOR, () => {
      if (state !== 'greeting') return;
      setState('idle');
      schedule(0.2, () => { if (state === 'idle') setVisor(true, { slow: true }); });   // settles in, then the visor glides down
    });
  }
  if (ps >= 1 && pr >= 1) endIntro();
}
function endIntro() {
  if (!intro.active) return;
  intro.active = false;
  intro.greeted = true;
  intro.scale = 1;
  m.spin = 0; m.spinV = 0;
  m.homing = true; m.home = 0; m.glideF = 0;
}

// ─── idle glances ─────────────────────────────────────────────────────────
// In Idle the bot looks around: slight left → slight right → up-left →
// up-right → back to centre, holding each glance ~2 s (with a little jitter)
// and sometimes blinking as it shifts. A slow, critically damped spring
// (ζ = 1, ~1.5 s to arrive, no overshoot) drives the look so it drifts
// unhurriedly; leaving Idle eases it back to centre.
const GLANCES = [               // [yaw, pitch]  (+yaw = its face turns right on screen, −pitch = up)
  [-0.2, 0], [0.2, 0], [-0.16, -0.12], [0.16, -0.12], [0, 0],
];
const gaze = { yaw: 0, pitch: 0, vy: 0, vp: 0, ty: 0, tp: 0, i: -1, hold: 1.4 };
function updateGaze(dt) {
  if (state === 'idle' && !m.dragging && !intro.active) {
    gaze.hold -= dt;
    if (gaze.hold <= 0) {
      gaze.i = (gaze.i + 1) % GLANCES.length;
      [gaze.ty, gaze.tp] = GLANCES[gaze.i];
      const centre = gaze.ty === 0 && gaze.tp === 0;
      gaze.hold = (centre ? 2.8 : 2.0) + Math.random() * 0.8;
      if (Math.random() < 0.3 && blinkT < 0) nextBlink = 0.05;     // blink as it shifts its gaze
    }
  } else {
    gaze.ty = 0; gaze.tp = 0; gaze.i = -1; gaze.hold = 0.9;        // back to centre; restart the loop later
  }
  const K = 6, D = 2 * Math.sqrt(K);                  // critically damped: smooth, no overshoot
  gaze.vy += (K * (gaze.ty - gaze.yaw) - D * gaze.vy) * dt;
  gaze.yaw += gaze.vy * dt;
  gaze.vp += (K * (gaze.tp - gaze.pitch) - D * gaze.vp) * dt;
  gaze.pitch += gaze.vp * dt;
}

// Per-state body pose (offsets on top of gaze / base pitch). Kept as a pure
// function of time so the previous state's pose can keep playing while it
// crossfades into the new one — no snap when a state ends.
const POSE_BLEND_S = 0.5;
let prevState = 'idle', prevStateTime = 0, poseBlend = 1;
function statePose(st, t, st_t) {
  const p = { yaw: 0, pitch: 0, roll: 0, sway: 0 };
  switch (st) {
    case 'idle':
      p.yaw = Math.sin(t * 0.7) * 0.015;             // faint drift between glances
      break;
    case 'working':
      p.yaw = Math.sin(t * 1.5) * 0.3;
      p.pitch = 0.1;
      break;
    case 'greeting':
      p.roll = Math.sin(st_t * 9) * 0.2 * Math.exp(-st_t * 1.2) + 0.06;
      break;
    case 'error':
      p.roll = Math.sin(st_t * 18) * 0.1 * Math.exp(-st_t * 3);
      p.pitch = 0.05;
      break;
    case 'angry':
      p.pitch = 0.13;                                  // head down: a glare from under the brows
      p.roll = Math.sin(t * 1.9) * 0.025;              // slow, stiff sway
      break;
    case 'dizzy':
      p.roll = Math.sin(t * 2.6) * 0.24;
      p.pitch = Math.cos(t * 2.6) * 0.14;
      p.yaw = Math.sin(t * 1.3) * 0.18;
      p.sway = Math.sin(t * 2.6) * 0.08;
      break;
    case 'sleepy':
      p.roll = 0.14 + Math.sin(t * 0.8) * 0.03;
      p.pitch = 0.16;
      break;
  }
  return p;
}

function update(dt) {
  simT += dt;
  const t = simT;
  stateTime += dt;
  for (let i = scripts.length - 1; i >= 0; i--) {
    if (stateTime >= scripts[i].at) { const s = scripts[i]; scripts.splice(i, 1); s.fn(); }
  }

  // hover height: a gentle bob, or sitting on the floor when asleep
  if (state === 'sleepy') m.hoverY = FLOOR_Y + R;
  else m.hoverY = HOVER_Y + Math.sin(t * 1.6) * (state === 'working' ? 0.02 : 0.05);

  updateIntro(dt);
  acc += dt;
  while (acc >= H) { stepMotion(H); acc -= H; }

  // state-specific pose (self-driven — never from the cursor)
  updateGaze(dt);
  helmet.update(dt);
  // state pose, crossfaded from the previous state's pose after a change
  poseBlend = Math.min(1, poseBlend + dt / POSE_BLEND_S);
  prevStateTime += dt;
  const cur = statePose(state, t, stateTime);
  const pb = easeInOutCubic(poseBlend);
  const pv = pb < 1 ? statePose(prevState, t, prevStateTime) : cur;
  let yaw = gaze.yaw + lerp(pv.yaw, cur.yaw, pb);
  let pitch = BASE_PITCH + gaze.pitch + lerp(pv.pitch, cur.pitch, pb);
  let roll = lerp(pv.roll, cur.roll, pb);
  const sway = lerp(pv.sway, cur.sway, pb);
  // lean into the spin like a ball rolling off a flick, plus landing wobble
  roll += THREE.MathUtils.clamp(-(m.dragging ? m.dragVel : m.spinV) * 0.012, -0.18, 0.18) - m.rock;
  pitch += m.nod + m.tilt;

  euler.set(pitch, yaw + m.spin, roll, 'YXZ');
  viewRoll = roll;
  body.quaternion.setFromEuler(euler);
  body.scale.setScalar(Math.max(1e-4, intro.scale));
  const tremble = m.shake ? Math.sin(t * 90) * m.shake : 0;
  body.position.set(m.x + sway + tremble, m.y, 0);

  updateFace(dt);

  placeShadows();
  // dizzy orbit — three beads circling above the head
  up.set(0, 1, 0).applyQuaternion(body.quaternion);
  orbiters.forEach((o, i) => {
    const on = state === 'dizzy' ? 1 : 0;
    o.scale.setScalar(THREE.MathUtils.lerp(o.scale.x, on, 1 - Math.exp(-dt * 10)));
    o.visible = o.scale.x > 0.01;
    if (!o.visible) return;
    const a = t * 3.2 + o.userData.phase;
    tmpV.set(Math.cos(a) * 0.62, 0.02 * Math.sin(a * 2 + i), Math.sin(a) * 0.36);
    o.position.copy(body.position).addScaledVector(up, 1.55).add(tmpV);
  });

  // Zz — drift up and to the right, then fade
  if (state === 'sleepy') {
    zTimer -= dt;
    if (zTimer <= 0) {
      zTimer = 1.15;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false, toneMapped: false }));
      sp.userData.age = 0;
      sp.position.copy(body.position).add(new THREE.Vector3(0.55, 0.95, 0.3));
      scene.add(sp);
      zs.push(sp);
    }
  }
  for (let i = zs.length - 1; i >= 0; i--) {
    const z = zs[i];
    z.userData.age += dt;
    const a = z.userData.age;
    z.position.x += dt * 0.22 + Math.sin(a * 3) * dt * 0.08;
    z.position.y += dt * 0.38;
    const s = 0.16 + a * 0.12;
    z.scale.set(s, s, 1);
    z.material.opacity = Math.min(1, a * 3) * Math.max(0, 1 - a / 2.6);
    if (a > 2.6) { scene.remove(z); z.material.dispose(); zs.splice(i, 1); }
  }

}

function frame() {
  update(Math.min(clock.getDelta(), 1 / 30));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

drawFace(faceCur, 1);
setState('idle', { quiet: true });
requestAnimationFrame(frame);

// small hook for automated checks
window.orbi = { setState, nudge, helmet, toggleVisor, advance: update, faceCanvas, intro, gaze, replay: () => { setState('idle', { quiet: true }); helmet.setVisorDown(false); syncVisor(); Object.assign(intro, { active: true, t: 0, scale: 0, greeted: false }); }, get state() { return state; }, motion: m, renderer, scene, camera };
