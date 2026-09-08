import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
// The npm peer satisfies the compiler only. Runtime imports always use these files.
export const solidAliases = [
  {find: /^solid-js\/jsx-dev-runtime$/, replacement: `${root}src/vendor/solid/dist/solid.js`},
  {find: /^solid-js\/jsx-runtime$/, replacement: `${root}src/vendor/solid/dist/solid.js`},
  {find: /^solid-js\/web$/, replacement: `${root}src/vendor/solid/web/dist/web.js`},
  {find: /^solid-js\/store$/, replacement: `${root}src/vendor/solid/store/dist/store.js`},
  {find: /^solid-js$/, replacement: `${root}src/vendor/solid/dist/solid.js`}
];
