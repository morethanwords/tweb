import {createStore, unwrap} from 'solid-js/store';

type SetArgs = [...(string | number)[], any]; // path..., value
type WireMsg =
  | {type: 'hello', originId: string, state: any}
  | {type: 'state', originId: string, state: any}
  | {type: 'set', originId: string, path: (string | number)[], value: any};

function getAtPath(obj: any, path: (string | number)[]) {
  return path.reduce((o, k) => (o == null ? o : o[k as any]), obj);
}

function setArgsToValue(
  storeSnapshot: any,
  rawArgs: (string | number | ((prev: any) => any))[]
): { path: (string | number)[]; value: any } {
  const path = rawArgs.slice(0, -1) as (string | number)[];
  const last = rawArgs[rawArgs.length - 1];
  if(typeof(last) === 'function') {
    const prev = getAtPath(storeSnapshot, path);
    return {path, value: (last as (p: any) => any)(prev)};
  }
  return {path, value: last};
}

export function createMirroredStore<T extends object>(
  channelName: string,
  initial: T
) {
  const originId = crypto.randomUUID();
  const ch = new BroadcastChannel(channelName);

  const [store, _setStore] = createStore<T>(initial);
  let ready = false;

  // Отправляем привет и снапшот состояния при подключении
  ch.postMessage({type: 'hello', originId, state: unwrap(store)} as WireMsg);

  ch.onmessage = (ev: MessageEvent<WireMsg>) => {
    const msg = ev.data;
    if(!msg || msg.originId === originId) return;

    if(msg.type === 'hello') {
      // Ответим своим снапшотом
      ch.postMessage({
        type: 'state',
        originId,
        state: unwrap(store)
      } as WireMsg);
      return;
    }

    if(msg.type === 'state' && !ready) {
      // Первичная синхронизация
      _setStore(msg.state);
      ready = true;
      return;
    }

    if(msg.type === 'set') {
      // Применяем чужое изменение
      // @ts-ignore
      _setStore(...msg.path as any, msg.value);
    }
  };

  // Обёртка над setStore: применяем локально и рассылаем «интент»
  function setStore(...args: any[]) {
    // вычисляем финальное value (если был апдейтер-функция)
    const {path, value} = setArgsToValue(unwrap(store), args);
    // @ts-ignore
    _setStore(...path as any, value);
    const wire: WireMsg = {type: 'set', originId, path, value};
    ch.postMessage(wire);
  }

  return [
    store,
    setStore as any as typeof _setStore
  ] as const;
}
