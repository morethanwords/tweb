/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function toggleClassName(className: string, elements: HTMLElement[], disable: boolean) {
  elements.forEach((element) => {
    element.classList.toggle(className, disable);
  });

  return () => toggleClassName(className, elements, !disable);
}
