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
  const Fallback = () => {
    onMount(() => props.onFail?.());
    // Keep the div for maintaining the layout
    return <div class={props.class}></div>;
  };

  return (
    <Switch
      fallback={<Fallback />}
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
