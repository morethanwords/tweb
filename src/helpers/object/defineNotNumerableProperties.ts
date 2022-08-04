export default function defineNotNumerableProperties<T extends any>(obj: T, names: (keyof T)[]) {
  // const perf = performance.now();
  const props = {writable: true, configurable: true};
  const out: {[name in keyof T]?: typeof props} = {};
  names.forEach((name) => {
    if(!obj.hasOwnProperty(name)) {
      out[name] = props;
    }
  });
  Object.defineProperties(obj, out);
  // console.log('defineNotNumerableProperties time:', performance.now() - perf);
}
