import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import ctx from '@environment/ctx';

import {
  CodeLanguageDetectionRequest,
  CodeLanguageDetectionResponse
} from '@/codeLanguageDetectorShared';

const CODE_LANGUAGE_DETECTION_CACHE_LIMIT = 64;
const CODE_LANGUAGE_DETECTION_SAMPLE_LIMIT = 16_384;
const CODE_LANGUAGE_DETECTION_TIMEOUT = 5000;

type PendingCodeLanguageDetection = {
  promise: CancellablePromise<string | undefined>,
  timeout: number
};

const cache = new Map<string, Promise<string | undefined>>();
const pending = new Map<number, PendingCodeLanguageDetection>();
let worker: Worker;
let workerFailed = false;
let requestId = 0;

function settleDetection(id: number, language?: string) {
  const detection = pending.get(id);
  if(!detection) return;

  pending.delete(id);
  clearTimeout(detection.timeout);
  detection.promise.resolve(language);
}

function settlePending(language?: string) {
  [...pending.keys()].forEach((id) => settleDetection(id, language));
}

function getWorker() {
  if(worker || workerFailed || typeof(Worker) === 'undefined') return worker;

  worker = new Worker(new URL('./codeLanguageDetector.worker.ts', import.meta.url), {type: 'module'});
  worker.addEventListener('message', (event: MessageEvent<CodeLanguageDetectionResponse>) => {
    const {id, language} = event.data;
    settleDetection(id, language);
  });
  worker.addEventListener('error', (error) => {
    console.error(
      'Code language detector worker failed',
      error.message,
      error.filename,
      error.lineno,
      error
    );
    workerFailed = true;
    worker?.terminate();
    worker = undefined;
    settlePending();
  });

  return worker;
}

function detect(code: string) {
  const detectorWorker = getWorker();
  if(!detectorWorker) return Promise.resolve(undefined);

  const id = ++requestId;
  const promise = deferredPromise<string | undefined>();
  // A worker that hangs instead of erroring must not leave callers awaiting
  // forever, and the snippet has to stay retryable once it does.
  const timeout = ctx.setTimeout(() => {
    if(cache.get(code) === promise) cache.delete(code);
    settleDetection(id);
  }, CODE_LANGUAGE_DETECTION_TIMEOUT);
  const request: CodeLanguageDetectionRequest = {id, code};
  pending.set(id, {promise, timeout});
  detectorWorker.postMessage(request);
  return promise;
}

export default function detectCodeLanguage(code: string) {
  const sample = code.slice(0, CODE_LANGUAGE_DETECTION_SAMPLE_LIMIT).trim();
  if(!sample) return Promise.resolve(undefined);

  let result = cache.get(sample);
  if(result) {
    cache.delete(sample);
    cache.set(sample, result);
    return result;
  }

  result = detect(sample);
  cache.set(sample, result);
  if(cache.size > CODE_LANGUAGE_DETECTION_CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }

  return result;
}
