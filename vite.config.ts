import {defineConfig} from 'vite';
import solidPlugin from 'vite-plugin-solid';
import handlebars from 'vite-plugin-handlebars';
import basicSsl from '@vitejs/plugin-basic-ssl';

const handlebarsPlugin = handlebars({
  context: {
    title: 'Telegram Web',
    description: 'Telegram is a cloud-based mobile and desktop messaging app with a focus on security and speed.',
    url: 'https://web.telegram.org/k/',
    origin: 'https://web.telegram.org/'
  }
});

const USE_HTTPS = false;

export default defineConfig({
  plugins: [
    solidPlugin(),
    handlebarsPlugin as any,
    USE_HTTPS ? basicSsl() : undefined
  ].filter(Boolean),
  server: {
    port: 8080,
    https: USE_HTTPS
  },
  base: '',
  build: {
    target: 'es2020',
    sourcemap: true,
    assetsDir: ''
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
    devSourcemap: true
  }
});
