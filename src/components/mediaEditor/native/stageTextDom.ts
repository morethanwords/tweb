import sequentialDom from '@helpers/sequentialDom';

/** Resolve after the callback, which runs INSIDE the requested DOM phase. */
export default function stageTextDom<T>(phase: 'measure' | 'mutate', callback: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    sequentialDom[phase](() => {
      try {
        resolve(callback());
      } catch(error) {
        reject(error);
      }
    });
  });
}
