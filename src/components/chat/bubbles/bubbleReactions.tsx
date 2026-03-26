import {onMount} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import ReactionsElement from '@components/chat/reactions';
import {ReactionLayoutType} from '@components/chat/reaction';

/**
 * Bubble.Reactions — renders message reactions.
 * Self-contained: reads reactionsMessage from context.
 */
export default function Reactions() {
  const ctx = useBubble();
  const reactionsMessage = ctx.reactionsMessage();

  if(!reactionsMessage?.reactions?.results?.length) {
    return ctx.register('reactions', undefined);
  }

  return ctx.register('reactions', (() => {
    let ref: HTMLDivElement;

    onMount(() => {
      const reactionsElement = new ReactionsElement();
      reactionsElement.init({
        context: reactionsMessage,
        type: ReactionLayoutType.Block,
        middleware: ctx.middleware,
        animationGroup: ctx.wrapOptions.animationGroup,
        lazyLoadQueue: ctx.lazyLoadQueue
      });
      reactionsElement.render();

      ref.replaceWith(reactionsElement);
    });

    return <div ref={ref!} />;
  })());
}
