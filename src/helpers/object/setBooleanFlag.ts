export default function setBooleanFlag<T extends any>(obj: T, key: keyof T, value: boolean) {
  // @ts-ignore
  if(value) obj[key] = true;
  else delete obj[key];
}
