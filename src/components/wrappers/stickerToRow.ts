/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {AppManagers} from '../../lib/appManagers/managers';
import Row from '../row';
import wrapSticker from './sticker';

export default function wrapStickerToRow({doc, row, size, managers}: {
  doc: MyDocument,
  row: Row,
  size?: 'small' | 'large',
  managers?: AppManagers
}) {
  const previousMedia = row.media;
  const media = row.createMedia('small');

  if(previousMedia) {
    media.classList.add('hide');
  }

  const loadPromises: Promise<any>[] = previousMedia ? [] : undefined;

  const _size = size === 'small' ? 32 : 48;
  const result = wrapSticker({
    div: media,
    doc: doc,
    width: _size,
    height: _size,
    loadPromises,
    managers
  }).then(({render}) => render);

  loadPromises && Promise.all(loadPromises).then(() => {
    media.classList.remove('hide');
    previousMedia.remove();
  });

  return result;
}
