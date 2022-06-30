export default function getObjectKeysAndSort(object: {[key: string]: any} | Map<number, any>, sort: 'asc' | 'desc' = 'asc') {
  if(!object) return [];
  const ids = object instanceof Map ? [...object.keys()] : Object.keys(object).map((i) => +i);
  if(sort === 'asc') return ids.sort((a, b) => a - b);
  else return ids.sort((a, b) => b - a);
}
