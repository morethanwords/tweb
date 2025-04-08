import createElementFromMarkup from '../../../helpers/createElementFromMarkup';
import anchorCallback from '../../../helpers/dom/anchorCallback';
import {doubleRaf} from '../../../helpers/schedulers';
import pause from '../../../helpers/schedulers/pause';
import {Message} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';

import appMediaPlaybackController, {MediaSearchContext} from '../../appMediaPlaybackController';
import Icon from '../../icon';
import {animateValue, lerp, simpleEasing} from '../../mediaEditor/utils';
import PopupPremium from '../../popups/premium';
import {hideToast, toastNew} from '../../toast';
import wrapDocument from '../../wrappers/document';

type WrapRoundVideoBubbleOptions = {
  bubble: HTMLElement;
  message: Message.message;
  globalMediaDeferred: Promise<HTMLMediaElement>;
  searchContext?: MediaSearchContext;
};

const ANIMATION_TIME = 180;

export function wrapRoundVideoBubble({
  bubble,
  message,
  globalMediaDeferred,
  searchContext
}: WrapRoundVideoBubbleOptions) {
  const content = bubble.querySelector('.bubble-content') as HTMLElement;

  const hasBesideButton = !!bubble.querySelector('.bubble-beside-button');
  const transcribe = document.createElement('div');
  transcribe.classList.add('bubble-beside-button', 'bubble-beside-button--transcribe', 'with-hover');
  hasBesideButton && transcribe.classList.add('bubble-beside-button--lifted');
  transcribe.append(Icon('transcribe'));
  content.append(transcribe);
  bubble.classList.add('with-beside-button');

  const mediaContainer = bubble.querySelector('.attachment.media-container') as HTMLElement;
  const audioMessageContainer = document.createElement('div');
  audioMessageContainer.append(createElementFromMarkup(`<span class="clearfix"></span>`))
  audioMessageContainer.classList.add('message');
  audioMessageContainer.style.display = 'none';

  content.append(audioMessageContainer);

  const videoSentTime = content.querySelector('.time') as HTMLElement;
  const audioSentTime = videoSentTime.cloneNode(true) as HTMLElement;
  audioSentTime.classList.remove('is-floating');

  const bubbleVideoClassNames = ['round', 'just-media'];
  const bubbleAudioClassNames = ['can-have-tail', 'voice-message'];
  const selectorsToHideWhenCollapsed = ['.topic-name-button-container', '.reply', '.bubble-name-forwarded'];

  const getBubblesContainer = () => bubble.closest('.bubbles');

  let hasAddedTranscription = false;
  let isTranscribeDisabled = false;

  let animatedCanvas: HTMLCanvasElement;

  async function drawCurrentFrame() {
    if(!animatedCanvas) return;

    const currentFrameVideo = mediaContainer.querySelector('.media-video') as HTMLVideoElement;
    const currentFrameCanvas = mediaContainer.querySelector('.video-round-canvas') as HTMLCanvasElement;
    const ctx = animatedCanvas.getContext('2d');

    const globalMedia = await globalMediaDeferred;
    if(!animatedCanvas) return;

    if(appMediaPlaybackController.getPlayingMedia() === globalMedia) {
      ctx.drawImage(currentFrameCanvas, 0, 0, animatedCanvas.width, animatedCanvas.height); // In case the video is playing
    } else {
      ctx.drawImage(currentFrameVideo, 0, 0, animatedCanvas.width, animatedCanvas.height);
    }
  }

  function insideBubbleContainerCoords() {
    const bcr = getBubblesContainer().getBoundingClientRect();
    return {
      x: (value: number) => value - bcr.left,
      y: (value: number) => value - bcr.top
    }
  }

  async function hideAudio() {
    const coords = insideBubbleContainerCoords();
    const initialThumbBcr = audioMessageContainer.querySelector('.audio-thumb')?.getBoundingClientRect();
    const initialThumbLeft = coords.x(initialThumbBcr.left + initialThumbBcr.width / 2);
    const initialThumbTop = coords.y(initialThumbBcr.top + initialThumbBcr.height / 2);
    const initialThumbSize = initialThumbBcr.width;

    const contentStyle = window.getComputedStyle(content);

    const initialRadiuses = [
      contentStyle.borderStartStartRadius,
      contentStyle.borderStartEndRadius,
      contentStyle.borderEndEndRadius,
      contentStyle.borderEndStartRadius
    ];

    drawCurrentFrame()

    animatedCanvas.style.left = initialThumbLeft + 'px';
    animatedCanvas.style.top = initialThumbTop + 'px';
    animatedCanvas.style.width = initialThumbSize + 'px';
    animatedCanvas.style.height = initialThumbSize + 'px';
    animatedCanvas.style.borderRadius = '50%';
    getBubblesContainer().append(animatedCanvas);

    transcribe.style.removeProperty('display');

    const initialHeight = content.clientHeight;
    const initialWidth = content.clientWidth;

    content.style.height = initialHeight + 'px';
    content.style.width = initialWidth + 'px';
    content.style.overflow = 'hidden';
    content.style.setProperty('background', contentStyle.background, 'important');

    audioMessageContainer.style.width = audioMessageContainer.clientWidth + 'px';
    audioMessageContainer.style.height = audioMessageContainer.clientHeight + 'px';

    mediaContainer.style.opacity = '0';
    mediaContainer.style.position = 'absolute';
    mediaContainer.style.display = 'block';

    bubbleVideoClassNames.forEach((cls) => bubble.classList.add(cls));
    bubbleAudioClassNames.forEach((cls) => bubble.classList.remove(cls));

    selectorsToHideWhenCollapsed.forEach((selector) => {
      const elementToHide = bubble.querySelector(selector) as HTMLElement;
      elementToHide?.style.removeProperty('display');
    });

    await doubleRaf();

    const targetHeight = mediaContainer.clientHeight;
    const targetWidth = mediaContainer.clientWidth;

    animateValue(
      0,
      1,
      ANIMATION_TIME,
      (progress) => {
        const coords = insideBubbleContainerCoords();
        const targetBcr = content?.getBoundingClientRect();
        const targetLeft = coords.x(targetBcr.left + targetBcr.width / 2);
        const targetTop = coords.y(targetBcr.top + targetBcr.height / 2);
        const targetSize = targetBcr.width;

        animatedCanvas.style.left = lerp(initialThumbLeft, targetLeft, progress) + 'px';
        animatedCanvas.style.top = lerp(initialThumbTop, targetTop, progress) + 'px';
        animatedCanvas.style.width = lerp(initialThumbSize, targetSize, progress) + 'px';
        animatedCanvas.style.height = lerp(initialThumbSize, targetSize, progress) + 'px';

        content.style.height = lerp(initialHeight, targetHeight, progress) + 'px';
        content.style.width = lerp(initialWidth, targetWidth, progress) + 'px';

        const tr = initialRadiuses
        .map((r) => lerp(parseInt(r), targetSize, progress * Math.sqrt(progress)) + 'px')
        .join(' ');

        content.style.setProperty('border-radius', tr);

        audioMessageContainer.style.opacity = lerp(0.5, 0, Math.min(1, progress * 2)) + '';

        drawCurrentFrame();
      },
      {
        easing: simpleEasing,
        onEnd: () => {
          animatedCanvas.remove();
          animatedCanvas = undefined;

          audioMessageContainer.style.display = 'none';
          mediaContainer.style.removeProperty('opacity');
          mediaContainer.style.removeProperty('position');
          mediaContainer.style.display = 'block';

          content.style.removeProperty('overflow');
          content.style.removeProperty('background');
          content.style.removeProperty('width');
          content.style.removeProperty('height');
          content.style.removeProperty('max-width');
          content.style.removeProperty('border-radius');

          audioMessageContainer.style.removeProperty('width');
          audioMessageContainer.style.removeProperty('height');
          audioMessageContainer.style.removeProperty('opacity');

          videoSentTime.style.removeProperty('display');
        }
      }
    );
  }

  async function showAudio() {
    if(!rootScope.getPremium()) {
      toastNew({
        langPackKey: 'RoundVideoTranscription.PremiumAlert',
        langPackArguments: [anchorCallback(() => {
          hideToast();
          PopupPremium.show({feature: 'voice_to_text'});
        })]
      });
      return;
    }

    if(isTranscribeDisabled) return;
    isTranscribeDisabled = true;

    if(!hasAddedTranscription) {
      hasAddedTranscription = true;
      const spinner = createSpinner();
      transcribe.append(spinner);
      const transcribedText = document.createElement('div');
      transcribedText.classList.add('video-transcribed-text');
      try {
        const transcribeResult = await rootScope.managers.appMessagesManager.transcribeAudio(message, true);
        if(!transcribeResult.text) throw '';
        transcribedText.innerText = transcribeResult.text;
      } catch(err) {
        transcribedText.append(i18n('Chat.Voice.Transribe.Error'));
      }
      audioMessageContainer.append(transcribedText);
      transcribedText.append(audioSentTime);
      transcribedText.append(createElementFromMarkup(`<span class="clearfix"></span>`));

      spinner.remove();
    }

    const bcr = content.getBoundingClientRect();
    const initialSize = bcr.width;

    const coords = insideBubbleContainerCoords();

    animatedCanvas = document.createElement('canvas');
    animatedCanvas.width = initialSize;
    animatedCanvas.height = initialSize;
    drawCurrentFrame();

    animatedCanvas.style.position = 'absolute';
    animatedCanvas.style.zIndex = '1000';
    animatedCanvas.style.transform = 'translate(-50%, -50%)';
    const initialLeft = coords.x(bcr.left + bcr.width / 2);
    const initialTop = coords.y(bcr.top + bcr.height / 2);
    animatedCanvas.style.left = initialLeft + 'px';
    animatedCanvas.style.top = initialTop + 'px';
    animatedCanvas.style.width = initialSize + 'px';
    animatedCanvas.style.height = initialSize + 'px';
    animatedCanvas.style.borderRadius = '50%';

    getBubblesContainer().append(animatedCanvas);


    const initialHeight = content.clientHeight;
    const initialWidth = content.clientWidth;
    const initialRadius = Math.max(initialHeight, content.clientWidth);

    bubbleVideoClassNames.forEach((cls) => bubble.classList.remove(cls));
    bubbleAudioClassNames.forEach((cls) => bubble.classList.add(cls));

    const computedStyle = window.getComputedStyle(content);
    const targetRadiuses = [
      computedStyle.borderStartStartRadius,
      computedStyle.borderStartEndRadius,
      computedStyle.borderEndEndRadius,
      computedStyle.borderEndStartRadius
    ];
    // console.log('[video-trans] targetRadius', targetRadius)
    content.style.height = initialHeight + 'px';
    content.style.width = initialWidth + 'px';
    content.style.setProperty('border-radius', initialRadius + 'px');
    // content.style.borderRadius = 280 + 'px !important';
    mediaContainer.style.display = 'none';

    transcribe.style.display = 'none';
    videoSentTime.style.display = 'none';

    content.style.overflow = 'hidden';

    const contentWrapper = bubble.querySelector('.bubble-content-wrapper') as HTMLElement;
    contentWrapper.style.position = 'relative';

    audioMessageContainer.style.display = 'block';
    const measure: HTMLDivElement = createElementFromMarkup(`
      <div style="position: absolute;width:min-content;opacity:0;"></div>
    `);
    measure.append(audioMessageContainer);
    contentWrapper.append(measure);

    await doubleRaf();
    const targetWidth = measure.clientWidth;
    const targetHeight = measure.clientHeight;

    const audioStyle = window.getComputedStyle(audioMessageContainer);
    audioMessageContainer.style.width =
      targetWidth - (+parseFloat(audioStyle.marginLeft) + parseFloat(audioStyle.marginRight)) + 'px';

    const bubbleTail = bubble.querySelector('.bubble-tail') as HTMLElement;

    selectorsToHideWhenCollapsed.forEach((selector) => {
      const elementToHide = bubble.querySelector(selector) as HTMLElement;
      if(elementToHide) elementToHide.style.setProperty('display', 'none', 'important');
    });

    measure.remove();
    content.append(audioMessageContainer);

    await doubleRaf();

    contentWrapper.style.removeProperty('position');

    await doubleRaf();

    const bubbleStyle = window.getComputedStyle(bubbleTail);
    const initialTailTransform = bubbleStyle.transform;
    bubbleTail.style.transform = `${initialTailTransform !== 'none' ? initialTailTransform : ''} translateX(calc(100% * var(--reflect)))`;
    bubbleTail.style.transition = '.2s';

    if(true)
      animateValue(
        0,
        1,
        ANIMATION_TIME,
        (progress) => {
          const coords = insideBubbleContainerCoords();
          const targetBcr = audioMessageContainer.querySelector('.audio-thumb')?.getBoundingClientRect();
          const targetLeft = coords.x(targetBcr.left + targetBcr.width / 2);
          const targetTop = coords.y(targetBcr.top + targetBcr.height / 2);
          const targetSize = targetBcr.width;

          animatedCanvas.style.left = lerp(initialLeft, targetLeft, progress) + 'px';
          animatedCanvas.style.top = lerp(initialTop, targetTop, progress) + 'px';
          animatedCanvas.style.width = lerp(initialSize, targetSize, progress) + 'px';
          animatedCanvas.style.height = lerp(initialSize, targetSize, progress) + 'px';

          content.style.height = lerp(initialHeight, targetHeight, progress) + 'px';
          content.style.width = lerp(initialWidth, targetWidth, progress) + 'px';

          const tr = targetRadiuses
          .map((r) => lerp(initialRadius, parseInt(r), Math.min(1, progress * 1)) + 'px')
          .join(' ');

          content.style.setProperty('border-radius', tr);

          drawCurrentFrame();
        },
        {
          easing: simpleEasing,
          onEnd: async() => {
            isTranscribeDisabled = false;

            animatedCanvas.style.opacity = '1';
            animatedCanvas.style.transition = '.2s';

            content.style.removeProperty('overflow');
            bubbleTail?.style.removeProperty('transform');

            await doubleRaf();
            animatedCanvas.style.opacity = '0';
            await pause(200);
            animatedCanvas.remove();
            content.style.removeProperty('width');
            content.style.removeProperty('height');
            content.style.removeProperty('border-radius');
            audioMessageContainer.style.removeProperty('width');
            audioMessageContainer.style.removeProperty('height');

            animatedCanvas.style.removeProperty('transition');
            animatedCanvas.style.removeProperty('opacity');

            bubbleTail?.style.removeProperty('transition');
          }
        }
      );
  }

  transcribe.addEventListener('click', () => {
    showAudio();
  });

  (async() => {
    const closeButton = document.createElement('div');
    closeButton.classList.add('audio-to-text-button');
    closeButton.append(Icon('up'));
    closeButton.addEventListener('click', () => {
      hideAudio();
    });

    const globalMedia = await globalMediaDeferred;

    const audioElement = await wrapDocument({
      message: message as any,
      customAudioToTextButton: closeButton,
      shouldWrapAsVoice: true,
      globalMedia,
      searchContext
    });
    audioMessageContainer.append(audioElement);
    // audioContainer.append(transcribedText);
  })();
}

function createSpinner() {
  return createElementFromMarkup(`<svg class="transcribe-button-spinner-svg" viewBox="0 0 24 24" width="100" height="100">
    <circle
      cx="12"
      cy="12"
      r="10.5"
      fill="none"
      stroke="white"
      stroke-width="1"
      stroke-linecap="round"
      stroke-dashoffset="0"
    ></circle>
  </svg>`);
}
