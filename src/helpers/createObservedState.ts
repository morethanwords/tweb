type HistoryCallInfo = {
  target: object,           // исходный history-объект (SlicedArray)
  method: string,           // имя вызванного метода
  args: any[],              // аргументы
  result: any,              // результат вызова
  state: any               // проксируемый объект (this верхнего уровня)
};

type SetInfo = {
  prop: PropertyKey,        // имя свойства
  value: any,               // новое значение
  oldValue: any,            // прежнее значение (если удастся прочитать)
  state: any               // проксируемый объект
};

type ObserveMethodsOptions = {
  methods: string[],
  onCallBefore?: () => void,
  onCall: (info: HistoryCallInfo) => void | any,
  onWrap?: (proxy: any) => void,
  key?: string
};

type ObserveObjectOptions = {
  // реагировать на set любого свойства верхнего уровня
  onSet: (info: SetInfo) => void,
  observe?: {
    [key: string]: ObserveMethodsOptions
  }
};

export function wrapObject(obj: any, observing: ObserveMethodsOptions, stateProxy: any) {
  if(!obj || typeof(obj) !== 'object') return obj;

  // Не переоборачивать, если уже проксирован
  if((obj as any).__wrapped) return obj;
  const wrappers = new Map<string | symbol, Function>();

  const proxy = new Proxy(obj, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);

      // только перехватываем вызовы методов из белого списка
      if(
        typeof(v) === 'function' &&
        observing.methods.includes(String(prop))
      ) {
        // мемоизируем обёртку на конкретный метод
        let fn = wrappers.get(prop);
        if(!fn) {
          fn = function(...args: any[]) {
            // важно сохранить корректный this
            observing.onCallBefore?.();
            const result = v.apply(target, args);
            const onCallResult = observing.onCall({
              target,
              method: String(prop),
              args,
              result,
              state: stateProxy
            });
            return onCallResult ?? result;
          };
          wrappers.set(prop, fn);
        }
        return fn;
      }
      return v;
    }
  });

  // маркер для защиты от двойного проксирования
  Object.defineProperty(proxy, '__wrapped', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  observing.onWrap?.(proxy);

  return proxy;
}

export default function createObservedState<T extends object>(
  state: T,
  {onSet, observe}: ObserveObjectOptions
): T {
  // --- верхний Proxy для state ---
  const stateProxy: any = new Proxy(state as any, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // автоматически отдаём обёрнутый history
      if(observe[prop as string]) {
        return wrapObject(value, observe[prop as string], stateProxy);
      }
      return value;
    },

    set(target, prop, value, receiver) {
      const oldValue = (() => {
        try {
          return Reflect.get(target, prop, receiver);
        } catch(err) {
          return undefined;
        }
      })();

      // если подменяют history — переоборачиваем
      const nextValue =
        observe[prop as string] ? wrapObject(value, observe[prop as string], stateProxy) : value;

      const ok = Reflect.set(target, prop, nextValue, receiver);

      if(ok) {
        // ВАЖНО: не дублируем вашу уже существующую логику внутри setter'ов.
        // Этот onSet — «универсальный хук»: используйте его, если нужна доп. реакция.
        onSet?.({prop, value: nextValue, oldValue, state: stateProxy});
      }
      return ok;
    }
  });

  // первичная обёртка history (если нужно сразу)
  for(const key in observe) {
    observe[key as string].key = key;
    (state as any)[key] = wrapObject((state as any)[key], observe[key as string], stateProxy);
  }

  return stateProxy as T;
}
