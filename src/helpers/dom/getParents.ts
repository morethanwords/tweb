export default function getParents(elem: HTMLElement, selector?: string) {
  const parents: HTMLElement[] = [];
  while(elem.parentElement && elem.parentElement !== document.body) {
    elem = elem.parentElement;
    parents.push(elem);

    if(selector && elem.matches(selector)) {
      break;
    }
  }

  return parents;
}
