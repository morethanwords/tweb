import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/companion',fullyParallel:false,workers:1,
  timeout:45_000,expect:{timeout:8000},reporter:[['list']],
  outputDir:'semantic-artifacts/browser-results',
  use:{baseURL:'http://127.0.0.1:3131',trace:'retain-on-failure',screenshot:'only-on-failure',contextOptions:{reducedMotion:'reduce'}},
  projects:(['chromium','webkit'] as const).flatMap(browserName=>[{width:1280,height:900},{width:375,height:812},{width:375,height:480}].map(viewport=>({name:browserName+'-'+viewport.width+'x'+viewport.height,use:{browserName,viewport}}))),
  webServer:{command:'node semantic-dist/semantic-entry.js --port 3131 --token-file semantic-artifacts/test-capability',url:'http://127.0.0.1:3131/',reuseExistingServer:false,timeout:20_000}
});
