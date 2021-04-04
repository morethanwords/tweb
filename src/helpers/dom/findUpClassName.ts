//export function findUpClassName<T>(el: any, className: string): T;
export default function findUpClassName(el: any, className: string): HTMLElement {
  return el.closest('.' + className);
  /* if(el.classList.contains(className)) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.classList.contains(className)) 
      return el;
  }
  return null; */
}
