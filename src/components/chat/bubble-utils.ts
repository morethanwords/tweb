import createElementFromMarkup from '../../helpers/createElementFromMarkup';
import {doubleRaf} from '../../helpers/schedulers';
import pause from '../../helpers/schedulers/pause';
import {Message} from '../../layer';
import {logger} from '../../lib/logger';
import BezierEasing from '../../vendor/bezierEasing';
import Icon from '../icon';
import {animateValue, lerp} from '../mediaEditor/utils';
import wrapDocument from '../wrappers/document';

type WrapRoundVideoBubbleOptions = {
  bubble: HTMLElement;
  message: Message.message;
};

const log = logger('video-trans');
const ANIMATION_TIME = 180;
// const ANIMATION_TIME = 540;

export function wrapRoundVideoBubble({bubble, message}: WrapRoundVideoBubbleOptions) {
  // bubble.style.background = 'magenta';
  const content = bubble.querySelector('.bubble-content') as HTMLElement;

  const hasBesideButton = !!bubble.querySelector('.bubble-beside-button');
  const transcribe = document.createElement('div');
  transcribe.classList.add('bubble-beside-button', 'bubble-beside-button--transcribe', 'with-hover');
  hasBesideButton && transcribe.classList.add('bubble-beside-button--lifted');
  transcribe.append(Icon('transcribe'));
  content.append(transcribe);
  bubble.classList.add('with-beside-button');

  const mediaContainer = bubble.querySelector('.media-container') as HTMLElement;
  const audioContainer = document.createElement('div');
  audioContainer.classList.add('message');
  audioContainer.style.display = 'none';
  content.append(audioContainer);

  let isShownAudio = false;

  const bubbleVideoClassNames = ['round', 'just-media'];
  const bubbleAudioClassNames = ['can-have-tail', 'voice-message'];

  const transcribedText = document.createElement('div');
  transcribedText.classList.add('audio-transcribed-text');
  transcribedText.innerText = shortText;
  // transcribedText.innerText = longText;


  let animatedCanvas: HTMLCanvasElement;

  async function hideAudio() {
    isShownAudio = false;


    const initialThumbBcr = audioContainer.querySelector('.audio-thumb')?.getBoundingClientRect();
    const initialThumbLeft = initialThumbBcr.left + initialThumbBcr.width / 2;
    const initialThumbTop = initialThumbBcr.top + initialThumbBcr.height / 2;
    const initialThumbSize = initialThumbBcr.width;

    log('initialThumbBcr', initialThumbBcr);

    const contentStyle = window.getComputedStyle(content);

    const initialRadiuses = [
      contentStyle.borderStartStartRadius,
      contentStyle.borderStartEndRadius,
      contentStyle.borderEndEndRadius,
      contentStyle.borderEndStartRadius
    ];

    animatedCanvas.style.left = initialThumbLeft + 'px';
    animatedCanvas.style.top = initialThumbTop + 'px';
    animatedCanvas.style.width = initialThumbSize + 'px';
    animatedCanvas.style.height = initialThumbSize + 'px';
    animatedCanvas.style.borderRadius = '50%';
    document.body.append(animatedCanvas);

    transcribe.style.removeProperty('display');

    const initialHeight = content.clientHeight;
    const initialWidth = content.clientWidth;
    log('initialHeight', initialHeight);
    content.style.height = initialHeight + 'px';
    content.style.width = initialWidth + 'px';
    content.style.overflow = 'hidden';
    content.style.setProperty('background', contentStyle.background, 'important');

    audioContainer.style.width = audioContainer.clientWidth + 'px';
    audioContainer.style.height = audioContainer.clientHeight + 'px';

    mediaContainer.style.opacity = '0';
    mediaContainer.style.position = 'absolute';
    mediaContainer.style.display = 'block';

    bubbleVideoClassNames.forEach(cls => bubble.classList.add(cls));
    bubbleAudioClassNames.forEach(cls => bubble.classList.remove(cls));

    const reply = bubble.querySelector('.reply') as HTMLElement;
    reply?.style.removeProperty('display');

    await doubleRaf();

    const targetHeight = mediaContainer.clientHeight;
    const targetWidth = mediaContainer.clientWidth;
    log('targetHeight', targetHeight);

    // return;
    animateValue(0, 1, ANIMATION_TIME, (progress) => {
      const targetBcr = content?.getBoundingClientRect();
      const targetLeft = targetBcr.left + targetBcr.width / 2;
      const targetTop = targetBcr.top + targetBcr.height / 2;
      const targetSize = targetBcr.width;

      animatedCanvas.style.left = lerp(initialThumbLeft, targetLeft, progress) + 'px';
      animatedCanvas.style.top = lerp(initialThumbTop, targetTop, progress) + 'px';
      animatedCanvas.style.width = lerp(initialThumbSize, targetSize, progress) + 'px';
      animatedCanvas.style.height = lerp(initialThumbSize, targetSize, progress) + 'px';

      content.style.height = lerp(initialHeight, targetHeight, progress) + 'px';
      content.style.width = lerp(initialWidth, targetWidth, progress) + 'px';

      const tr = initialRadiuses.map(r => lerp(parseInt(r), targetSize, Math.min(1, progress * 1.5)) + 'px').join(' ')

      content.style.setProperty('border-radius', tr);

      audioContainer.style.opacity = lerp(1, 0, progress) + '';
    }, {
      onEnd: () => {
        animatedCanvas.remove();
        animatedCanvas = undefined;

        audioContainer.style.display = 'none';
        mediaContainer.style.removeProperty('opacity');
        mediaContainer.style.removeProperty('position');
        mediaContainer.style.display = 'block';

        content.style.removeProperty('overflow');
        content.style.removeProperty('background');
        content.style.removeProperty('width');
        content.style.removeProperty('height');
        content.style.removeProperty('max-width');
        content.style.removeProperty('border-radius');

        audioContainer.style.removeProperty('width');
        audioContainer.style.removeProperty('height');
        audioContainer.style.removeProperty('opacity');
      }
    });
  }

  async function showAudio() {
    isShownAudio = true;

    const currentFrameCanvas = mediaContainer.querySelector('.media-video') as HTMLVideoElement;
    const bcr = currentFrameCanvas.getBoundingClientRect();
    const initialSize = bcr.width;

    animatedCanvas = document.createElement('canvas');
    animatedCanvas.width = initialSize;
    animatedCanvas.height = initialSize;
    const ctx = animatedCanvas.getContext('2d');
    ctx.drawImage(currentFrameCanvas, 0, 0, initialSize, initialSize);
    animatedCanvas.style.position = 'fixed';
    animatedCanvas.style.zIndex = '1000';
    animatedCanvas.style.transform = 'translate(-50%, -50%)';
    const initialLeft = bcr.left + bcr.width / 2;
    const initialTop = bcr.top + bcr.height / 2;
    animatedCanvas.style.left = initialLeft + 'px';
    animatedCanvas.style.top = initialTop + 'px';
    animatedCanvas.style.width = initialSize + 'px';
    animatedCanvas.style.height = initialSize + 'px';
    animatedCanvas.style.borderRadius = '50%';

    console.log('initialLeft, initialTop', initialLeft, initialTop)

    document.body.append(animatedCanvas);

    // return;

    const initialHeight = content.clientHeight;
    const initialWidth = content.clientWidth;
    const initialRadius = Math.max(initialHeight, content.clientWidth);
    log('initialHeight, initialWidth, initialRadius', initialHeight, initialWidth, initialRadius);

    bubbleVideoClassNames.forEach(cls => bubble.classList.remove(cls));
    bubbleAudioClassNames.forEach(cls => bubble.classList.add(cls));

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

    content.style.overflow = 'hidden';

    const contentWrapperStyle = window.getComputedStyle(bubble.querySelector('.bubble-content-wrapper'));

    audioContainer.style.display = 'block';
    // const targetWidth = parseInt(contentWrapperStyle.maxWidth);
    const targetWidth = 299;
    const audioStyle = window.getComputedStyle(audioContainer);
    audioContainer.style.width = (targetWidth - (+ parseFloat(audioStyle.marginLeft) + parseFloat(audioStyle.marginRight))) + 'px'

    const bubbleTail = bubble.querySelector('.bubble-tail') as HTMLElement;

    const reply = bubble.querySelector('.reply') as HTMLElement;
    if(reply) reply.style.display = 'none';

    await doubleRaf();
    // console.log('margins audio', parseFloat(audioStyle.marginLeft) + parseFloat(audioStyle.marginRight));
    // const targetWidth = audioContainer.scrollWidth + parseFloat(audioStyle.marginLeft) + parseFloat(audioStyle.marginRight); // TODO Make this dynamic
    const targetHeight = audioContainer.scrollHeight /* + parseFloat(audioStyle.marginTop) + parseFloat(audioStyle.marginBottom) */ + 16; // TODO find actual height
    // audioContainer.style.width = audioContainer.scrollWidth + 'px';
    // audioContainer.style.height = audioContainer.scrollHeight + 'px';

    // const floatingDiv = createElementFromMarkup(`<div style="position:fixed;left:50%;top:50%;z-index:1000;width:min-content;"></div>`);
    // floatingDiv.append(audioContainer);
    // document.body.append(floatingDiv);

    log('targetHeight, targetWidth', targetHeight, targetWidth);

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
          const targetBcr = audioContainer.querySelector('.audio-thumb')?.getBoundingClientRect();
          const targetLeft = targetBcr.left + targetBcr.width / 2;
          const targetTop = targetBcr.top + targetBcr.height / 2;
          const targetSize = targetBcr.width;

          animatedCanvas.style.left = lerp(initialLeft, targetLeft, progress) + 'px';
          animatedCanvas.style.top = lerp(initialTop, targetTop, progress) + 'px';
          animatedCanvas.style.width = lerp(initialSize, targetSize, progress) + 'px';
          animatedCanvas.style.height = lerp(initialSize, targetSize, progress) + 'px';

          content.style.height = lerp(initialHeight, targetHeight, progress) + 'px';
          content.style.width = lerp(initialWidth, targetWidth, progress) + 'px';
          const tr = targetRadiuses.map(r => lerp(initialRadius, parseInt(r), Math.min(1, progress * 1)) + 'px').join(' ')

          content.style.setProperty('border-radius', tr);
        },
        {
          easing: simpleEasing,
          onEnd: async() => {
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
            audioContainer.style.removeProperty('width');
            audioContainer.style.removeProperty('height');

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

    const audioElement = await wrapDocument({
      message: message as any,
      customAudioToTextButton: closeButton,
      shouldWrapAsVoice: true
    });
    console.log('[video-trans] audioElement', message.mid, audioElement);
    audioContainer.append(audioElement);
    audioContainer.append(transcribedText);
  })();
}

