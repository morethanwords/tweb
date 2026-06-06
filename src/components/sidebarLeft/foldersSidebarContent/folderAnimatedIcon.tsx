import EmojiDocumentIcon from '@components/emojiDocumentIcon';
import type {AppManagers} from '@lib/managers';
import wrapSingleEmoji from '@lib/richTextProcessor/wrapSingleEmoji';
import {Match, onMount, Switch} from 'solid-js';


export default function FolderAnimatedIcon(props: {
  managers: AppManagers;
  docId?: DocId;
  emoji?: string;
  color: string;
  size: number;
  class?: string;
  onFail?: () => void;
  dontAnimate?: boolean;
}) {
  return (
    <Switch
      fallback={((): null => {
        onMount(() => props.onFail?.());
        return null;
      })()}
    >
      <Match when={props.docId} keyed>
        {(docId) => (
          <EmojiDocumentIcon
            managers={props.managers}
            docId={docId}
            color={props.color}
            size={props.size}
            class={props.class}
            dontAnimate={props.dontAnimate}
            onFail={props.onFail}
          />
        )}
      </Match>
      <Match when={props.emoji} keyed>
        {(emoji) => <div class={props.class}>{wrapSingleEmoji(emoji)}</div>}
      </Match>
    </Switch>
  );
}
