import v8 from 'node:v8';
import vm from 'node:vm';

// * a real collection from inside a test: V8 hands out `gc` to a new context once the flag is on
v8.setFlagsFromString('--expose_gc');
const gc = vm.runInNewContext('gc') as () => void;

/**
 * Has `registry` watch what `ref` points at; false when that is gone already. A function of its own:
 * held in a local of the async function below, the target would stay alive across its awaits.
 */
function watch(registry: FinalizationRegistry<undefined>, ref: WeakRef<object>) {
  const target = ref.deref();
  if(target === undefined) return false;
  registry.register(target, undefined);
  return true;
}

/**
 * Whether what the ref points at gets collected. Told by a finalization callback rather than by
 * reading the ref again: every read keeps the target alive to the end of the job that made it.
 * A ref cleared already (a collection ran before the call) is collected: there is nothing to watch.
 */
export default async function isCollected(ref: WeakRef<object>, rounds = 10) {
  let collected = false;
  const registry = new FinalizationRegistry<undefined>(() => collected = true);
  if(!watch(registry, ref)) return true;
  for(let i = 0; i < rounds && !collected; ++i) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
  }

  return collected;
}
