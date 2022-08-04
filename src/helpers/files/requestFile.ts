export default function requestFile(accept?: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';

  if(accept) {
    input.accept = accept;
  }

  document.body.append(input);

  const promise = new Promise<File>((resolve, reject) => {
    input.addEventListener('change', (e: any) => {
      const file: File = e.target.files[0];
      if(!file) {
        reject('NO_FILE_SELECTED');
        return;
      }

      resolve(file);
    }, {once: true});
  }).finally(() => {
    input.remove();
  });

  input.click();

  return promise;
}
