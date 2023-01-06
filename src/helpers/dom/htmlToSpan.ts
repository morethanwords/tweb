/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function htmlToSpan(html: string | DocumentFragment) {
  const span = document.createElement('span');
  if(typeof(html) === 'string') span.innerHTML = html;
  else span.append(html);
  return span;
}
