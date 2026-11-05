/**
 * A property of an element's own style set to a value only when it holds another: the same value set again is parsed
 * anew and can restyle the element for nothing
 */
export default function setStyleProperty(style: CSSStyleDeclaration, name: string, value: string) {
  if(style.getPropertyValue(name) !== value) {
    style.setProperty(name, value);
  }
}
