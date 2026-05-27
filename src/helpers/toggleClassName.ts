export default function toggleClassName(className: string, elements: HTMLElement[], disable: boolean) {
  elements.forEach((element) => {
    element.classList.toggle(className, disable);
  });

  return () => toggleClassName(className, elements, !disable);
}
