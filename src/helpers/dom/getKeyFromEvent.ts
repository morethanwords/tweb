/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function getKeyFromEvent(e: KeyboardEvent) {
  let key = e.key;
	if(!key) {
    key = e.code;
    if(key.startsWith('Key')) {
      key = e.code.slice(3);

      if(!e.shiftKey && key.length < 2) {
        key = key.toLowerCase();
      }
    }
	}

	return key;
}
