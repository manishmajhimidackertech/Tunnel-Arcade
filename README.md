# Tunnel Arcade

An endless 3D tunnel flyer for the browser, built with [Three.js](https://threejs.org/) and inspired by the
mobile game *Tunnel Trouble 3D*.
Pilot a small spaceship through an endless, twisting tunnel, slip through the gaps in the doors, dodge the
bars and (in Mine Mode) steer around drifting mines. The game is an installable Progressive Web App that works
fully offline once loaded.

## Features

- **Two modes:** *Classic* (doors and bars) and *Mine Mode* (adds clusters of drifting mines). Best scores are kept per mode.
- **Four tunnel styles** modelled on the original: *Reactor* (dark metal, cyan light strips), *Laboratory* (white chevron panels),
  *Bunker* (concrete with small lamps) and *Catacomb* (sandstone arches). The style changes as you fly deeper.
- **Obstacles:** red-rimmed doors with triangle, half, slot, cross, circle and spoke-shaped openings; striped bars (full,
  half, Y, twin, plus); spinning variants unlock as the run gets harder.
- **Slow-motion pickups:** once a run has built up real pace (about a minute in), a glowing hourglass appears every
  few obstacles. Grabbing it smoothly eases the world down to under half speed for a few seconds and then back up
  (your steering stays at full speed), and adds a small score bonus. Pickups are never placed at
  random: each one sits on a line that is guaranteed safe to fly straight through the next obstacle, accounting for
  spinning doors, drifting mines and the tunnel's roll.
- **Curving, rolling tunnel** using a vertex-shader bend, so the tunnel snakes and spirals ahead of you while collisions stay exact.
- Green **LED dot-matrix "3-2-1-GO!"** countdown and tip banners, like the original.
- **Controls:** floating on-screen joystick (drag anywhere), arrow keys / WASD, a gamepad, or **tilt steering** on
  phones and tablets (toggle it in the menu). Optional inverted Y axis.
- **Landscape on phones:** the game asks you to rotate a phone held upright (and pauses a run if you do), and locks
  to landscape where the browser allows it.
- **Synthesised audio:** engine hum, whooshes, explosion and a looping synthwave track, all generated with WebAudio (no audio files).
- **No image assets:** every texture is drawn procedurally on a canvas at start-up; the only downloads are the JS bundle,
  CSS, the Orbitron font and the app icons.
- **PWA:** web app manifest, icons (including maskable), and a service worker that precaches the whole build so the game
  runs offline. Updates install in the background and show a "tap to reload" notice.
- Adaptive resolution: the render scale drops automatically on devices that can't hold ~45 fps.

## Controls

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Steer | Drag anywhere (floating joystick) | Arrow keys / WASD | Left stick / D-pad |
| Start / retry | Tap a mode / Retry | Enter or Space | A |
| Pause | Pause button (top left) | Esc or P | Start |

**Tilt steering** (phones/tablets): tilt the phone toward the side you want to go, like rolling a ball on a tray.
The way you hold the phone when a run starts (or resumes) counts as "straight ahead". iOS asks for motion-sensor
permission the first time you turn it on.

**Invert Y** flips up and down for every control: pushing the joystick or tilting the phone up moves the ship down,
like the pull-back-to-climb controls of a flight simulator.

## Getting started

Requires Node.js 20.19+ (Vite 8).

```bash
npm install
npm run dev       # local dev server with hot reload (service worker disabled)
npm test          # unit tests for collision maths and obstacle layouts
npm run build     # production build in dist/ (includes the generated sw.js)
npm run preview   # serve the production build locally, e.g. to test offline/install
```

The build uses a relative base path, so `dist/` can be served from any folder or sub-path. A PWA must be served over
HTTPS (or `localhost`) for the service worker and the install prompt to work.

### Deploying to GitHub Pages

`.github/workflows/pages.yml` runs the tests and build on every push and pull request, and deploys `dist/` to GitHub
Pages on pushes to `main`. Enable it once under **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.

### Debug URL flags

- `?god`: invincible ship, for testing (scores are not saved as records).
- `?debug`: exposes the running game as `window.game` in the console.

## Project layout

```
index.html                 HUD, menus and overlays
public/                    manifest.webmanifest and app icons (icon.svg is the source for the PNGs)
src/main.js                bootstrapping, button wiring, visibility handling
src/game.js                renderer, game state machine, camera, difficulty and scoring
src/config.js              tuning constants (speeds, sizes, distances)
src/logic/collision.js     pure 2D/3D collision helpers
src/logic/patterns.js      door/bar layouts, mine clusters and obstacle selection
src/logic/pickups.js       safe placement of slow-motion pickups
src/logic/steering.js      joystick response curve and steering easing
src/world/tunnel.js        recycled tunnel segments and ribs
src/world/themes.js        the four tunnel styles (procedural textures, fog, lighting)
src/world/obstacles.js     door, bar and mine meshes, spawning and collision
src/world/ship.js          the spaceship model and engine glow
src/world/bend.js          vertex-shader bend and roll for the curving tunnel
src/world/effects.js       crash explosion
src/world/textures.js      canvas texture helpers
src/ui/                    DOM UI and LED dot-matrix renderer
src/input.js               keyboard, joystick and gamepad input
src/audio.js               WebAudio sound effects and music
src/pwa.js                 service worker registration and install button
src/sw.js                  service worker template (vite.config.js fills in the precache list)
test/                      node:test unit tests
```

## How it works

- The simulation runs in a straight tunnel: the ship moves in the tunnel's cross-section and obstacles sit at distances
  along it. Collisions are simple 2D tests (circle in polygon hole, circle against capsule) plus swept checks along the
  tunnel so fast frames can't skip thin doors.
- Every world material is patched with `onBeforeCompile` to offset vertices sideways by `bend * depth²` in view space,
  and the whole tunnel slowly rolls around its axis. The tunnel therefore looks like it curves and twists without
  complicating the physics.
- Tunnel segments are recycled as you fly, taking on the style of the stretch of tunnel they now represent.
