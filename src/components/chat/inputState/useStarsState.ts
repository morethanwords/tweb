import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import {createEffect, createMemo} from 'solid-js';
import type {ChatInputStateContext} from './index';


export default function useStarsState({instance, store}: ChatInputStateContext) {
  const canSend = createMemo(() => store.hasSendButton && !!store.starsAmount);
  const hasSomethingToSend = createMemo(() => !!store.messageCount || !!store.forwarding || store.isRecording);

  const isVisible = createMemo(() => canSend() && hasSomethingToSend());

  const totalStarsAmount = createMemo(() => store.starsAmount * Math.max(1, store.forwarding + store.messageCount));
  const forwardedMessagesStarsAmount = createMemo(() => store.starsAmount /* * Math.max(1, store.forwarding) */);

  createEffect(() => {
    if(!store.starsBadgeInited) return;
    instance.starsBadge.classList.toggle('btn-send-stars-badge--active', isVisible());
  });

  createEffect(() => {
    if(!store.starsBadgeInited) return;
    instance.starsBadgeStars.innerText = !isNaN(totalStarsAmount()) ? numberThousandSplitterForStars(totalStarsAmount()) : '';
  });

  createEffect(() => {
    if(!store.starsBadgeInited || !store.inputStarsCountEl || !forwardedMessagesStarsAmount()) return;

    store.inputStarsCountEl.textContent = numberThousandSplitterForStars(forwardedMessagesStarsAmount());
  });
}
