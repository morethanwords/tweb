import {createEffect, createRoot, onCleanup, onMount} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import Icon from '@components/icon';
import {ChatType} from '@components/chat/chatType';
import {Sparkles} from '@components/sparkles';
import {attachClickEvent} from '@helpers/dom/clickEvent';

/**
 * Bubble.BesideButtons — renders forward and summarize buttons for channel posts.
 * Self-contained: reads from BubbleContext.
 */
export default function BesideButtons() {
  const ctx = useBubble();
  const message = ctx.message();

  if(message._ !== 'message') {
    return ctx.register('besideButtons', undefined);
  }

  const hasViews = !!message.views;
  const isSavedForward = !!message.fwd_from?.saved_from_msg_id;
  const isPinned = ctx.chat.type === ChatType.Pinned;
  const showForward = hasViews && !isSavedForward && !isPinned;
  const showSummarize = !!message.summary_from_language;

  if(!showForward && !showSummarize) {
    return ctx.register('besideButtons', undefined);
  }

  return ctx.register('besideButtons', (() => {
    let ref: HTMLDivElement;

    onMount(() => {
      const bubble = ref.closest('.bubble') as HTMLElement;

      // forward button
      if(showForward) {
        const forward = document.createElement('div');
        forward.classList.add('bubble-beside-button', 'with-hover', 'forward');
        forward.append(Icon('forward_filled'));
        ref.append(forward);
        bubble?.classList.add('with-beside-button');
      }

      // summarize button
      if(showSummarize && ctx.setSummarizing) {
        const c = document.createElement('div');
        c.classList.add('summarize-container');
        const btn = document.createElement('div');
        btn.classList.add('bubble-beside-button', 'summarize');
        if(showForward) btn.classList.add('bubble-beside-button--not-last');
        else c.classList.add('is-last-button');

        const size = 38;
        const sparkles = Sparkles({
          mode: 'button',
          containerSize: {width: size, height: size},
          sparkles: [
            {x: 22 / size * 100, y: 6 / size * 100, scale: 1.5, delay: 0, translateX: 0, translateY: 0, minOpacity: 0.2},
            {x: 9.5 / size * 100, y: 19 / size * 100, scale: 1.25, delay: 1500, translateX: 0, translateY: 0, minOpacity: 0.2}
          ],
          isDiv: true,
          fixedScale: true,
          duration: 3000
        });

        let node: ChildNode = document.createTextNode('');
        btn.append(sparkles, node);

        createRoot((dispose) => {
          ctx.middleware.onDestroy(dispose);

          createEffect(() => {
            const newNode = Icon(ctx.summarizing() ? 'expand' : 'collapse');
            node.replaceWith(newNode);
            node = newNode;
          });

          const detach = attachClickEvent(btn, () => {
            ctx.setSummarizing((v) => !v);
          });
          onCleanup(detach);
        });

        c.append(btn);
        ref.append(c);
        bubble?.classList.add('with-beside-button');
      }
    });

    return <div ref={ref!} />;
  })());
}
