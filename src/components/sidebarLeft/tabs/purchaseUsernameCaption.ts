/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {i18n} from '@lib/langPack';
import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';

const FRAGMENT_USERNAME_URL = 'https://fragment.com/username/';

export function purchaseUsernameCaption() {
  const p = document.createElement('div');
  const a = setBlankToAnchor(document.createElement('a'));
  const purchaseText = i18n('Username.Purchase', [a]);
  purchaseText.classList.add('username-purchase-help');
  p.append(
    purchaseText,
    document.createElement('br'),
    document.createElement('br')
  );
  p.classList.add('hide');

  return {
    element: p,
    setUsername: (username: string) => {
      if(username) {
        a.href = FRAGMENT_USERNAME_URL + username;
      }

      p.classList.toggle('hide', !username);
    }
  };
}
