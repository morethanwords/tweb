import {JSX} from 'solid-js';
import type {MiddlewareHelper} from '../../../helpers/middleware';
import {TextWithEntities} from '../../../layer';


export type FolderItemPayload = {
  id?: number;
  icon: Icon;
  iconDocId?: DocId;
  name?: JSX.Element;
  title?: TextWithEntities.textWithEntities;
  notifications?: {
    count: number,
    muted: boolean
  };
  chatsCount?: number | null;
};
