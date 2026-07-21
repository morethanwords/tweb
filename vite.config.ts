/// <reference types="vitest/config" />
import {defineConfig} from 'vite';
import solidPlugin from 'vite-plugin-solid';
// @ts-ignore no type declarations
import handlebars from 'vite-plugin-handlebars';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {visualizer} from 'rollup-plugin-visualizer';
import checker from 'vite-plugin-checker';
// import devtools from 'solid-devtools/vite'
import autoprefixer from 'autoprefixer';
import {resolve} from 'path';
import {existsSync, copyFileSync, readFileSync} from 'fs';
import {ServerOptions} from 'vite';
import {watchLangFile} from './watch-lang.js';
import path from 'path';

const rootDir = resolve(__dirname);
const certsDir = path.join(rootDir, 'certs');
const ENV_LOCAL_FILE_PATH = path.join(rootDir, '.env.local');
const LANG_PACK_LOCAL_FILE_PATH = path.join(rootDir, 'src', 'langPackLocalVersion.ts');

const isDEV = process.env.NODE_ENV === 'development';
if(!existsSync(LANG_PACK_LOCAL_FILE_PATH)) {
  copyFileSync(path.join(rootDir, 'src', 'langPackLocalVersion.example.ts'), LANG_PACK_LOCAL_FILE_PATH);
}

if(isDEV) {
  if(!existsSync(ENV_LOCAL_FILE_PATH)) {
    copyFileSync(path.join(rootDir, '.env.local.example'), ENV_LOCAL_FILE_PATH);
  }

  watchLangFile();
}

const handlebarsPlugin = handlebars({
  context: {
    title: 'Telegram Web',
    description: 'Telegram is a cloud-based mobile and desktop messaging app with a focus on security and speed.',
    url: 'https://web.telegram.org/k/',
    origin: 'https://web.telegram.org/'
  }
});

const USE_SSL = false;
const USE_SIGNED_CERTS = USE_SSL && true;
const USE_SELF_SIGNED_CERTS = USE_SSL && false;

// * mkdir certs; cd certs
// * mkcert web.telegram.org
// * chmod 644 web.telegram.org-key.pem
// * nano /etc/hosts
// * 127.0.0.1 web.telegram.org
const host = USE_SSL ? 'web.telegram.org' : 'localhost';

// HTTP/2 for `pnpm start`. Vite serves dev modules unbundled — one request per module —
// and over http/1.1 the browser's ~6-connections-per-origin cap serialises the hundreds
// of module requests into a slow waterfall (lots of "pending"). Enabling https flips the
// dev server to HTTP/2, which multiplexes them all over one connection and kills the
// waterfall. Use mkcert, NOT a self-signed cert: tweb's ServiceWorker refuses to register
// on an untrusted cert. One-time setup:  mkcert -install && (cd certs && mkcert localhost)
// Auto-enabled once the cert exists; off under TWEB_PREVIEW (the merged preview config
// must stay on http for its tooling) and off until the cert is present (no cert → today's
// plain-http dev, unchanged).
const DEV_HTTP2_KEY = path.join(certsDir, 'localhost-key.pem');
const DEV_HTTP2_CERT = path.join(certsDir, 'localhost.pem');
const USE_DEV_HTTP2 = !USE_SSL && !process.env.TWEB_PREVIEW && !process.env.VITEST &&
  existsSync(DEV_HTTP2_KEY) && existsSync(DEV_HTTP2_CERT);

const serverOptions: ServerOptions = {
  host,
  port: USE_SSL ? 443 : 8080,
  watch: {
    // NB: anchor on rootDir. A worktree checkout's own path contains
    // ".claude/worktrees/<name>/", so a bare '**/.claude/**' glob would also match
    // the worktree's OWN src and silently disable all HMR there. Anchoring ignores
    // only this checkout's .claude (and, from the main repo, the worktrees inside it).
    ignored: [resolve(rootDir, '.claude') + '/**']
  },
  sourcemapIgnoreList(sourcePath, sourcemapPath) {
    return sourcePath.includes('node_modules') ||
      sourcePath.includes('logger') ||
      sourcePath.includes('eventListenerBase');
  },
  https: USE_SIGNED_CERTS ? {
    key: path.join(certsDir, host + '-key.pem'),
    cert: path.join(certsDir, host + '.pem')
  } : USE_DEV_HTTP2 ? {
    key: readFileSync(DEV_HTTP2_KEY),
    cert: readFileSync(DEV_HTTP2_CERT)
  } : undefined
};

const SOLID_SRC_PATH = 'src/solid/packages/solid';
const SOLID_BUILT_PATH = 'src/vendor/solid';
const USE_SOLID_SRC = false;
const SOLID_PATH = USE_SOLID_SRC ? SOLID_SRC_PATH : SOLID_BUILT_PATH;
const USE_OWN_SOLID = existsSync(resolve(rootDir, SOLID_PATH));

const NO_MINIFY = false;
const BASIC_SSL_CONFIG: Parameters<typeof basicSsl>[0] = USE_SELF_SIGNED_CERTS ? {
  name: host,
  certDir: certsDir
} : undefined;

