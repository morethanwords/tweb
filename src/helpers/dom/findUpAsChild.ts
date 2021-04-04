export default function findUpAsChild(el: any, parent: any) {
  if(el.parentElement === parent) return el;
  
  while(el.parentElement) {
    el = el.parentElement;
    if(el.parentElement === parent) {
      return el;
    }
  }

  return null;
}
