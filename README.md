# 3D noon bot

Orbi, the noon assistant bot, built in 3D with three.js: a satin-yellow ball with
morphing facial expressions, wearing a 1:1 3D build of the Figma `Orbi Soft Helmet`.

## Run

No build step. Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000.

## What's in it

- **States** — Idle, Greeting, Working, Error, Dizzy, Sleepy (bar at the bottom, or keys 1–6).
  Faces morph smoothly between states; Idle slowly glances left, right, up-left, up-right.
- **Intro** — grows in place with a 360° turn, greets with a smile, then settles into Idle.
- **Interaction** — drag to rotate (vertical drag tilts); on release it coasts with your
  momentum and springs back face-on. Tap to bounce. ← / → give it a spin.
- **Helmet** (`helmet.js`) — shell, artwork, liner + stitching, visor and snaps all built from
  the Figma component's SVG paths; procedural paint, leather and metal surface detail.
- **Shading** — studio environment lighting, analytic helmet-on-ball occlusion, and the
  Figma drop / contact shadows.

## Files

- `index.html` — page + state bar
- `main.js` — scene, bot, face morphing, motion, intro, shadows
- `helmet.js` — the helmet
- `vendor/` — three.js r186
