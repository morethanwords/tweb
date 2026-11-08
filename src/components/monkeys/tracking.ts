import InputField from '@components/inputField';
import lottieLoader from '@lib/lottie/lottieLoader';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import CodeInputFieldCompat from '@components/codeInputField';
import {fastRaf} from '@helpers/schedulers';
import withTimeout from '@helpers/schedulers/withTimeout';
import forgetFailedRequest from '@helpers/forgetFailedRequest';
import noop from '@helpers/noop';

const IDLE_ASSET = 'TwoFactorSetupMonkeyIdle';
const TRACKING_ASSET = 'TwoFactorSetupMonkeyTracking';

/** How long a card waits for its monkey before it opens without it (a slow link, a failed fetch): */
const PRELOAD_WAIT_MS = 1000;

let loaded: Promise<void>;

/**
 * Loads what the monkey is drawn from - its two animations, and what a page's first sticker otherwise starts after its
 * card has opened (lottieLoader.loadLottieEngine) - so that the card opens with it drawn. Started on the card before it (the number), as soon as one is typed; whatever opens the code card waits for
 * it. Resolves once loaded, or after PRELOAD_WAIT_MS, and never rejects; a failed load is tried again by the next call.
 */
export function preloadTrackingMonkey() {
  loaded ??= forgetFailedRequest(Promise.all([
    lottieLoader.loadLottieEngine(),
    lottieLoader.loadAnimationFromURLManually(IDLE_ASSET),
    lottieLoader.loadAnimationFromURLManually(TRACKING_ASSET)
  ]).then(noop), () => loaded, () => loaded = undefined);

  return withTimeout(loaded, PRELOAD_WAIT_MS).catch(noop);
}

export default class TrackingMonkey {
  public container: HTMLElement;

  protected max = 45;
  protected needFrame = 0;

  protected animation: LottiePlayer;
  protected idleAnimation: LottiePlayer;

  protected loadPromise: Promise<any>;

  constructor(protected inputField: InputField | CodeInputFieldCompat, protected size: number) {
    this.container = document.createElement('div');
    this.container.classList.add('media-sticker-wrapper');

    const input = inputField.input;

    input.addEventListener('blur', () => {
      this.playAnimation(0);
    });

    const isCodeInputField = inputField instanceof CodeInputFieldCompat;

    if(isCodeInputField) {
      input.addEventListener('focus', () => {
        this.playAnimation(1);
      });

      input.addEventListener('input', (e) => {
        fastRaf(() => {
          const frac = (1 + inputField.value.length) / inputField.options.length;
          this.playAnimation(frac * this.max);
        })
      });
    } else {
      input.addEventListener('input', (e) => {
        this.playAnimation(inputField.value.length);
      });
    }

    /* codeInput.addEventListener('focus', () => {
      playAnimation(Math.max(codeInput.value.length, 1));
    }); */
  }

  // 1st symbol = frame 15
  // end symbol = frame 165
  public playAnimation(length: number) {
    if(!this.animation) return;

    length = Math.min(length, 30);
    let frame: number;
    if(length) {
      frame = Math.round(Math.min(this.max, length) * (165 / this.max) + 11.33);

      if(this.idleAnimation) {
        this.idleAnimation.stop(true);
        this.idleAnimation.canvas[0].style.display = 'none';
      }

      this.animation.canvas[0].style.display = '';
    } else {
      /* const cb = (frameNo: number) => {
        if(frameNo <= 1) { */
      /* idleAnimation.play();
          idleAnimation.canvas.style.display = '';
          animation.canvas.style.display = 'none'; */
      /*     animation.removeListener('enterFrame', cb);
        }
      };
      animation.addListener('enterFrame', cb); */

      frame = 0;
    }
    // animation.playSegments([1, 2]);

    const direction = this.needFrame > frame ? -1 : 1;
    // console.log('keydown', length, frame, direction);

    this.animation.setDirection(direction);
    if(this.needFrame !== 0 && frame === 0) {
      this.animation.setSpeed(7);
    }
    /* let diff = Math.abs(needFrame - frame * direction);
    if((diff / 20) > 1) animation.setSpeed(diff / 20 | 0); */
    this.needFrame = frame;

    this.animation.play();

    /* animation.goToAndStop(15, true); */
    // animation.goToAndStop(length / max * );
  }

  public load() {
    if(this.loadPromise) return this.loadPromise;
    return this.loadPromise = Promise.all([
      lottieLoader.loadAnimationAsAsset({
        container: this.container,
        loop: true,
        autoplay: true,
        width: this.size,
        height: this.size
      }, IDLE_ASSET).then((animation) => {
        this.idleAnimation = animation;

        // ! animationIntersector will stop animation instantly
        if(!this.inputField.value.length) {
          animation.play();
        }

        return lottieLoader.waitForFirstFrame(animation);
      }),

      lottieLoader.loadAnimationAsAsset({
        container: this.container,
        loop: false,
        autoplay: false,
        width: this.size,
        height: this.size
      }, TRACKING_ASSET).then((_animation) => {
        this.animation = _animation;

        if(!this.inputField.value.length) {
          this.animation.canvas[0].style.display = 'none';
        }

        this.animation.addEventListener('enterFrame', (currentFrame) => {
          // console.log('enterFrame', currentFrame, needFrame);
          // let currentFrame = Math.round(e.currentTime);

          if((this.animation.direction === 1 && currentFrame >= this.needFrame) ||
            (this.animation.direction === -1 && currentFrame <= this.needFrame)) {
            this.animation.setSpeed(1);
            this.animation.pause();
          }

          if(currentFrame === 0 && this.needFrame === 0) {
            // animation.curFrame = 0;

            if(this.idleAnimation) {
              this.idleAnimation.canvas[0].style.display = '';
              this.idleAnimation.play();
              this.animation.canvas[0].style.display = 'none';
            }
          }
        });
        // console.log(animation.getDuration(), animation.getDuration(true));

        return lottieLoader.waitForFirstFrame(_animation);
      })
    ]);
  }

  public remove() {
    if(this.animation) this.animation.remove();
    if(this.idleAnimation) this.idleAnimation.remove();
  }
}
