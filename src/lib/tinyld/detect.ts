import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';

let worker: Worker;
let promises: CancellablePromise<TranslatableLanguageISO>[];

export default function detectLanguage(text: string): Promise<TranslatableLanguageISO> {
  if(!worker) {
    worker = new Worker(new URL('./tinyld.worker.ts', import.meta.url), {type: 'module'});
    worker.addEventListener('message', (e) => {
      const {lang} = e.data;
      const promise = promises.shift();
      promise.resolve(lang);
    });

    promises = [];
  }

  const deferred = deferredPromise<TranslatableLanguageISO>();
  promises.push(deferred);
  worker.postMessage({text});
  return deferred;
}
