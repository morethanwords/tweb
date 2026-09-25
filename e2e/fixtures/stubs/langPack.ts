export type FormatterArguments = Array<Node | number | string>;
export type LangPackKey = string;

function formatted(key: string, args: FormatterArguments = []) {
  return args.length ? `${key} ${args.join(' ')}` : key;
}

export function i18n(key: string, args?: FormatterArguments) {
  const element = document.createElement('span');
  element.textContent = formatted(key, args);
  return element;
}

export function _i18n(element: HTMLElement, key: string, args?: FormatterArguments) {
  element.textContent = formatted(key, args);
  return element;
}

const I18n = {
  format: (key: string, plain?: boolean, args?: FormatterArguments) => (
    plain ? formatted(key, args) : i18n(key, args)
  ),
  getIsRTL: () => false
};

export default I18n;
