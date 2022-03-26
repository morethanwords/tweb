export default function findAndSplice<T>(array: Array<T>, verify: (value: T, index?: number, array?: Array<T>) => boolean) {
  const index = array.findIndex(verify);
  return index !== -1 ? array.splice(index, 1)[0] : undefined;
};
