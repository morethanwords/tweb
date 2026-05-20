import {JSX} from 'solid-js';
import {TextWithEntities} from '@layer';
import type {StoredFolder} from '@stores/folders';

export type FolderItemPayload = Partial<StoredFolder> & {
  icon: Icon,
  iconDocId?: DocId,
  emojiIcon?: string,
  dontAnimate?: boolean,
  name?: JSX.Element,
  title?: TextWithEntities.textWithEntities
};
