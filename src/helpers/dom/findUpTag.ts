export default function findUpTag(el: any, tag: string): HTMLElement {
  return el.closest(tag);
  /* if(el.tagName === tag) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.tagName === tag) 
      return el;
  }
  return null; */
}
