# Telegram Desktop photo editor assets

Source: https://github.com/telegramdesktop/tdesktop
Reference revision: `f238e46ff988ec502290f6e691bd67c11cf5c75a`.
License: GPL-3.0; copyright Telegram Desktop contributors. See upstream `LICENSE` and `LEGAL`.

- `flip.png`, `rotate.png`, `paint.png`: `Telegram/Resources/icons/photo_editor/*@3x.png`.
- `stickers.png`: `Telegram/Resources/icons/settings/settings_stickers@3x.png`.
- `check.png`: `Telegram/Resources/icons/player/player_check@3x.png` (24px menu check).
- `undo.svg`, `redo.svg`: `Telegram/Resources/icons/menu/tabs_{undo,redo}.svg`.
- Other SVGs: `Telegram/Resources/icons/photo_editor/`.
- Five original TGS files: `Telegram/Resources/animations/photo_editor/`.
- JSON files are lossless gzip decompressions of those TGS files, for the existing Web K lottie loader.

PNG luminance was converted to alpha with white RGB (Desktop's icon-mask representation), preserving source dimensions at 3x. SVGs and TGS files are unchanged. Rotate is reflected horizontally at render time as requested by upstream `rotate-flip_horizontal`.

Presentation references: `Telegram/SourceFiles/editor/editor.style`, `photo_editor_controls.cpp`, and `color_picker.cpp`. The 422px nominal bar minus 2px padding per side is 418px; height 48px, bottom skip 20px, row gap 6px. Palette order, RGB values, tool order and initial TGS frame follow `color_picker.cpp`.
