import v8 from 'node:v8';
import vm from 'node:vm';

// * a real collection from inside a test: V8 hands out `gc` to a new context once the flag is on
v8.setFlagsFromString('--expose_gc');
const gc = vm.runInNewContext('gc') as () => void;

/**
 * Whether what the ref points at gets collected. Told by a finalization callback rather than by
 * reading the ref again: every read keeps the target alive to the end of the job that made it.
 */
export default async function isCollected(ref: WeakRef<object>, rounds = 10) {
  let collected = false;
  const registry = new FinalizationRegistry(() => collected = true);
  registry.register(ref.deref(), undefined);
  for(let i = 0; i < rounds && !collected; ++i) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
  }

  return collected;
}
