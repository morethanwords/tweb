# Telegram 3D Star

The 3D star of Telegram Premium and Telegram Stars for web clients. It draws Telegram for Android's star in WebGL 1,
with its idle turns, glints and drag physics, and the particle field around it, in light and dark themes. Plain ES
modules with types and no runtime dependencies.

## Quick start

Copy `dist/*.js` and `assets/` side by side, and `posters/` if you need the no-WebGL path. The `.d.ts` files are
for TypeScript only.

```html
<div class="star-stage">
  <canvas class="star-field" aria-hidden="true"></canvas>
  <canvas class="star"></canvas>
</div>
<style>
  .star-stage { position: relative; height: 240px; }
  .star-field {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    -webkit-mask-image: linear-gradient(#000 60%, transparent 82%);
    mask-image: linear-gradient(#000 60%, transparent 82%);
  }
  .star { position: absolute; top: 30px; left: calc(50% - 90px); width: 180px; height: 180px; }
</style>
<script type="module">
  import { createStar, isSupported } from './telegram-3d-star/dist/index.js';

  const canvas = document.querySelector('.star');
  const particles = document.querySelector('.star-field');
  if (isSupported()) {
    const star = await createStar(canvas, { kind: 'premium', theme: 'dark', background: '#212121', particles });
    // Later: star.setTheme('light', '#ffffff'); star.destroy();
  }
</script>
```

Make the canvas 1.5 times the size the star should look: the star fills about two thirds of it and turns inside the
rest. A 180 px canvas shows the 120 px hero star, a 132 px canvas the 88 px one. The canvas can have any CSS size; the
star follows it.

The particle field is optional: leave out `particles` for the star alone. Its canvas goes behind the star's, and the
field centres on the star wherever the two canvases sit. The layout above is the one the field is made for: as wide as
the page, 240 px tall for the 120 px star, centred on it, and faded out below it so that text under the star stays
clear.

Demo: run `python3 -m http.server` in this folder and open `http://localhost:8000/demo/`.

## API

| Export | Behaviour |
|---|---|
| `isSupported(): boolean` | Whether the browser draws the star: WebGL 1 that is not a software renderer. Cached after the first call. |
| `createStar(canvas, options?): Promise<Star>` | Loads the assets, once per base URL for the whole page, and starts drawing. Rejects with a `TypeError` for a bad option, and with an `Error` when WebGL cannot draw the star or an asset fails to load. |
| `preload(assets?): Promise<void>` | Starts the download early, so that a later `createStar` draws sooner. Takes the same `assets` as the options. |
| `PAGE_COLORS` | The default page colours: `light` `#ffffff`, `dark` `#212121`. |
| Types | `Star`, `StarOptions`, `StarKind`, `StarTheme`, `StarAssets`. |

### Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `kind` | `'premium'` or `'stars'` | `'premium'` | The violet Premium star or the golden Stars star. |
| `theme` | `'dark'` or `'light'` | from `background` | Dark when the background's luminance is under 0.5. `'light'` when neither is given. |
| `background` | `#rgb`, `#rrggbb`, `rgb()` or `rgba()` | `PAGE_COLORS[theme]` | The page colour behind the canvas. The Premium star's glass refracts it at the edges. |
| `assets` | URL string, `URL` or `{ mesh, flecks }` | the `assets/` folder next to `dist/` | Where `star.mesh` and `flecks.png` live, or the assets already in memory: `mesh` an `ArrayBuffer`, `flecks` a decoded image. |
| `interactive` | boolean | `true` | Drag to spin, tap to push. |
| `autoplay` | boolean | `true` | Idle turns and glints. Off, the star rests and runs frames only while it fades in or is dragged, and the field shows one still frame. |
| `maxPixelRatio` | number, at least 1 | `2` | Cap on the backing store's pixel ratio. A 3x screen draws 2.25 times the pixels for no visible gain. |
| `particles` | canvas | none | A second canvas, behind the star, for the particle field. It must not be the star's canvas. While the star lives this canvas gets `pointer-events: none`. |

