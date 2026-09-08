# Retained Roboto font notices

Copyright 2011 Google Inc. All Rights Reserved.

The six Roboto WOFF2 files in `src/shell/assets/fonts` are licensed under the
Apache License, Version 2.0. The complete license is included in
[LICENSE-Roboto-Apache-2.0.txt](LICENSE-Roboto-Apache-2.0.txt), copied unchanged
from [the Apache Software Foundation](https://www.apache.org/licenses/LICENSE-2.0.txt).

This identification comes from the **actual retained font binaries**, rather
than the license of a newer Roboto release. FreeType's `FT_Get_Sfnt_Name` reads
the following OpenType name table records in all six files:

| Name ID | Embedded value |
| --- | --- |
| 0 — copyright | Copyright 2011 Google Inc. All Rights Reserved. |
| 5 — version | Version 2.137; 2017 |
| 14 — license URL | http://www.apache.org/licenses/LICENSE-2.0 |

Name ID 13 (license description) is absent in these subsets. No description
or trademark notice is invented to fill that absence.

The three `KFOm…` files identify their family as `Roboto`; the three `KFOl…`
files identify it as `Roboto Medium`. Their filenames, SHA-256 hashes and
extracted records are recorded in [Roboto-metadata.json](Roboto-metadata.json).

All six font binaries are unchanged copies of
`public/assets/fonts` at
[morethanwords/tweb commit 4a82cc7667477751cfc1b0dcec75db539c797a03](https://github.com/morethanwords/tweb/tree/4a82cc7667477751cfc1b0dcec75db539c797a03/public/assets/fonts).
Their original-source hashes are also preserved in
`reference/upstream-manifest.json`. The shell changes the CSS font-loading
declarations, not the font binaries.
