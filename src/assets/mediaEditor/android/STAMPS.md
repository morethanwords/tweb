# Android paint stamp provenance

Unmodified binary assets from official TelegramMessenger/Telegram-Android commit
`21f7d109da6ab3506c9e9577f98c6a38771ab335`. No procedural replacement or generated artwork.

Download prefix:
https://raw.githubusercontent.com/TelegramMessenger/Telegram-Android/21f7d109da6ab3506c9e9577f98c6a38771ab335/TMessagesProj/src/main/res/drawable/

| Filename appended to prefix | Bytes | SHA-256 |
| --- | ---: | --- |
| paint_radial_brush.webp | 4464 | d835d955dfe82e752ef119556a18303adb4ef696b72a6139447743657e7073c5 |
| paint_elliptical_brush.webp | 2424 | 725f8b6fcc3d581835c0e5db692eb7d553792da1e2cb069184a25fd58e93a662 |
| paint_neon_brush.webp | 9958 | 0ce0213c3b7a4c65a339676f8599b7cda94931f2fa373ab5bf7b794fe02a9bd3 |

All are 256×256 opaque RGB WebP; the complete upstream tree has only `drawable/`
variants. Red is ordinary coverage, not alpha. Neon uses all three RGB channels.

## License

Upstream's [LICENSE](https://github.com/TelegramMessenger/Telegram-Android/blob/21f7d109da6ab3506c9e9577f98c6a38771ab335/LICENSE)
contains GNU GPL v2. Its [ApplicationLoader.java header](https://github.com/TelegramMessenger/Telegram-Android/blob/21f7d109da6ab3506c9e9577f98c6a38771ab335/TMessagesProj/src/main/java/org/telegram/messenger/ApplicationLoader.java#L1-L7)
identifies Telegram Android source as GPL v2 **or later**, compatible with this
repository's GPL v3. No separate per-asset license was found. Retain upstream
attribution/provenance; these files are not claimed as original tweb artwork.

## Rendering reference

Under `TMessagesProj/src/main/java/org/telegram/ui/Components/` at the same pin:

- `Paint/Brush.java:27–78,106–206,238–294`: parameters, resource IDs, `inScaled=false`.
- `Paint/Texture.java:65–91`: linear clamp, RGBA8 upload and Android fallback.
- `Paint/Render.java:52–99,122–126`: explicit radius, tap without pressure, stamp bounds.
- `Paint/ShaderSet.java:33–40,106–112,126–169`: red coverage, straight composite,
  neon RGB accumulation and composite (intentionally ignores selected alpha).
- `Paint/Painting.java:374–379,560,881`: viewport compensation and truncated alpha override.
- `Paint/RenderView.java:208–210`: native base weight formula.
- `Paint/PersistColorPalette.java:125–139`: raw normalized float preferences.
- `Paint/Views/LPhotoPaintView.java:161–175,2184–2198`: per-tool preferences/ranges.

The isolated renderer is not connected to production. Sampling, native pixel
oracle, Android decoder/GPU precision parity, arrow construction, blur and eraser
compositing remain outside its claim. Browser numerical checks use an independent
CPU reference, not an Android device capture. No legacy CSS-width migration exists.
