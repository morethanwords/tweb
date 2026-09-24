export default function isTargetAnInput(target: HTMLElement) {
  return !!target && (target.tagName === 'TEXTAREA' ||
    target.tagName === 'INPUT' && !['checkbox', 'radio'].includes((target as HTMLInputElement).type) ||
    target.isContentEditable);
}