### Star

| Member | Behaviour |
|---|---|
| `canvas` | The canvas it draws into. |
| `setTheme(theme, background?)` | Switches the look and redraws. `background` defaults to `PAGE_COLORS[theme]`. |
| `setKind(kind)` | Switches between the Premium and the Stars star. |
| `pause()`, `resume()` | Holds the current frame, then carries on from it. |
| `destroy()` | Stops, removes its listeners and observers, deletes every GL object and loses the context. Both canvases go blank, and the field's canvas gets its pointer events back. Draw a new star on a new canvas. |

## Theming

| Kind | Dark theme | Light theme |
|---|---|---|
| `premium` | Telegram's gradient, `#a767ff` to `#55a5ff`, with a strong rest light. | Deep violet, `#6b4dff` with a `#3d8bff` accent, and a pale blue light that lights the faces only while the star turns. |
| `stars` | Gold, `#fec846` to `#ec920a`. | The same. |

Pass the colour the user sees behind the canvas: `getComputedStyle(element).backgroundColor` works as it is. Call
`setTheme` when the client's theme changes. The star does not follow `prefers-color-scheme` by itself.

The particles take their star's colours in both themes: `#6a94ff`, `#9472fd` and `#e26bd3` around the Premium star,
`#fdd219`, `#f9b004` and `#f09903` around the Stars star.

## Behaviour

| Part | Behaviour |
|---|---|
| Entrance | Fades in over 14 frames. |
| Idle | 2 s after it appears, and 2 s after each animation ends, one of five in a shuffled order: a spin past a full turn that springs back, or one time in four a nod; a slow full turn over 8 s; a turn to its back, held 10 s; and twice two half turns 2 s apart. |
| Glint | A light band sweeps across every 4 s, the first 2.1 s after it appears. |
| Particles | Blurred four-point stars of 4, 10 and 12 px drift straight out from a ring around the star, in a flat band, at 6 px a second. Each lives 2 to 5 s, pops in over 200 ms and fades out over its last 200 ms; the field's edges fade them too. 100 around a 120 px star, scaled by the star's area, at most 300. |
| Particle burst | As the star appears the particles rush out at four times their speed, slowing back over 1.2 s. A spin speeds them up to 3.5 times, easing back after the release. |
| Drag | Past an 8 px slop: half a degree per device pixel across, a twentieth along. The release springs back past rest in 600 ms. |
| Tap | A release within 400 ms without a drag pushes the tapped side away, then springs back. |
| Scroll | The canvas gets `touch-action: pan-y`: horizontal drags spin the star, vertical ones scroll the page. |
| Reduced motion | With `prefers-reduced-motion: reduce`, one still frame at rest and no input. The field shows one still frame of 40 particles. |

## Assets and bytes over the wire

Shaders and the star texture are inlined in `dist/shaders.js`. The page fetches the modules and two assets.

| File | Raw | Gzip |
|---|---|---|
| `dist/*.js`, 9 modules | 44,034 | 14,405 |
| `assets/star.mesh` | 165,482 | 114,602 |
| `assets/flecks.png` | 7,494 | already compressed |
| Total | 217,010 | 136,501 |

Serve `star.mesh` with gzip or Brotli. Assets on another origin need CORS headers, since WebGL takes cross-origin
images only with them.

## Browser support

- WebGL 1, with 16-bit indices and no extensions. ES2020 modules, `ResizeObserver`, `IntersectionObserver` and
  Pointer Events.
- Safari 15 and newer, and current Chrome, Edge and Firefox.
- A software renderer counts as no WebGL (`failIfMajorPerformanceCaveat`).

### Without WebGL

Show a poster in the canvas's place when `isSupported()` is false or `createStar` rejects. Posters are also the
better choice where many stars show at once, such as a list. Each poster is the star at rest, a transparent PNG for
a 180 px box, so it lays out exactly as the canvas.

