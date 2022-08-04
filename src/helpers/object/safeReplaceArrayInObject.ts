/**
 * Will be used for FILE_REFERENCE_EXPIRED
 * @param key
 * @param wasObject
 * @param newObject
 */
export default function safeReplaceArrayInObject<K>(key: K, wasObject: any, newObject: any) {
  if('byteLength' in newObject[key]) { // Uint8Array
    newObject[key] = [...newObject[key]];
  }

  if(wasObject && wasObject[key] !== newObject[key]) {
    wasObject[key].length = newObject[key].length;
    (newObject[key] as any[]).forEach((v, i) => {
      wasObject[key][i] = v;
    });

    /* wasObject[key].set(newObject[key]); */
    newObject[key] = wasObject[key];
  }
}
