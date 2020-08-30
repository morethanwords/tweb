export const readBlobAsText = (blob: Blob) => {
  return new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.addEventListener('loadend', (e) => {
      // @ts-ignore
      resolve(e.srcElement.result);
    });
    reader.readAsText(blob);
  });
};