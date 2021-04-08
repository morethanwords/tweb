/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function RadioForm(radios: {container: HTMLElement, input: HTMLInputElement}[], onChange: (value: string) => void) {
  const form = document.createElement('form');

  radios.forEach(r => {
    const {container, input} = r;
    form.append(container);
    input.addEventListener('change', () => {
      if(input.checked) {
        onChange(input.value);
      }
    });
  });

  return form;
}
