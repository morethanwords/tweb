import {JSX} from 'solid-js';
import type {MiddlewareHelper} from '../../../helpers/middleware';

export type FolderItemPayload = {
  id?: number,
  icon: Icon,
  name?: JSX.Element,
  notifications?: {
    count: number,
    muted: boolean
  },
  chatsCount?: number | null,
  middlewareHelper?: MiddlewareHelper
};
