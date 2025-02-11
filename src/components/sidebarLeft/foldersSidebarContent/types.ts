import {JSX} from 'solid-js';

export type FolderItemPayload = {
  id?: number,
  icon: Icon,
  name?: JSX.Element,
  notifications?: {
    count: number,
    muted: boolean
  },
  chatsCount?: number | null
}
