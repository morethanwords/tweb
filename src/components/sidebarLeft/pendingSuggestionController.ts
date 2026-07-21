import type {JSX} from 'solid-js';

export type PendingSuggestionController = {
  available: () => boolean,
  component: () => JSX.Element
};