const shortText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. \
  Morbi ac orci ut felis gravida iaculis. Nullam convallis varius ex lacinia maximus. \
  Praesent ac nisi lectus.`;

const longText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. \
Morbi ac orci ut felis gravida iaculis. Nullam convallis varius ex lacinia \
maximus. Praesent ac nisi lectus. Phasellus eget massa ut sem mattis lobortis \
ut ut ante. Etiam egestas congue dui, ac rhoncus sem hendrerit sed. Donec dignissim, \
ex eu molestie ultrices, libero massa sagittis nibh, ut varius justo lacus non mi. Fusce \
efficitur est non ante venenatis feugiat. Donec ut sollicitudin elit. Vestibulum \
egestas efficitur purus, eu molestie odio feugiat tempus. Pellentesque nec feugiat \
felis. Pellentesque massa orci, pharetra non tellus quis, viverra tincidunt tellus. \
Ut sodales, tortor non semper tempus, justo est sollicitudin nisl, ac tincidunt dolor \
leo ac dolor.`;

const simpleEasing = BezierEasing(0.25, 0.1, 0.25, 1);

/*


(async() => {
    const audioElement = await wrapDocument({
      message: message as any,
      shouldWrapAsVoice: true
    });

    const myBubble = document.createElement('div');
    myBubble.classList.add(
      'bubble',
      ...'bubble voice-message min-content is-single-document hide-name is-out is-read'.split(' ')
    );
    // TODO Check classes bubble voice-message min-content is-single-document hide-name is-out can-have-tail is-read is-group-last
    const contentWrapper = document.createElement('div');
    contentWrapper.classList.add('bubble-content-wrapper');

    myBubble.append(contentWrapper);

    const content = document.createElement('div');
    content.classList.add('bubble-content');

    contentWrapper.append(content);

    const bg = document.createElement('div');
    bg.classList.add('bubble-content-background');

    content.append(bg);

    const messageEl = document.createElement('div');
    messageEl.classList.add('message', 'spoilers-container');

    content.append(messageEl);
    messageEl.append(createElementFromMarkup(`<span class="clearfix"></span>`), audioElement);
    resultingBubble.append(myBubble);
  })();

*/
