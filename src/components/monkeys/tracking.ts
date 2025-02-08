/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import InputField from '../inputField';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';

export default class TrackingMonkey {
  public container: HTMLElement;

  protected max = 45;
  protected needFrame = 0;

  protected animation: RLottiePlayer;
  protected idleAnimation: RLottiePlayer;

  protected loadPromise: Promise<any>;

  constructor(protected inputField: InputField, protected size: number) {
    this.container = document.createElement('div');
    this.container.classList.add('media-sticker-wrapper');

    const input = inputField.input;

    input.addEventListener('blur', () => {
      this.playAnimation(0);
    });

    input.addEventListener('input', (e) => {
      this.playAnimation(inputField.value.length);
    });

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
      }, 'TwoFactorSetupMonkeyIdle').then((animation) => {
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
      }, 'TwoFactorSetupMonkeyTracking').then((_animation) => {
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
