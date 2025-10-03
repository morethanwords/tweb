export default function typedElement<T extends object>(element: Element) {
  return element as T;
}
