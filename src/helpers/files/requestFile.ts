export default function requestFile(accept?: string, options: {document?: Document; signal?: AbortSignal} = {}) {
  const doc = options.document || document;
  const input = doc.createElement('input');
  input.type = 'file';
  input.style.display = 'none';

  if(accept) {
    input.accept = accept;
  }

  doc.body.append(input);

  let cleanup: () => void;
  const promise = new Promise<File>((resolve, reject) => {
    const cancel = () => reject('NO_FILE_SELECTED');
    const abort = () => reject(new DOMException('File chooser closed', 'AbortError'));
    cleanup = () => {
      input.removeEventListener('cancel', cancel);
      options.signal?.removeEventListener('abort', abort);
    };
    input.addEventListener('cancel', cancel, {once: true});
    options.signal?.addEventListener('abort', abort, {once: true});
    if(options.signal?.aborted) abort();
    input.addEventListener('change', (e: any) => {
      const file: File = e.target.files[0];
      if(!file) {
        reject('NO_FILE_SELECTED');
        return;
      }

      resolve(file);
    }, {once: true});
  }).finally(() => {
    cleanup();
    input.remove();
  });

  if(!options.signal?.aborted) input.click();

  return promise;
}
