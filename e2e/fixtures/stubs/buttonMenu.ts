export type ButtonMenuItemOptionsVerifiable = {
  className?: string,
  danger?: boolean,
  element?: HTMLElement,
  icon?: string,
  keepOpen?: boolean,
  onClick?: (event: MouseEvent) => unknown,
  onClose?: () => void,
  onOpen?: () => void,
  regularText?: Node | string,
  separator?: boolean | HTMLElement,
  text?: string,
  textElement?: HTMLElement,
  verify?: () => boolean | Promise<boolean>
};

function buttonMenuItem(option: ButtonMenuItemOptionsVerifiable) {
  if(option.element) return option.element;
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `btn-menu-item${option.className ? ` ${option.className}` : ''}`;
  if(option.danger) element.classList.add('danger');
  const text = option.textElement || document.createElement('span');
  text.classList.add('btn-menu-item-text');
  if(!option.textElement) {
    text.append(option.regularText || option.text || '');
  }
  option.textElement = text;
  if(option.icon) {
    const icon = document.createElement('span');
    icon.className = 'btn-menu-item-icon';
    icon.dataset.icon = option.icon.split(' ')[0];
    element.append(icon);
  }
  element.append(text);
  element.addEventListener('click', (event) => {
    if(option.keepOpen) {
      event.preventDefault();
      event.stopPropagation();
    }
    option.onClick?.(event);
  });
  option.element = element;
  option.onOpen?.();
  return element;
}

export function ButtonMenuSync({buttons}: {buttons: ButtonMenuItemOptionsVerifiable[]}) {
  const menu = document.createElement('div');
  menu.className = 'btn-menu';
  buttons.forEach((button) => {
    if(button.verify?.() === false) return;
    if(button.separator) {
      menu.append(button.separator instanceof HTMLElement ?
        button.separator :
        Object.assign(document.createElement('hr'), {className: 'btn-menu-separator'}));
    }
    menu.append(buttonMenuItem(button));
  });
  return menu;
}

export default async function ButtonMenu(options: {
  buttons: ButtonMenuItemOptionsVerifiable[]
}) {
  return ButtonMenuSync(options);
}
