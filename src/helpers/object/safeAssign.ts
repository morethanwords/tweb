export default function safeAssign<T>(object: T, fromObject: any) {
  if(fromObject) {
    for(const i in fromObject) {
      if(fromObject[i] !== undefined) {
        // @ts-ignore
        object[i] = fromObject[i];
      }
    }
  }

  return object;
}
