export default function callbackify<T extends Awaited<any>, R>(
  smth: T,
  callback: (result: Awaited<T>) => R
): T extends Promise<any> ? Promise<Awaited<R>> : R {
  if(smth instanceof Promise) {
    // @ts-ignore
    return smth.then(callback);
  } else {
    return callback(smth as any) as any;
  }
}
