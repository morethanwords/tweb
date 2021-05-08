/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function htmlToSpan(html: string) {
  const span = document.createElement('span');
  span.innerHTML = html;
  return span;
}
