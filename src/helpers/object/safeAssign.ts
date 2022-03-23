export default function safeAssign<T>(object: T, fromObject: any) {
  if(fromObject) {
    for(let i in fromObject) {
      if(fromObject[i] !== undefined) {
        // @ts-ignore
        object[i] = fromObject[i];
      }
    }
  }

  return object;
}
