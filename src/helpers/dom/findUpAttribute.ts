export default function findUpAttribute(el: any, attribute: string): HTMLElement {
  return el.closest(`[${attribute}]`);
  /* if(el.getAttribute(attribute) !== null) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.getAttribute(attribute) !== null) 
      return el;
  }
  return null; */
}
