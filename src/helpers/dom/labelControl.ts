let labelId = 0;

/** Associate native and contenteditable controls with the same visible label. */
export default function labelControl(control: HTMLElement, label: HTMLElement) {
  if(!control || !label || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
  label.id ||= `control-label-${++labelId}`;
  control.setAttribute('aria-labelledby', label.id);
}
