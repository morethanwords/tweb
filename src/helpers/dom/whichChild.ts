/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function whichChild(elem: Node, countNonElements?: boolean) {
  if(!elem?.parentNode) {
    return -1;
  }

  if(countNonElements) {
    return Array.from(elem.parentNode.childNodes).indexOf(elem as ChildNode);
  }

  let i = 0;
  // @ts-ignore
  while((elem = elem.previousElementSibling) !== null) ++i;
  return i;
}
