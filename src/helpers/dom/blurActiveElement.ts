export default function blurActiveElement() {
  if((document.activeElement as HTMLInputElement)?.blur) {
    (document.activeElement as HTMLInputElement).blur();
    return true;
  }

  return false;
}
