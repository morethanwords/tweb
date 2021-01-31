import { DEBUG } from '../lib/mtproto/mtproto_config';
import fastBlur from '../vendor/fastBlur';
import pushHeavyTask from './heavyQueue';

const RADIUS = 2;
const ITERATIONS = 2;

function processBlur(dataUri: string, radius: number, iterations: number) {
  return new Promise<string>((resolve) => {
    const img = new Image();

    const perf = performance.now();
    if(DEBUG) {
      console.log('[blur] start');
    }

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);
      fastBlur(ctx, 0, 0, canvas.width, canvas.height, radius, iterations);

      //resolve(canvas.toDataURL());
      canvas.toBlob(blob => {
        resolve(URL.createObjectURL(blob));

        if(DEBUG) {
          console.log(`[blur] end, radius: ${radius}, iterations: ${iterations}, time: ${performance.now() - perf}`);
        }
      });
    };

    img.src = dataUri;
  });
}

export default function blur(dataUri: string, radius: number = RADIUS, iterations: number = ITERATIONS) {
  return new Promise<string>((resolve) => {
    //return resolve(dataUri);
    pushHeavyTask({
      items: [[dataUri, radius, iterations]],
      context: null,
      process: processBlur
    }).then(results => {
      resolve(results[0]);
    });
  });
}
