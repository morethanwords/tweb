# Fomoed Tweb Fork - Changelog

This is a modified version of Tweb (Telegram Web K), customized for the Fomoed Dashboard project.

## GPL-3.0 License Compliance

This fork is distributed under the GNU General Public License v3.0, in accordance with the original Tweb project license. All modifications made by the Fomoed team are clearly documented below.

**Original Project:** [Tweb by morethanwords](https://github.com/morethanwords/tweb)
**Fork Repository:** [Fomoed Tweb](https://github.com/fomoed-dev/tweb)
**License:** GPL-3.0-only

As required by GPL-3.0 Section 5, this document provides notice of modifications made to the original work. The complete source code, including all modifications, is available in the repository above.

---

## Version 2.2-fomoed.20241120

**Release Date:** November 20, 2024
**Base Version:** Tweb v2.2 (build 606)
**Commit Range:** November 10, 2024 - November 20, 2024

### Changes

#### [178e75d](https://github.com/fomoed-dev/tweb/commit/178e75d03) - 2024-11-10
**updated env and port** - *oladeji*
- Updated Telegram API credentials (API_ID and API_HASH) for Fomoed application
- Changed default server port from 80 to 8083 in docker-compose.yml

#### [05eeac5](https://github.com/fomoed-dev/tweb/commit/05eeac515) - 2024-11-11
**fix: potential icon fix** - *oladeji*
- Modified `src/lang/langSign.ts`

#### [5221748](https://github.com/fomoed-dev/tweb/commit/52217482b) - 2024-11-11
**fix: potential icon fix** - *oladeji*
- Added period to QR login title text for consistency

#### [a55ccca](https://github.com/fomoed-dev/tweb/commit/a55cccad4) - 2024-11-11
**fix: production docker file fix** - *oladeji*
- Docker configuration changes

#### [0218db0](https://github.com/fomoed-dev/tweb/commit/0218db03a) - 2024-11-11
**fix: production docker file fix** - *oladeji*
- Removed redundant pnpm install step in Dockerfile
- Fixed typo: "depenancies" → "dependencies"

#### [c56babd](https://github.com/fomoed-dev/tweb/commit/c56babdda) - 2024-11-12
**fix** - *oladeji*
- General bug fixes

#### [30c7a6e](https://github.com/fomoed-dev/tweb/commit/30c7a6e76) - 2024-11-12
**rebuild** - *oladeji*
- Application rebuild

#### [46156f8](https://github.com/fomoed-dev/tweb/commit/46156f881) - 2024-11-16
**feat: update new version of device_model on telegram connected devices** - *IvanLeovandi*
- Implemented custom device model branding: "Fomoed Dashboard (Browser)"
- Added browser-specific detection (Firefox, Edge, Chrome, Safari)
- Modified `src/lib/mtproto/mtproto_config.ts`
- Replaced generic Telegram Web user agent with Fomoed-specific identifier
- Connected devices in Telegram now show "Fomoed Dashboard" instead of generic web client

#### [01c7220](https://github.com/fomoed-dev/tweb/commit/01c72209a) - 2024-11-20
**fix: fix icon alignment to be centered** - *IvanLeovandi*
- Major CSS fixes across 9 files to center icons using flexbox
- Applied `display: flex`, `align-items: center`, `justify-content: center`
- Fixed icon positioning in:
  - Buttons (`button.scss`)
  - Avatars (`avatar.scss`)
  - Animated icons (`animatedIcon.scss`)
  - Chat interface (`chat.scss`)
  - Input fields (`input.scss`)
  - Left sidebar navigation (`leftSidebar.scss`)
  - Rows (`row.scss`)
- Removed transform-based positioning for better consistency

#### [849bebd](https://github.com/fomoed-dev/tweb/commit/849bebdd9) - 2024-11-20
**Merge pull request #1 from fomoed-dev/fix/icon-fix** - *E-Fund*
- Merged icon alignment fixes into main branch

#### [8df1529](https://github.com/fomoed-dev/tweb/commit/8df1529e1) - 2024-11-20
**rebuild** - *IvanLeovandi*
- Application rebuild after icon fixes

#### [38b989b](https://github.com/fomoed-dev/tweb/commit/38b989b29) - 2024-11-20
**Merge pull request #2 from fomoed-dev/fix/icon-fix** - *E-Fund*
- Final merge of icon alignment improvements

### Contributors
- **oladeji** - Configuration, Docker optimization, initial fixes
- **IvanLeovandi** - Branding, icon alignment, UI improvements
- **E-Fund** - Pull request management and integration

---

## Original Project Attribution

This software is based on **Tweb** (also known as Telegram Web K), originally developed by morethanwords and contributors.

**Original Repository:** https://github.com/morethanwords/tweb
**Official Deployment:** https://web.telegram.org/k/
**Original License:** GPL-3.0-only

Tweb is itself based on Webogram, which has been patched and significantly improved. We are grateful to the original authors and all contributors to the Tweb project for creating such an excellent foundation.

All users of this fork are entitled to the same freedoms granted by the GPL-3.0 license, including:
- Freedom to use the software for any purpose
- Freedom to study how the software works and modify it
- Freedom to redistribute copies
- Freedom to distribute modified versions

## License

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see https://www.gnu.org/licenses/.

---

## Contact & Support

For issues specific to the Fomoed fork, please use the issue tracker at: https://github.com/fomoed-dev/tweb/issues

For issues with the original Tweb project, please refer to: https://bugs.telegram.org/?tag_ids=40&type=issues
