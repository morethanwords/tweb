# Telegram Android media editor controls

Source: https://github.com/DrKLO/Telegram
Reference checkout: `62b56a07ca7e30e39f7fd00a6728d6bbd716ca1c`.
Copyright Telegram contributors; upstream `LICENSE` is GNU GPL v2.
Resources retain their upstream licensing; they are not relicensed here.

Resources copied byte-for-byte from `TMessagesProj/src/main/res/`:

- `drawable-xxhdpi/`: `media_crop`, `media_draw`, `media_settings`,
  `msg_photo_flip`, `msg_photo_cropfix`, `msg_photo_rotate`,
  `msg_photo_settings`, `msg_photo_blur`, `msg_photo_curve`,
  `msg_text_outlined`, `msg_add`, `msg_msgbubble`, `msg_msgbubble2`
  (WebP; transparent padding retained).
- `raw/`: `photo_pen`, `photo_marker`, `photo_neon`, `photo_arrow`,
  `photo_eraser`, `photo_blur`, `photo_text_allign` (Lottie JSON).
- `drawable/photo_undo2.xml`: exact path converted to `photo_undo2.svg`.
- `drawable/`: `photo_circle`, `photo_circle_fill`, `photo_rectangle`,
  `photo_rectangle_fill`, `photo_star`, `photo_star_fill`, `photo_arrowshape`:
  vector path and stroke attributes
  converted to SVG without changing viewport or bounds.

Presentation references: `PhotoViewer.java`, `Components/PhotoFilterView.java`,
`Components/Crop/CropRotationWheel.java`, and `Components/Paint/Views/`:
`LPhotoPaintView.java`, `PaintToolsView.java`, `PaintTextOptionsView.java`,
`PaintCancelView.java`, `PaintDoneView.java`. The latter two supply the SVG
stroke coordinates in `PaintMark`; palette values come from `PersistColorPalette.java`.

This is a presentation port, not a claim of complete native parity. Blur/curves
and tint use the shared `NativeAdjustmentModes` engine controls. Fonts remain
the web engine's fonts. The sticker picker reuses the web engine's picker,
not Android's full native nested sheet. See the implementation handoff for
remaining differences.