const ADDITIONAL_ALIASES = {
  'solid-transition-group': resolve(rootDir, 'src/vendor/solid-transition-group'),
  '@components': resolve(rootDir, 'src/components'),
  '@helpers': resolve(rootDir, 'src/helpers'),
  '@hooks': resolve(rootDir, 'src/hooks'),
  '@stores': resolve(rootDir, 'src/stores'),
  '@lib': resolve(rootDir, 'src/lib'),
  '@appManagers': resolve(rootDir, 'src/lib/appManagers'),
  '@richTextProcessor': resolve(rootDir, 'src/lib/richTextProcessor'),
  '@environment': resolve(rootDir, 'src/environment'),
  '@customEmoji': resolve(rootDir, 'src/lib/customEmoji'),
  '@config': resolve(rootDir, 'src/config'),
  '@vendor': resolve(rootDir, 'src/vendor'),
  '@layer': resolve(rootDir, 'src/layer'),
  '@types': resolve(rootDir, 'src/types'),
  '@': resolve(rootDir, 'src')
};

if(USE_OWN_SOLID) {
  console.log('using own solid', SOLID_PATH, 'built', !USE_SOLID_SRC);
} else {
  console.log('using original solid');
}

export default defineConfig({
  plugins: [
    // devtools({
    //   /* features options - all disabled by default */
    //   autoname: true // e.g. enable autoname
    // }),
    process.env.VITEST || process.env.TWEB_PREVIEW ? undefined : checker({
      typescript: true,
      eslint: {
        // for example, lint .ts and .tsx
        lintCommand: 'eslint "./src/**/*.{ts,tsx}" --ignore-pattern "/src/solid/*"',
        useFlatConfig: true,
        // Only watch src/ for re-lint. The checker's default watchTarget is the project
        // ROOT, and its ignore filter skips files but never directories — so chokidar
        // descends into the .claude git worktrees (~40k dirs) and crashes the dev server
        // with "EMFILE: too many open files, watch" on macOS. The lint glob is src-only.
        watchPath: 'src'
      }
    }),
    solidPlugin(),
    handlebarsPlugin as any,
    USE_SELF_SIGNED_CERTS ? basicSsl(BASIC_SSL_CONFIG) : undefined,
    // Only emit the bundle treemap (stats.html) when explicitly analyzing (ANALYZE=1):
    // it adds build time and writes a ~1.3MB file that otherwise gets globbed into the
    // dep scan. Run `ANALYZE=1 pnpm build` to generate it.
    process.env.ANALYZE ? visualizer({
      gzipSize: true,
      template: 'treemap'
    }) : undefined
  ].filter(Boolean),
  test: {
    // include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // git worktrees live here with their own copies of every test file —
      // without this, `pnpm test <pattern>` runs each match N+1 times at once
      '**/.claude/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/solid/**',
      // Playwright browser specs live here and must not be run by vitest (jsdom)
      '**/e2e/**'
    ],
    // coverage: {
    //   provider: 'v8',
    //   reporter: ['text', 'lcov'],
    //   include: ['src/**/*.ts', 'store/src/**/*.ts', 'web/src/**/*.ts'],
    //   exclude: ['**/*.d.ts', 'src/server/*.ts', 'store/src/**/server.ts']
    // },
    environment: 'jsdom',
    // otherwise, solid would be loaded twice:
    // deps: {registerNodeLoader: true},
    pool: 'forks',
    globals: true,
    setupFiles: ['./src/tests/setup.ts']
  },
  server: serverOptions,
  base: '',
  // Pin the dep-optimizer's scan to the real entry (index.html → src/index.ts).
  // Otherwise Vite auto-globs every *.html (stats.html, public/*.html, the icomoon
  // demo.html) as scan entries, and a parse error in any of them (e.g. the stale
  // public/*.js build artifacts with merge-conflict markers) aborts the whole scan
  // and disables dependency pre-bundling — making cold dev loads slow and reload-prone.
  optimizeDeps: {
    entries: ['index.html']
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    assetsDir: '',
    copyPublicDir: false,
    emptyOutDir: true,
    minify: NO_MINIFY ? false : undefined,
    rollupOptions: {
      output: {
        sourcemapIgnoreList: serverOptions.sourcemapIgnoreList
      }
      // input: {
      //   main: './index.html',
      //   sw: './src/index.service.ts'
      // }
    }
    // cssCodeSplit: true
  },
  worker: {
    format: 'es'
  },
  css: {
    devSourcemap: true,
    postcss: {
      plugins: [
        autoprefixer({}) // add options if needed
      ]
    }
  },
  resolve: {
    // conditions: ['development', 'browser'],
    alias: USE_OWN_SOLID ? {
      'rxcore': resolve(rootDir, SOLID_PATH, 'web/core'),
      'solid-js/jsx-runtime': resolve(rootDir, SOLID_PATH, 'jsx'),
      'solid-js/web': resolve(rootDir, SOLID_PATH, 'web'),
      'solid-js/store': resolve(rootDir, SOLID_PATH, 'store'),
      'solid-js': resolve(rootDir, SOLID_PATH),
      ...ADDITIONAL_ALIASES
    } : ADDITIONAL_ALIASES
  }
});
