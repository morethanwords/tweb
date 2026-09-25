import type {ButtonMenuItemOptionsVerifiable} from './buttonMenu';

export default function ButtonMenuToggle({
  container
}: {
  buttons: ButtonMenuItemOptionsVerifiable[],
  container?: HTMLElement,
  direction: string
}) {
  const button = container || document.createElement('button');
  button.classList.add('btn-menu-toggle');
  return button;
}