| Variant | 1x, 180 px | 2x, 360 px | 3x, 540 px |
|---|---|---|---|
| Premium, dark | `premium-dark.png` | `premium-dark@2x.png` | `premium-dark@3x.png` |
| Premium, light | `premium-light.png` | `premium-light@2x.png` | `premium-light@3x.png` |
| Stars, dark | `stars-dark.png` | `stars-dark@2x.png` | `stars-dark@3x.png` |
| Stars, light | `stars-light.png` | `stars-light@2x.png` | `stars-light@3x.png` |

```html
<img src="posters/premium-dark.png" srcset="posters/premium-dark.png 1x, posters/premium-dark@2x.png 2x,
  posters/premium-dark@3x.png 3x" width="180" height="180" alt="">
```

The Premium posters refract the default page colours. On other page colours their edges differ slightly from a live
star. Posters have no particle field: it runs with the live star only.

## Performance

- One WebGL context per star. Browsers keep about 16 live contexts per page, so destroy stars that leave the screen
  for good.
- At most 60 frames a second, on the display's own ticks. Frames stop while the canvas is off screen, the page is
  hidden, the star is paused or reduced motion is on.
- The backing store is the canvas's CSS size times `devicePixelRatio`, capped by `maxPixelRatio` (default 2). A 180 px canvas is 360 x 360 on a 3x screen.
- The mesh is parsed once per page and shared by every star. Each star uploads its own buffers and textures.
- The particle field is a Canvas 2D layer that draws on the star's frames: at most 300 sprites a frame, from nine
  sprites rendered once per page. Its backing store follows the same pixel ratio cap.

## Development

| Command | Does |
|---|---|
| `npm ci` | Installs TypeScript, the only dependency, for development. |
| `npm run build` | Compiles `src/` to `dist/`: JavaScript and `.d.ts`. |
| `npm test` | Builds, then runs `tests/` with `node --test`. Needs Node 22.18 or newer. |

`src/index.ts` holds the API and the frame loop, `renderer.ts` the WebGL program, `motion.ts` the animations,
`particles.ts` the particle field, `mesh.ts` the mesh format, `shaders.ts` the shaders.

## Provenance and licence

This is a port of Telegram for Android's `GLIcon` (`Icon3D`, `GLIconRenderer`, `GLIconTextureView`, `ObjLoader`) and
`StarParticlesView` from github.com/DrKLO/Telegram, `TMessagesProj/src/main/java/org/telegram/ui/Components/Premium/`.
The mesh, textures, shaders and particle field come from the same repository, under `TMessagesProj/src/main/`:

| Here | Upstream |
|---|---|
| `assets/star.mesh` | `assets/models/star.binobj`, repacked losslessly: each distinct vertex once, indexed triangles |
| `assets/flecks.png` | `assets/flecks.png` |
| `VERTEX` in `src/shaders.ts` | `assets/shaders/vertex2.glsl` |
| `FRAGMENT` in `src/shaders.ts` | `assets/shaders/fragment4.glsl`, with the glint band, a rest highlight and the light theme's turn light added |
| `STAR_TEXTURE_PATH` in `src/shaders.ts` | the path of `res/raw/start_texture.svg` |
| `src/particles.ts` | `java/org/telegram/ui/Components/Premium/StarParticlesView.java` |

The glint's timing follows Telegram for iOS, github.com/TelegramMessenger/Telegram-iOS,
`submodules/TelegramUI/Components/Premium/PremiumStarComponent/Sources/PremiumStarComponent.swift`, and the particles'
entrance burst is modelled on the one in the same file. The particles' colours come from its `PremiumIntroScreen.swift`
and `StarsPurchaseScreen.swift`.

Both repositories are licensed under the GNU General Public License, version 2, and so is this package: see
`LICENSE`. A client that ships it ships it under the same terms.
