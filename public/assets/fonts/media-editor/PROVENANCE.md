# Photo editor fonts

These five TTF files are unchanged copies of the official Telegram Android
assets at commit `21f7d109` (TelegramMessenger 13.2.2):

`https://github.com/DrKLO/Telegram/tree/21f7d109/TMessagesProj/src/main/assets/fonts`

Copied from `F:/Project/TelegramAndroid/TMessagesProj/src/main/assets/fonts`.
Every file was compared byte-for-byte with the pinned official raw asset.
No conversion, subsetting, renaming of internal font names or outline edits.

| File | Internal face/version | SHA-256 |
| --- | --- | --- |
| rmedium.ttf | Roboto-Medium, 2.138 (2017), native weight 500 | c4a17ec40f13be4a229e34893e3e04f19dd190f48b4908e0649402cb2229e9cb |
| rmediumitalic.ttf | Roboto-MediumItalic, 2.138 (2017), native weight 500 | e03f99f5a301d93f64c75ec7e5c16793701850f7e0a494b388ac05d168a3d241 |
| rcondensedbold.ttf | RobotoCondensed-Bold, 2.137 (2017), weight 700 | 95fba758c813b14b70649a846ec51462b817567f7761fb2f3d4208fca025d573 |
| rmono.ttf | RobotoMono-Regular, 3.000, weight 400 | ab153dea6beb96c27886dcb0414cb7bd48718564358c78fd96cdeb49bc6511a8 |
| mw_bold.ttf | Merriweather-Bold, 2.002, weight 700 | 6b4918689d3f5d2b82b5727e86a56f79909359cfc948ec0bfa5628fd5c30bd05 |

## Copyright and licenses

Roboto Medium, Medium Italic and Condensed Bold:
Copyright 2011 Google Inc. All Rights Reserved.
Apache License 2.0, included in `APACHE-2.0.txt`.
Historical license source:
https://github.com/google/fonts/blob/90abd17b4f97671435798b6147b698aa9087612f/apache/roboto/LICENSE.txt

Roboto Mono:
Copyright 2015 The Roboto Mono Project Authors
(https://github.com/googlefonts/robotomono).
The legacy 3.000 release is Apache License 2.0 (`APACHE-2.0.txt`), not the
license of newer builds. The upstream change from Apache to OFL was made on
2025-03-31 in `086dca623163602ee5f75b8d8ae5534a1863a40f`.
Pre-change license source:
https://github.com/googlefonts/RobotoMono/blob/30867cc8bedee415663cd39f5240b92453138840/LICENSE.txt

Merriweather:
Copyright 2016 The Merriweather Project Authors
(https://github.com/EbenSorkin/Merriweather), with Reserved Font Name
"Merriweather". SIL Open Font License 1.1, included with its matching 2016
notice in `MERRIWEATHER-OFL.txt`.
Historical license source:
https://github.com/google/fonts/blob/b848f42f0bc0a8bc53588c3688ca37890e1db0bd/ofl/merriweather/OFL.txt

## Mapping and known portability gaps

Android source: `PaintTypeface.java:36–43` at `21f7d109`.
`AndroidUtilities.java:2501–2519` assigns weight 700 to paths containing
"medium" on API >=26. The editor aliases therefore bind the original Medium
outlines at 700, without replacing them with Bold or synthesizing bold. Older
Android loads their file-native weight 500. Italic uses the real italic file.

The sixth built-in is `Typeface.create("serif", Typeface.BOLD)`: it has no
fixed bundled font. Browser `serif` at 700 is an explicit, unverified system
fallback, not a claim to match a particular Android version/device.
Optional Android >=29 device families (Google Sans, Dancing Script, Carrois
Gothic SC, Cutive Mono, Droid Sans Mono, Coming Soon) are not bundled here.

Desktop source was read using `git show` at official checkout revision
`a532622be61ffb811c34311583c9fd4828786833`, independently of dirty files:
`Telegram/SourceFiles/editor/photo_editor_inner_common.h:48–54` and
`Telegram/SourceFiles/editor/scene/scene_item_text.cpp:53–77`.
Its catalog is Default / Italic / Serif / Condensed / Monospace, all Qt
DemiBold (600). It has no Merriweather choice and no bundled editor faces.
The browser uses system-ui / serif / monospace as platform-resolved
approximations: browser and Qt defaults are not guaranteed to match cross-OS.

Desktop Condensed requests `QFont::setStretch(78)` of the default face, not
Roboto Condensed. The request is retained as `fontStretch: 78` metadata but is
NOT applied to either preview or export yet. CSS font-stretch selects a font
width rather than guaranteeing Qt's geometric scale, and applying it only to
DOM would disagree with canvas output. A consistent layout/export scaling
implementation remains necessary for exact Desktop condensed rendering.

Editor face aliases do not replace app-wide families. The original eight web
font IDs remain valid for saved documents. Existing baseline coefficients are
unchanged; matching native shaping/baselines is not established by asset parity.
