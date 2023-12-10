export const createElement = <T extends Parameters<Document['createElement']>[0]>(tagName: T = 'div' as T) => {
  return document.createElement(tagName);
};

export function addEventListener(element: HTMLElement | Document, event: string, cb: any) {
  element.addEventListener(event, cb);
}

export function removeEventListener(element: HTMLElement | Document, event: string, cb: any) {
  element.removeEventListener(event, cb);
}
