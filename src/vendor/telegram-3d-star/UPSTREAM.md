# telegram-3d-star (vendored)

`telegram-3d-star` 1.1.0, the 3D star of Telegram Premium and Telegram Stars in WebGL 1, with the particle field
around it: a port of Telegram for Android's `GLIcon` and `StarParticlesView` (see `README.md`, "Provenance and
licence"). Taken from the package's source tree as it was handed over (1.0.0 and 1.1.0 both on 2026-11-10): `src/*.ts`, `assets/` (`star.mesh`, `flecks.png`), `posters/`, `LICENSE`, `README.md` and
`package.json`. Left out: `dist/` (tweb's own build compiles `src/` — nothing imports the compiled modules), `demo/`,
`tests/` (they run on `node --test` against `dist/`, which is not here), `tsconfig.json`, `package-lock.json` and
`.gitignore`. Never mix files from two versions.

What 1.1.0 changed upstream: `src/particles.ts`, new — the particle field, a Canvas 2D layer drawn on the star's
frames (four-point sprites rendered once per page, at most 300 particles, a burst as the star appears and a speed-up
while it is spun, one still frame of 40 particles with reduced motion or without autoplay); the `particles` option
(`options.ts`): a second canvas behind the star's, which the field centres itself on and which gets
`pointer-events: none` while the star lives; `index.ts` lays the field out and runs it from the star's loop; the
README's recommended layout and its tables. `assets/`, `posters/` and `LICENSE` did not change.

How tweb uses it: `src/components/star3D/` — the `Star3D` component (`index.tsx`), the assets and posters through
Vite's `?url` (`assets.ts`: the mesh's bytes and the decoded flecks are loaded once per page and handed over as
`StarAssets`, so the package's own URL loading is never used), and what the animation levels make of it
(`policy.ts`). The component always passes the `particles` canvas, sized to the width of the box that clips it.
The Service Worker caches `.mesh` like the other static files (`index.service.ts`), and `server.js`
compresses it (its MIME, `model/mesh`, is not on compression's list; any other host has to do the same).

The licence: the package is GPL-2.0-only, tweb is GPL-3.0-only. Not settled here.

## Local changes

- `reducedMotion` (`options.ts`, `index.ts`): a new option. Upstream always follows `prefers-reduced-motion: reduce`
  (one still frame, no input). tweb lets the OS preference act only under the a11y layer (`?a11y=1`), through
  `liteMode`'s animation levels, which already pick `autoplay` and `interactive`; so it passes `reducedMotion: false`.
  `undefined`, the default, keeps upstream's behaviour; `true` holds the star still whatever the system says. It
  governs the particle field too: the field's still frame is taken when the star is still or autoplay is off.
- `assets.ts`: `/* @vite-ignore */` in the default base `new URL('../assets/', import.meta.url)`. Vite cannot resolve
  a folder there and warned on every build; tweb passes the assets themselves, so the default is never used.
- Types only, no behaviour (tweb compiles without `strictNullChecks`, which narrows `unknown` less): `resolveLook`
  reads the checked theme through a `StarTheme | undefined` local, `loadAssets` casts its non-object source,
  `preload` annotates its `then` callback's return.
- `index.ts`, `createStar`: everything it takes from the page comes from the canvas's own document and window
  (`canvas.ownerDocument`, its `defaultView`): the visibility guard and its listener, frames and their clock, the
  resize and intersection observers, `matchMedia`, `devicePixelRatio`. Upstream reads the module's globals, which
  in a Document Picture-in-Picture window are the opener's. The window is fixed when the star is created; tweb makes
  a new star when the client moves between windows (`components/star3D`). The field runs on the star's frames and
  observers and at its pixel ratio, so it shares that window; its canvas must be in the same document.
- `particles.ts`: the sprites are made in the field canvas's own document (`canvas.ownerDocument`), cached per
  document (a `WeakMap` of the per-page cache upstream keeps); `sprite()` takes the document as a fourth argument,
  `document` by default, and `createField`'s default sprite maker passes its canvas's.
