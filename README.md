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

- **States** — Idle, Greeting, Working, Error, Dizzy, Sleepy, Angry (bar at the bottom, or keys 1–7).
  Faces morph smoothly between states; Idle slowly glances left, right, up-left, up-right.
- **Intro** — grows in place with a 360° turn, greets with a smile, settles into Idle, then
  lowers its visor.
- **Interaction** — drag sideways to rotate; on release it coasts with your momentum and
  springs back face-on. Swipe up / down to raise / lower the visor. Tap to bounce.
  ← / → give it a spin.
- **Visor** — hinged smoked-glass flip-up visor (swipe up/down on the bot, the bar button, or V). It swings
  around the hinge axis at the temples without clipping, and drops down after the intro.
- **Colour** — the swatch button at the end of the bar (or C) spins the bot a full 360° and
  swaps the colour while its back is turned. It cycles the brand colours from
  the Figma "colour options" section: noon, supermall, Minutes, Jahez, noon Food, NowNow
  (all but noon toned down to 80% saturation so they don't shout on the 3D ball).
  The ball (including its sheen, rim light and helmet shade), the helmet artwork and the
  stitching blend to the new colour, and the front noon wordmark turns white on every colour
  except noon yellow; the choice is remembered per browser.
- **Helmet** (`helmet.js`) — shell, artwork, liner + stitching built from the Figma
  component's SVG paths; glass visor + hinges; procedural paint, leather and metal detail.
- **Shading** — a soft brand-colour → white gradient down the ball, studio environment lighting, analytic helmet-on-ball occlusion, and the
  Figma drop / contact shadows.

## Files

- `index.html` — page + state bar
- `main.js` — scene, bot, face morphing, motion, intro, shadows
- `helmet.js` — the helmet
- `vendor/` — three.js r186
