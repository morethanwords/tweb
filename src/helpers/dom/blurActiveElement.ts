/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function blurActiveElement() {
  if((document.activeElement as HTMLInputElement)?.blur) {
    (document.activeElement as HTMLInputElement).blur();
    return true;
  }

  return false;
}
