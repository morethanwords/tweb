import {onMount} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import {IS_FIREFOX} from '@environment/userAgent';
import {createMessageSpoilerOverlay} from '@components/messageSpoilerOverlay';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';

/**
 * Bubble.SpoilerOverlay — renders the canvas-based spoiler overlay.
 * Checks for .spoiler-text elements in the message div and creates a canvas overlay.
 */
export default function SpoilerOverlay() {
  const ctx = useBubble();
  const message = ctx.message();

  if(IS_FIREFOX || message._ !== 'message') {
    return ctx.register('spoilerOverlay', undefined);
  }

  // register an empty slot — the actual overlay is appended to messageDiv in onMount
  return ctx.register('spoilerOverlay', ((): undefined => {
    onMount(async() => {
      // wait for all content to render
      await Promise.all(ctx.loadPromises);

      const bubble = document.querySelector(`.bubble[data-mid="${message.mid}"]`) ||
        document.querySelector('.bubble'); // fallback
      if(!bubble) return;

      const messageDiv = bubble.querySelector('.message') as HTMLDivElement;
      if(!messageDiv?.querySelector('.spoiler-text')) return;

      const spoilerOverlay = createMessageSpoilerOverlay({
        mid: message.mid,
        messageElement: messageDiv,
        animationGroup: ctx.wrapOptions.animationGroup
      }, SolidJSHotReloadGuardProvider);

      messageDiv.append(spoilerOverlay.element);
      ctx.middleware.onDestroy(() => {
        spoilerOverlay.dispose();
      });

      spoilerOverlay.controls.update();
    });

    return undefined;
  })());
}
