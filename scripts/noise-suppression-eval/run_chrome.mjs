// Plays a WAV into Chromium as its microphone (fake capture device) and
// records what getUserMedia delivers, in real time.
// usage: node run_chrome.mjs <input.wav> <output.wav> <ns|raw>
//   ns   noiseSuppression: true (what tweb asks for today), AEC and AGC off
//   raw  all processing off: checks the capture path itself
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import {readWav, writeWav} from './wav.mjs';

const [input, output, mode] = process.argv.slice(2);
const {samples, rate} = readWav(input);
const seconds = samples.length / rate;

const server = createServer((req, res) => {
  res.writeHead(200, {'content-type': 'text/html'});
  res.end('<!doctype html><title>capture</title>');
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${input}%noloop`,
    '--autoplay-policy=no-user-gesture-required'
  ]
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const settings = await page.evaluate(async(ns) => {
    const stream = await navigator.mediaDevices.getUserMedia({audio: {
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: ns,
      channelCount: 1
    }});
    const context = new AudioContext({sampleRate: 48000});
    const code = `registerProcessor('tap', class extends AudioWorkletProcessor {
      process(inputs) {
        const channel = inputs[0][0];
        this.port.postMessage(channel ? channel.slice(0) : new Float32Array(128));
        return true;
      }
    });`;
    await context.audioWorklet.addModule(URL.createObjectURL(new Blob([code], {type: 'application/javascript'})));
    const tap = new AudioWorkletNode(context, 'tap');
    window.captured = [];
    tap.port.onmessage = (event) => window.captured.push(event.data);
    context.createMediaStreamSource(stream).connect(tap).connect(context.destination);
    return stream.getAudioTracks()[0].getSettings();
  }, mode === 'ns');
  console.log('track settings', JSON.stringify(settings));

  await page.waitForTimeout((seconds + 1.5) * 1000);

  const length = await page.evaluate(() => {
    const total = window.captured.reduce((sum, chunk) => sum + chunk.length, 0);
    const all = new Int16Array(total);
    let offset = 0;
    for(const chunk of window.captured) {
      for(let i = 0; i < chunk.length; ++i) all[offset + i] = Math.max(-32768, Math.min(32767, Math.round(chunk[i] * 32768)));
      offset += chunk.length;
    }
    window.captured = all;
    return total;
  });
  const out = new Float32Array(length);
  const SLICE = 1 << 20;
  for(let start = 0; start < length; start += SLICE) {
    const base64 = await page.evaluate(({start, end}) => {
      const bytes = new Uint8Array(window.captured.buffer, start * 2, (end - start) * 2);
      let binary = '';
      for(let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    }, {start, end: Math.min(length, start + SLICE)});
    const pcm = new Int16Array(new Uint8Array(Buffer.from(base64, 'base64')).buffer);
    for(let i = 0; i < pcm.length; ++i) out[start + i] = pcm[i] / 32768;
  }
  writeWav(output, out, 48000);
  console.log(output, (length / 48000).toFixed(1), 's of', seconds.toFixed(1));
} finally {
  await browser.close();
  server.close();
}
