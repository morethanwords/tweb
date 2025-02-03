import {onMount, useContext} from 'solid-js';

import ripple from '../ripple';

import MediaEditorContext from './context';

export function useCanFinish() {
  const context = useContext(MediaEditorContext);
  const [history] = context.history;
  const [rotation] = context.rotation;
  const [translation] = context.translation;
  const [flip] = context.flip;
  const [scale] = context.scale;
  const [currentImageRatio] = context.currentImageRatio;
  const [imageSize] = context.imageSize;
  const [renderingPayload] = context.renderingPayload;

  return () => {
    if(!renderingPayload()) return false;

    function approximateCompare(value: number, toWhat: number) {
      return Math.abs(value - toWhat) < 0.00001;
    }
    const initialRatio = imageSize()[0] / imageSize()[1];
    const snappedRotation = Math.round(rotation() / (Math.PI * 2)) * Math.PI * 2;
    return (
      !approximateCompare(initialRatio, currentImageRatio()) ||
      !approximateCompare(rotation(), snappedRotation) ||
      !approximateCompare(flip()[0], 1) ||
      !approximateCompare(flip()[1], 1) ||
      !approximateCompare(scale(), 1) ||
      !approximateCompare(translation()[0], 0) ||
      !approximateCompare(translation()[1], 0) ||
      history().length > 0
    );
  };
}

export default function FinishButton(props: {onClick: () => void}) {
  let container: HTMLDivElement;

  onMount(() => {
    ripple(container);
  });

  const canFinish = useCanFinish();

  return (
    <div
      ref={container}
      onClick={props.onClick}
      class="media-editor__finish-button"
      classList={{
        'media-editor__finish-button--hidden': !canFinish()
      }}
    >
      <svg width="18" height="16" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 9L6.5 14L16 2" stroke="white" stroke-width="2.66" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
  );
}
