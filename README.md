# 3D noon bot

Orbi, the noon assistant bot, built in 3D with three.js: a satin-yellow ball with
morphing facial expressions, wearing a 1:1 3D build of the Figma `Orbi Soft Helmet`.

## Run

No build step. Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Two bots

- **Bot 1 — Orbi**: the yellow ball with the helmet (default).
- **Bot 2**: a 3D build of the Figma "new bot" (1154:78182) — purple speckled head with
  moulded ear pods and lenses, a satin-metal bezel and a dark glass screen with rolling
  retro-TV scanlines, whose face glows green. Open it with `?bot=2`, the **Bot 1 / Bot 2** switch in the bar, or **B**.

Both share one engine (`main.js`): states, face morphs, blinks, intro, drag / spin,
colour themes and shadows behave identically; only the look differs (Bot 2 has no visor, and a
sideways drag only turns it ~30° with a soft limit, then it springs back face-on — no free spin).

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
- **Shading** — lacquered candy finish (clear coat, inner glow and a brand-tinted edge glow), studio environment lighting, analytic helmet-on-ball occlusion, and the
  Figma drop / contact shadows.

## Files

- `index.html` — page + state bar
- `main.js` — scene, bot, face morphing, motion, intro, shadows
- `helmet.js` — the helmet
- `robo.js` — Bot 2's look (head, ears, bezel, screen face, shadows)
- `vendor/` — three.js r186
