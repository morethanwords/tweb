/*
 * Types for `*.module.scss`.
 *
 * `typed-scss-modules` writes a `foo.module.d.scss.ts` next to every module, which TypeScript picks
 * up for `import styles from './foo.module.scss'` thanks to `allowArbitraryExtensions` in
 * tsconfig.json. Without it `styles.whatever` is `any` (the wildcard in `vite/client`), so a typo or
 * a class that was dropped from the SCSS renders as `class={undefined}` and nobody notices.
 *
 * The generated files are gitignored: they are build output, and a checkout without them simply
 * falls back to the untyped wildcard instead of failing to compile. `pnpm run typecheck` (and so
 * `pnpm run build`) regenerates them first; the dev server keeps them fresh through `watchScssTypes`.
 */

const {spawn, spawnSync} = require('child_process');

const GLOB = 'src/**/*.module.scss';

const ARGS = [
  GLOB,
  // `foo.module.d.scss.ts` rather than `foo.module.scss.d.ts` — the TypeScript 5+ shape, which does
  // not pretend to be the declaration of a `foo.module.scss.ts` that does not exist.
  '--allowArbitraryExtensions',
  // The SCSS is the source of truth: `.popupContainer` stays `popupContainer`, `.Item` stays `Item`.
  // Any renaming here would put the types out of step with what the bundler actually emits.
  '--nameFormat', 'none',
  '--exportType', 'default',
  '--quoteType', 'single',
  // Leaves a file alone when its classes did not change, so nothing downstream sees a fresh mtime.
  '--updateStaleOnly',
  '--logLevel', 'error'
];

const bin = require.resolve('typed-scss-modules/dist/lib/cli.js');

// Dart Sass shouts about the legacy JS API on every single run; `typed-scss-modules` has no modern
// API mode and no way to silence it, so the block is dropped here instead of in every dev log.
const LEGACY_SASS_API_WARNING = /legacy-js-api/;

const STDIO = ['ignore', 'inherit', 'pipe'];

function forwardStderr(stderr) {
  let carry = '';
  let dropping = false;

  stderr.on('data', (chunk) => {
    const lines = (carry + chunk).split('\n');
    carry = lines.pop();

    const kept = lines.filter((line) => {
      if(LEGACY_SASS_API_WARNING.test(line)) {
        dropping = true;
        return false;
      }

      // the warning comes wrapped in blank lines — they go with it
      if(dropping && !line.trim()) {
        return false;
      }

      dropping = false;
      return true;
    });

    const text = kept.join('\n');
    if(text.trim()) {
      process.stderr.write(text + '\n');
    }
  });
}

function generateScssTypes() {
  const result = spawnSync(process.execPath, [bin, ...ARGS], {stdio: STDIO});
  const stderr = result.stderr?.toString().split('\n').filter((line) => !LEGACY_SASS_API_WARNING.test(line)).join('\n');
  if(stderr?.trim()) {
    process.stderr.write(stderr.trimEnd() + '\n');
  }

  if(result.status) {
    process.exit(result.status);
  }
}

function watchScssTypes() {
  generateScssTypes();

  const child = spawn(process.execPath, [bin, ...ARGS, '--watch', '--ignoreInitial'], {stdio: STDIO});
  forwardStderr(child.stderr);
  const stop = () => child.kill();
  process.on('exit', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return child;
}

if(require.main === module) {
  process.argv.includes('--watch') ? watchScssTypes() : generateScssTypes();
}

module.exports = {generateScssTypes, watchScssTypes};
