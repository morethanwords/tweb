import {Accessor, createEffect, createMemo} from 'solid-js';
import {render} from 'solid-js/web';

import styles from './preview.module.scss';
import classNames from '@helpers/string/classNames';

export type StoryboardFrame = {
  time: number, // * frame time in seconds (float)
  top: number,
  left: number
};

export type Storyboard = {
  image: HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  frames: StoryboardFrame[]
};

export type PreviewProps = {
  storyboard: Accessor<Storyboard>,
  visible: Accessor<boolean>,
  time: Accessor<number>
};

function Preview(props: PreviewProps) {
  createEffect<StoryboardFrame>((prevFrame) => {
    const storyboard = props.storyboard();
    if(!props.visible() || !storyboard) {
      return;
    }

    const time = props.time();
    const frame = storyboard.frames.find((frame) => time <= frame.time) ||
      storyboard.frames[storyboard.frames.length - 1];
    if(prevFrame === frame) {
      return prevFrame;
    }

    const {width, height} = canvasRef;
    const context = canvasRef.getContext('2d');
    context.clearRect(0, 0, width, height);
    context.drawImage(
      storyboard.image,
      frame.left,
      frame.top,
      storyboard.frameWidth,
      storyboard.frameHeight,
      0,
      0,
      width,
      height
    );

    return frame;
  });

  let canvasRef: HTMLCanvasElement;
  return (
    <canvas
      ref={canvasRef}
      // class={classNames(styles.PreviewCanvas, props.visible() && styles.Visible)}
      width={props.storyboard()?.frameWidth}
      height={props.storyboard()?.frameHeight}
      style={props.storyboard() && {
        width: `${props.storyboard().frameWidth * 1.5}px`,
        height: `${props.storyboard().frameHeight * 1.5}px`
      }}
    />
  );
}

export function createPreview(props: PreviewProps) {
  const element = document.createElement('div');
  element.classList.add(styles.Preview);

  const dispose = render(
    () => {
      createEffect(() => {
        element.classList.toggle('hide', !props.storyboard());
      });

      return (
        <Preview {...props} />
      );
    },
    element
  );

  return {
    element,
    dispose
  };
}
