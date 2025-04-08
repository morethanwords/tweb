import {batch, createEffect, createSignal, onCleanup, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';

import ListenerSetter from '../../helpers/listenerSetter';
import appMediaPlaybackController from '../../components/appMediaPlaybackController';
import {IconTsx} from '../../components/iconTsx';
import clamp from '../../helpers/number/clamp';
import {IS_MOBILE} from '../../environment/userAgent';

import {i18n} from '../langPack';
import classNames from '../../helpers/string/classNames';

type SpeedDragHandlerProps = {
  video: HTMLVideoElement;
  onShowSpeed: () => void;
  onHideSpeed: () => void;
};

type InternalSpeedDragHandlerProps = SpeedDragHandlerProps & {
  controlsRef: (value: SpeedDragHandlerControls) => void;
};

type SpeedDragHandlerControls = {
  isChangingSpeed: () => boolean;
};


const HIDE_TIP_MOUSE_MOVE_THRESHOLD = 2;
const SHOW_TIP_TIMEOUT = 200;
const HIDE_TIP_TIMEOUT = 1500;

const SPEED_PER_PX = 1 / 100;
const SPEED_MULTIPLIER_WHEN_BELOW_ONE = 0.2;
const MAX_SPEED = 5;
const MIN_SPEED = 0.2;


export function SpeedDragHandler(props: InternalSpeedDragHandlerProps) {
  const [currentSpeed, setCurrentSpeed] = createSignal(appMediaPlaybackController.playbackRate);

  const [showSpeed, setShowSpeed] = createSignal(false);
  const [hideSpeedTip, setHideSpeedTip] = createSignal(true);
  const [mouseCoords, setMouseCoords] = createSignal<[number, number]>([0, 0]);

  const controls: SpeedDragHandlerControls = {
    isChangingSpeed: () => showSpeed()
  };
  props.controlsRef(controls);

  let speedTipRef: HTMLDivElement;

  const listenerSetter = new ListenerSetter();

  onMount(() => {
    let initialMousePosition: [number, number];
    let showTimeout = 0;
    let initialSpeed = 1;
    let additionalSpeed = 0;

    function show() {
      const rect = props.video.getBoundingClientRect();

      batch(() => {
        setShowSpeed(true);
        setMouseCoords([
          initialMousePosition[0] - rect.left,
          initialMousePosition[1] - rect.top
        ]);
      });

      if(additionalSpeed) {
        appMediaPlaybackController.playbackRate = Math.min(initialSpeed + additionalSpeed, MAX_SPEED);
      }

      window.setTimeout(() => {
        if(!speedTipRef) return;
        const speedTipRect = speedTipRef.getBoundingClientRect();
        if(
          speedTipRect.left < rect.left ||
          speedTipRect.top < rect.top ||
          speedTipRect.right > rect.right ||
          speedTipRect.bottom > rect.bottom
        ) {
          setHideSpeedTip(true);
        } else {
          setHideSpeedTip(false);
        }

        setTimeout(() => {
          if(!hideSpeedTip()) setHideSpeedTip(true);
        }, HIDE_TIP_TIMEOUT);
      }, 0);
    }

    listenerSetter.add(props.video)('pointerdown', (e) => {
      if(props.video.paused) return;

      initialMousePosition = [e.clientX, e.clientY];
      initialSpeed = appMediaPlaybackController.playbackRate;

      if(!IS_MOBILE && areSpeedsEqual(initialSpeed, 1)) {
        additionalSpeed = 1;
      }
      if(IS_MOBILE) {
        additionalSpeed = initialSpeed;
      }

      showTimeout = window.setTimeout(() => {
        show();
      }, SHOW_TIP_TIMEOUT);
    });

    listenerSetter.add(window)('pointermove', (e) => {
      if(!initialMousePosition || IS_MOBILE) return;

      const moveX = e.clientX - initialMousePosition[0];

      const startSpeed = initialSpeed + additionalSpeed;
      const changedSpeed = moveX * SPEED_PER_PX;

      let newSpeed: number;

      if(startSpeed < 1) {
        const borrowedUnits = Math.min((1 - startSpeed) / SPEED_MULTIPLIER_WHEN_BELOW_ONE, changedSpeed);

        newSpeed = startSpeed +
          borrowedUnits * SPEED_MULTIPLIER_WHEN_BELOW_ONE +
          Math.max(0, changedSpeed - borrowedUnits);
        //
      } else if(startSpeed + changedSpeed < 1) {
        newSpeed = 1 - (1 - startSpeed - changedSpeed) * SPEED_MULTIPLIER_WHEN_BELOW_ONE;
      } else {
        newSpeed = startSpeed + changedSpeed;
      }

      newSpeed = clamp(newSpeed, MIN_SPEED, MAX_SPEED);

      if(!areSpeedsEqual(appMediaPlaybackController.playbackRate, newSpeed)) {
        appMediaPlaybackController.playbackRate = newSpeed;
      }

      if(!initialMousePosition || hideSpeedTip()) return;

      const move = Math.hypot(
        moveX,
        e.clientY - initialMousePosition[1]
      );

      if(move > HIDE_TIP_MOUSE_MOVE_THRESHOLD) {
        setHideSpeedTip(true);
        window.clearTimeout(showTimeout);
        setShowSpeed(true);
      };
    });

    listenerSetter.add(window)('pointerup', () => {
      if(!initialMousePosition) return;

      window.clearTimeout(showTimeout);
      batch(() => {
        setHideSpeedTip(true);
        setShowSpeed(false);
        setMouseCoords([0, 0]);
      });
      initialMousePosition = undefined;

      if(additionalSpeed) {
        appMediaPlaybackController.playbackRate = initialSpeed;
      }
      additionalSpeed = 0;
    });

    listenerSetter.add(appMediaPlaybackController)('playbackParams', () => {
      setCurrentSpeed(appMediaPlaybackController.playbackRate);
    });
  });

  createEffect(() => {
    if(showSpeed()) {
      props.onShowSpeed();
      if(props.video) {
        props.video.dataset.startedChangingSpeed = 'true';
        props.video.dataset.wasChangingSpeed = 'true';
        setTimeout(() => {
          delete props.video.dataset.startedChangingSpeed;
        }, 100);
      }

      onCleanup(() => {
        props.onHideSpeed();

        if(props.video) {
          setTimeout(() => {
            delete props.video.dataset.wasChangingSpeed;
          }, 100);
        }
      });
    }
  });

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  const formattedSpeed = () => currentSpeed().toFixed(1).replace(/\.0$/, '');

  return (
    <Show when={showSpeed()}>
      <div
        class="speed-drag-handler__speed"
        style={{
          '--animation-duration-multiplier': currentSpeed()
        }}
      >
        <div class="speed-drag-handler__speed-number">
          {formattedSpeed()}x
        </div>
        <div class="speed-drag-handler__speed-arrows">
          <SpeedArrowRight />
          <SpeedArrowRight class="speed-drag-handler__speed-arrow-right-last" />
        </div>
      </div>

      <div
        ref={speedTipRef}
        class="speed-drag-handler__speed-tip"
        classList={{
          'speed-drag-handler__speed-tip--visible': !hideSpeedTip() && !IS_MOBILE
        }}
        style={{
          '--left': mouseCoords()[0] + 'px',
          '--top': mouseCoords()[1] + 'px'
        }}
      >
        <div class="speed-drag-handler__speed-tip-arrows">
          <IconTsx icon="arrow_prev" />
          <IconTsx icon="arrow_next" />
        </div>
        <div class="speed-drag-handler__speed-tip-description">
          {i18n('PlaybackRateDragTip')}
        </div>
      </div>
    </Show>
  );
}


export function createSpeedDragHandler(props: SpeedDragHandlerProps) {
  const element = document.createElement('div');
  let controls: SpeedDragHandlerControls;

  const dispose = render(
    () => (
      <SpeedDragHandler
        controlsRef={(value) => {
          controls = value
        }}
        {...props}
      />
    ),
    element
  );

  return {
    element,
    get controls() {
      return controls;
    },
    dispose
  };
}

function areSpeedsEqual(a: number, b: number) {
  return a.toFixed(1) === b.toFixed(1);
}

function SpeedArrowRight(props: {class?: string}) {
  return (
    <svg class={classNames('speed-drag-handler__speed-arrow-right', props.class)} width="8" height="11" viewBox="0 0 8 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path opacity="0.7" d="M0 1.5V9.5C0 10.324 0.940764 10.7944 1.6 10.3L6.93333 6.3C7.46667 5.9 7.46667 5.1 6.93333 4.7L1.6 0.7C0.940764 0.205573 0 0.675955 0 1.5Z" fill="currentColor"/>
    </svg>
  );
}
