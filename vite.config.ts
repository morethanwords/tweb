import {defineConfig} from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';
import handlebars from 'vite-plugin-handlebars';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {visualizer} from 'rollup-plugin-visualizer';
import checker from 'vite-plugin-checker';
// import devtools from 'solid-devtools/vite'
import autoprefixer from 'autoprefixer';
import {resolve} from 'path';
import {existsSync} from 'fs';
import {ServerOptions} from 'vite';

const rootDir = resolve(__dirname);

const handlebarsPlugin = handlebars({
  context: {
    title: 'Telegram Web',
    description: 'Telegram is a cloud-based mobile and desktop messaging app with a focus on security and speed.',
    url: 'https://web.telegram.org/k/',
    origin: 'https://web.telegram.org/'
  }
});

const serverOptions: ServerOptions = {
  https: false,
  // host: '192.168.92.78',
  port: 8080
};

const NO_MINIFY = false;
const HAS_SOLID = existsSync(resolve(rootDir, 'src/vendor/solid'));

console.log('has built solid', HAS_SOLID);

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
        lintCommand: 'eslint "./src/**/*.{ts,tsx}" --ignore-pattern "/src/solid/*"'
      }
    }),
    solidPlugin(),
    handlebarsPlugin as any,
    serverOptions.https ? basicSsl() : undefined,
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
    minify: NO_MINIFY ? false : undefined
    // rollupOptions: {
    //   input: {
    //     main: './index.html',
    //     sw: './src/index.service.ts'
    //   }
    // }
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
    alias: HAS_SOLID ? {
      'rxcore': resolve(rootDir, 'src/vendor/solid/web/core'),
      'solid-js/jsx-runtime': resolve(rootDir, 'src/vendor/solid/jsx'),
      'solid-js/web': resolve(rootDir, 'src/vendor/solid/web'),
      'solid-js/store': resolve(rootDir, 'src/vendor/solid/store'),
      'solid-js': resolve(rootDir, 'src/vendor/solid')
    } : undefined
  }
});
