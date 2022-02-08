/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// import { IS_WEB_WORKER } from "../context";

// const id = IS_WEB_WORKER ? Math.random() * 0x1000 | 0 : 0;
export default function readBlobAs(blob: Blob, method: 'readAsText'): Promise<string>;
export default function readBlobAs(blob: Blob, method: 'readAsDataURL'): Promise<string>;
export default function readBlobAs(blob: Blob, method: 'readAsArrayBuffer'): Promise<ArrayBuffer>;
export default function readBlobAs(blob: Blob, method: 'readAsArrayBuffer' | 'readAsText' | 'readAsDataURL'): Promise<any> {
  // const perf = performance.now();
  return new Promise<any>((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('loadend', (e) => {
      // console.log(`readBlobAs [${id}] ${method} time ${performance.now() - perf}`);
      resolve(e.target.result);
    });
    reader[method](blob);
  });
}
