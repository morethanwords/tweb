import {defineConfig} from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';
import handlebars from 'vite-plugin-handlebars';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {visualizer} from 'rollup-plugin-visualizer';
import checker from 'vite-plugin-checker';
// import devtools from 'solid-devtools/vite'
import autoprefixer from 'autoprefixer';
import {resolve} from 'path';
import {existsSync, copyFileSync} from 'fs';
import {ServerOptions} from 'vite';
import {watchLangFile} from './watch-lang.js';
import path from 'path';

const rootDir = resolve(__dirname);
const certsDir = path.join(rootDir, 'certs');
const ENV_LOCAL_FILE_PATH = path.join(rootDir, '.env.local');

const isDEV = process.env.NODE_ENV === 'development';
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

const USE_SSL = true;
const USE_SIGNED_CERTS = USE_SSL && true;
const USE_SELF_SIGNED_CERTS = USE_SSL && false;

// * mkdir certs; cd certs
// * mkcert web.telegram.org
// * chmod 644 web.telegram.org-key.pem
// * nano /etc/hosts
// * 127.0.0.1 web.telegram.org
const host = USE_SSL ? 'web.telegram.org' : 'localhost';
const serverOptions: ServerOptions = {
  host,
  port: USE_SSL ? 443 : 8080,
  sourcemapIgnoreList(sourcePath, sourcemapPath) {
    return sourcePath.includes('node_modules') ||
      sourcePath.includes('logger') ||
      sourcePath.includes('eventListenerBase');
  },
  https: USE_SIGNED_CERTS ? {
    key: path.join(certsDir, host + '-key.pem'),
    cert: path.join(certsDir, host + '.pem')
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
  'solid-transition-group': resolve(rootDir, 'src/vendor/solid-transition-group')
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
    process.env.VITEST ? undefined : checker({
      typescript: true,
      eslint: {
        // for example, lint .ts and .tsx
        lintCommand: 'eslint "./src/**/*.{ts,tsx}" --ignore-pattern "/src/solid/*"',
        useFlatConfig: true
      }
    }),
    solidPlugin(),
    handlebarsPlugin as any,
    USE_SELF_SIGNED_CERTS ? basicSsl(BASIC_SSL_CONFIG) : undefined,
    visualizer({
      gzipSize: true,
      template: 'treemap'
    })
  ].filter(Boolean),
  test: {
    // include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/solid/**'
    ],
    // coverage: {
    //   provider: 'v8',
    //   reporter: ['text', 'lcov'],
    //   include: ['src/**/*.ts', 'store/src/**/*.ts', 'web/src/**/*.ts'],
    //   exclude: ['**/*.d.ts', 'src/server/*.ts', 'store/src/**/server.ts']
    // },
    environment: 'jsdom',
    testTransformMode: {web: ['.[jt]sx?$']},
    // otherwise, solid would be loaded twice:
    // deps: {registerNodeLoader: true},
    // if you have few tests, try commenting one
    // or both out to improve performance:
    threads: false,
    isolate: false,
    globals: true,
    setupFiles: ['./src/tests/setup.ts']
  },
  server: serverOptions,
  base: '',
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
