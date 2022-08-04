export default function getDeepProperty(object: any, key: string) {
  const splitted = key.split('.');
  let o: any = object;
  splitted.forEach((key) => {
    if(!key) {
      return;
    }

    // @ts-ignore
    o = o[key];
  });

  return o;
}
