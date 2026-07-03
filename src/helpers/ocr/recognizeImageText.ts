/*
 * On-device OCR for the media viewer's "select text on image" feature.
 *
 * The heavy Tesseract.js engine (WASM core + language data) is loaded lazily on
 * first use — a dynamic import() so it stays out of the main bundle and only
 * downloads when the user actually taps the text button. The worker + core +
 * language packs are fetched from the jsdelivr CDN that ships with tesseract.js
 * (matched to the installed version) and cached by the browser afterwards, so
 * only the very first recognition pays the download cost.
 */

import I18n from '@lib/langPack';

export type OcrLine = {
  text: string,
  // bounding box in the image's natural pixel coordinates
  bbox: {x0: number, y0: number, x1: number, y1: number}
};

export type OcrResult = {
  lines: OcrLine[],
  text: string,
  confidence: number
};

// Which Tesseract language packs to load, derived from the UI language. English
// is always included since latin script shows up inside otherwise-localized
// images (URLs, brand names, code). Each extra language ~doubles the one-time
// model download, so we keep the set minimal.
function resolveLangs() {
  const code = (I18n.getLastRequestedLangCode() || 'en').split('-')[0];
  const map: {[key: string]: string} = {
    ru: 'rus+eng',
    uk: 'ukr+eng',
    be: 'bel+eng'
  };

  return map[code] || 'eng';
}

// Terminate the worker (freeing the WASM engine + language models it holds)
// after this long without an OCR request, so an occasional recognition doesn't
// pin tens of MB for the rest of the session. It reloads lazily on next use.
const IDLE_UNLOAD_MS = 5 * 60 * 1000;

let cached: {langs: string, worker: Promise<any>};
let unloadTimeout: number;

function cancelUnload() {
  if(unloadTimeout) {
    clearTimeout(unloadTimeout);
    unloadTimeout = undefined;
  }
}

function scheduleUnload() {
  cancelUnload();
  const current = cached;
  unloadTimeout = window.setTimeout(() => {
    unloadTimeout = undefined;
    if(cached !== current) return; // already replaced by a newer worker
    cached = undefined;
    current?.worker.then((worker) => worker.terminate()).catch(() => {});
  }, IDLE_UNLOAD_MS);
}

function getWorker() {
  cancelUnload(); // in active use again — hold off the idle unload

  const langs = resolveLangs();
  if(cached?.langs === langs) {
    return cached.worker;
  }

  // language changed since last time — drop the stale worker
  cached?.worker.then((worker) => worker.terminate()).catch(() => {});

  const worker = import('tesseract.js').then((mod) => {
    const createWorker = (mod as any).createWorker || (mod as any).default?.createWorker;
    return createWorker(langs, 1 /* OEM.LSTM_ONLY */);
  });

  cached = {langs, worker};
  return worker;
}

// Drop words Tesseract isn't sure about. On real photos it hallucinates faint
// "text" in textured, non-text regions (grass, sky, skin) with low confidence —
// that noise is exactly what was lighting up empty areas of the image.
const WORD_CONFIDENCE_MIN = 60;

function hasAlnum(s: string) {
  return /[\p{L}\p{N}]/u.test(s);
}

function collectLines(page: any): OcrLine[] {
  const out: OcrLine[] = [];

  const consider = (line: any) => {
    if(!line?.bbox) return;

    // keep only confident words that carry actual letters/digits
    const words = (line.words || []).filter((w: any) =>
      (w?.confidence ?? 0) >= WORD_CONFIDENCE_MIN && hasAlnum(w?.text || ''));

    if(words.length) {
      // tighten the box to the real text extent — Tesseract's line boxes often
      // pad out with empty margin, which highlighted blank space
      out.push({
        text: words.map((w: any) => w.text).join(' ').trim(),
        bbox: {
          x0: Math.min(...words.map((w: any) => w.bbox.x0)),
          y0: Math.min(...words.map((w: any) => w.bbox.y0)),
          x1: Math.max(...words.map((w: any) => w.bbox.x1)),
          y1: Math.max(...words.map((w: any) => w.bbox.y1))
        }
      });
      return;
    }

    // no word-level data (flatter shapes from other versions): fall back to the
    // whole line, still gated on confidence + real content
    if(!line.words && (line.confidence ?? 0) >= WORD_CONFIDENCE_MIN && hasAlnum(line.text || '')) {
      out.push({text: (line.text || '').trim(), bbox: line.bbox});
    }
  };

  // Tesseract nests words in blocks -> paragraphs -> lines.
  if(page.blocks) {
    for(const block of page.blocks) {
      for(const paragraph of (block.paragraphs || [])) {
        for(const line of (paragraph.lines || [])) {
          consider(line);
        }
      }
    }
  }

  if(!out.length && page.lines) { // defensive: flatter shapes from other versions
    page.lines.forEach(consider);
  }

  return out;
}

export default async function recognizeImageText(image: HTMLImageElement | HTMLCanvasElement): Promise<OcrResult> {
  const worker = await getWorker();
  try {
    const {data} = await worker.recognize(image, {}, {blocks: true});

    return {
      lines: collectLines(data),
      text: (data.text || '').trim(),
      confidence: Math.round(data.confidence)
    };
  } finally {
    scheduleUnload(); // (re)start the idle clock from this, the latest use
  }
}
