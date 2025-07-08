import {batch, Component, createMemo, createSignal} from 'solid-js';

import clamp from '../../../helpers/number/clamp';
import swipe, {SwipeDirectiveArgs} from '../../../helpers/useSwipe'; swipe; // keep
import useElementSize from '../../../hooks/useElementSize';
import {i18n} from '../../../lib/langPack';

import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple'; ripple; // keep
import showTooltip from '../../tooltip';

import {SetVideoTimeFlags, useMediaEditorContext} from '../context';

import useVideoControlsCanvas from './useVideoControlsCanvas';

import styles from './videoControls.module.scss';


const HANDLE_WIDTH_PX = 9;
const MOVE_ACTIVATION_THRESHOLD_PX = 2;

const VideoControls: Component<{}> = () => {
  const {editorState, mediaState, actions} = useMediaEditorContext();

  const [cropper, setCropper] = createSignal<HTMLDivElement>();
  const [isDraggingSomething, setIsDraggingSomething] = createSignal(false);

  const cropperSize = useElementSize(cropper);
  const strippedWidth = () => cropperSize.width - 2 * HANDLE_WIDTH_PX;

  const shouldShowTime = () => isDraggingSomething() && (swiping === 'left' || swiping === 'right');

  const formattedResultingTime = createMemo(() => {
    if(!shouldShowTime()) return '';
    const video = editorState.renderingPayload?.media?.video;
    if(!video) return '';

    const totalSeconds = mediaState.videoCropLength * video.duration;
    let ts = totalSeconds;

    const hh = (Math.floor(ts / 3600) + '').padStart(2, '0');
    ts -= +hh * 3600;
    const mm = (Math.floor(ts / 60) + '').padStart(2, '0');
    ts -= +mm * 60;
    const ss = (Math.floor(ts) + '').padStart(2, '0');
    ts -= +ss;
    const decimal = (Math.floor(ts * 4) * 25 + '').replace(/0$/, '');

    return (+hh ? `${hh}:` : '') + `${mm}:${ss}` + (decimal && totalSeconds < 10 ? `.${decimal}` : '');
  });

  const minLength = createMemo(() => {
    const duration = editorState.renderingPayload?.media?.video?.duration;
    if(!duration) return 0;
    return Math.min(1, 0.5 / duration);
  });

  let
    canvas: HTMLCanvasElement,
    initialStart: number,
    initialLength: number,
    swiping: 'left' | 'middle' | 'right' | 'cursor';
  ;

  useVideoControlsCanvas({
    getCanvas: () => canvas,
    size: cropperSize
  });

  const leftHandleSwipeArgs: SwipeDirectiveArgs = {
    globalCursor: () => 'ew-resize',
    onStart: () => {
      swiping = 'left';
      initialStart = mediaState.videoCropStart;
      initialLength = mediaState.videoCropLength;

      batch(() => {
        setIsDraggingSomething(true);
        editorState.isPlaying = false;
      });
    },
    onMove: (xDiff) => void batch(() => {
      if(swiping !== 'left') return;
      const diff = clamp(initialStart + xDiff / strippedWidth(), 0, Math.max(0, initialStart + initialLength - minLength())) - initialStart;
      batch(() => {
        mediaState.videoCropStart = (initialStart + diff);
        mediaState.videoCropLength = (initialLength - diff);
        actions.setVideoTime(mediaState.videoCropStart);
      });
    }),
    onEnd: () => void setIsDraggingSomething(false)
  };

  const rightHandleSwipeArgs: SwipeDirectiveArgs = {
    globalCursor: () => 'ew-resize',
    onStart: () => {
      swiping = 'right';
      initialLength = mediaState.videoCropLength;

      batch(() => {
        setIsDraggingSomething(true);
        editorState.isPlaying = false;
      });
    },
    onMove: (xDiff) => void batch(() => {
      if(swiping !== 'right') return;
      const maxLength = 1 - mediaState.videoCropStart;
      mediaState.videoCropLength = (clamp(initialLength + xDiff / strippedWidth(), Math.min(minLength(), maxLength), maxLength));
      actions.setVideoTime(mediaState.videoCropStart + mediaState.videoCropLength);
    }),
    onEnd: () => void setIsDraggingSomething(false)
  };

  let canMove = false;

  const middleSwipeArgs: SwipeDirectiveArgs = {
    globalCursor: () => initialLength === 1 ? 'col-resize' : 'grabbing',
    onStart: (e) => {
      swiping = 'middle';
      initialStart = mediaState.videoCropStart;
      initialLength = mediaState.videoCropLength;
      canMove = false;

      if(initialLength === 1) {
        setIsDraggingSomething(true);
        canMove = true;
        handleCursorMove(e);
      }
    },
    onMove: (xDiff, _, e) => void batch((): void => {
      if(swiping !== 'middle') return;
      if(initialLength === 1) return void handleCursorMove(e);

      if(Math.abs(xDiff) > MOVE_ACTIVATION_THRESHOLD_PX) canMove = true;
      if(!canMove) return;

      const startDiff = clamp(initialStart + xDiff / strippedWidth(), 0, Math.max(0, 1 - Math.max(initialLength, minLength()))) - initialStart;
      batch(() => {
        setIsDraggingSomething(true);
        editorState.isPlaying = false;

        mediaState.videoCropStart = initialStart + startDiff;
        // mediaState.videoCropLength = clamp(initialLength - startDiff + xDiff / strippedWidth(), Math.min(1, minLength()), 1 - mediaState.videoCropStart);

        actions.setVideoTime(mediaState.videoCropStart);
      });
    }),
    onEnd: () => {
      self.setTimeout(() => {
        setIsDraggingSomething(false);
      }, 0); // prevent trigger click after finishing dragging
    }
  };

  const cursorSwipeArgs: SwipeDirectiveArgs = {
    globalCursor: () => 'col-resize',
    onStart: () => {
      swiping = 'cursor';
      setIsDraggingSomething(true);
    },
    onMove: (xDiff, __, e) => {
      if(swiping !== 'cursor') return;
      // if(Math.abs(xDiff) > MOVE_ACTIVATION_THRESHOLD_PX)
      editorState.isPlaying = false;
      handleCursorMove(e);
    },
    onEnd: () => void setIsDraggingSomething(false)
  };

  const handleCursorMove = (e: PointerEvent | TouchEvent) => {
    editorState.isPlaying = false;
    actions.setVideoTime(clamp(getPositionInCropper(e, cropper()), mediaState.videoCropStart, mediaState.videoCropStart + mediaState.videoCropLength));
  };

  const onMiddlePartClick = (e: MouseEvent) => {
    if(!cropper() || isDraggingSomething()) return;

    actions.setVideoTime(clamp(getPositionInCropper(e, cropper()), mediaState.videoCropStart, mediaState.videoCropStart + mediaState.videoCropLength));
  };

  const showMutedTooltip = (el: HTMLElement) => showTooltip({
    element: el,
    mountOn: el.parentElement.parentElement.parentElement,
    vertical: 'top',
    textElement: i18n('MediaEditor.VideoMutedTooltip'),
    lighter: true,
    auto: true
  });

  let closeTooltip: () => void;

  return (
    <div
      class={styles.Container}
      classList={{
        [styles.hidden]: editorState.currentTab !== 'adjustments',
        [styles.changed]: mediaState.videoCropLength !== 1
      }}
      style={{
        '--start': mediaState.videoCropStart,
        '--length': mediaState.videoCropLength,
        '--current-time': mediaState.currentVideoTime
      }}
    >
      <div class={styles.InnerContainer}>
        <button
          use:ripple
          class={`btn-icon ${styles.IconButton} ${styles.MuteButton}`}
          classList={{
            [styles.muted]: mediaState.videoMuted
          }}
          onClick={(e) => {
            mediaState.videoMuted = !mediaState.videoMuted;
            closeTooltip?.();
            if(mediaState.videoMuted) closeTooltip = showMutedTooltip(e.currentTarget).close;
          }}
          tabIndex={-1}
        >
          <IconTsx icon={mediaState.videoMuted ? 'volume_off' : 'volume_up'} />
        </button>

        <div class={styles.Frames}>
          <div ref={setCropper} class={styles.Cropper}>
            <canvas ref={canvas} class={styles.Images} width={cropperSize.width} height={cropperSize.height} />

            <div class={`${styles.CropperBg} ${styles.CropperBgLeft}`} />
            <div class={`${styles.CropperBg} ${styles.CropperBgRight}`} />

            <div
              class={styles.CropperHorizontalBorder}
              classList={{
                [styles.dragging]: isDraggingSomething()
              }}
              use:swipe={middleSwipeArgs}
              onClick={onMiddlePartClick}
            />

            <div class={`${styles.CropperHandle} ${styles.CropperHandleLeft}`} use:swipe={leftHandleSwipeArgs} />
            <div class={`${styles.CropperHandle} ${styles.CropperHandleRight}`} use:swipe={rightHandleSwipeArgs} />
          </div>

          <TimeStick swipe={cursorSwipeArgs} />
          <ThumbnailTrack
            cropper={cropper()}
            isDraggingSomething={isDraggingSomething()}
            hidden={shouldShowTime()}
          />
          <div class={styles.CroppedTime} classList={{[styles.visible]: shouldShowTime()}}>
            {formattedResultingTime()}
          </div>

        </div>

        <button
          use:ripple
          class={`btn-icon ${styles.IconButton} ${styles.PlayButton}`}
          onClick={() => {
            editorState.isPlaying = !editorState.isPlaying;
          }}
          tabIndex={-1}
        >
          <span class={styles.PlayButtonInner}> {/* <span> prevents duplicating the svg on hot reload */}
            <PausePlay paused={!editorState.isPlaying} />
          </span>
        </button>
      </div>
    </div>
  );
};

const ThumbnailTrack: Component<{
  cropper: HTMLDivElement;
  isDraggingSomething: boolean;
  hidden: boolean;
}> = (props) => {
  const {actions, editorState, mediaState} = useMediaEditorContext();

  const [ghostThumbnailPosition, setGhostThumbnailPosition] = createSignal<number>();

  const [isDragging, setIsDragging] = createSignal(false);

  const isGhostThumbnailVisible = createMemo(() => !props.isDraggingSomething && !isDragging() && !isNaN(ghostThumbnailPosition()));

  const onClick = (e: MouseEvent) => {
    if(!props.cropper) return;

    mediaState.videoThumbnailPosition = getPositionInCropper(e, props.cropper);
  };

  let canPreviewFrame = false, previewFrameTimeout: number;

  const onPointerMove = (e: PointerEvent | TouchEvent) => {
    if(!props.cropper || editorState.isPlaying || props.isDraggingSomething) return;

    if(!previewFrameTimeout) previewFrameTimeout = self.setTimeout(() => {
      canPreviewFrame = true;
    }, 200);

    const position = getPositionInCropper(e, props.cropper);

    setGhostThumbnailPosition(position);

    if(canPreviewFrame) actions.setVideoTime(position, SetVideoTimeFlags.UpdateVideo | SetVideoTimeFlags.Redraw);
  };

  const onPointerOut = () => {
    if(canPreviewFrame) actions.setVideoTime(mediaState.currentVideoTime, SetVideoTimeFlags.UpdateVideo | SetVideoTimeFlags.Redraw);

    setGhostThumbnailPosition();
    canPreviewFrame = false;
    self.clearTimeout(previewFrameTimeout);
    previewFrameTimeout = undefined;
  };

  const swipeArgs: SwipeDirectiveArgs = {
    globalCursor: () => 'grabbing',
    onStart: (e) => {
      void setIsDragging(true);
      if(!props.cropper) return;
      mediaState.videoThumbnailPosition = getPositionInCropper(e, props.cropper);
    },
    onMove: (_, __, e) => {
      if(!props.cropper) return;
      mediaState.videoThumbnailPosition = getPositionInCropper(e, props.cropper);
    },
    onEnd: () => void setIsDragging(false)
  };

  return (
    <>
      <ThumbnailMark position={mediaState.videoThumbnailPosition} visible={!props.hidden} withTransition />
      <ThumbnailMark position={ghostThumbnailPosition() || 0} ghost visible={!props.hidden && isGhostThumbnailVisible()} />

      <div
        class={styles.ThumbnailTrack}
        classList={{
          [styles.disabled]: props.isDraggingSomething
        }}
        use:swipe={swipeArgs}
        onPointerMove={onPointerMove}
        onTouchMove={onPointerMove}
        onPointerOut={onPointerOut}
        onTouchEnd={onPointerOut}
        onClick={onClick}
      />
    </>
  )
};

const ThumbnailMark: Component<{
  position: number;
  visible: boolean;
  ghost?: boolean;
  withTransition?: boolean;
}> = (props) => {
  return (
    <svg
      class={styles.ThumbnailMark}
      classList={{
        [styles.ghost]: props.ghost,
        [styles.visible]: props.visible,
        [styles.withTransition]: props.withTransition
      }}
      style={{
        '--position': props.position
      }}
      width="20"
      height="25"
      viewBox="0 0 20 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 10V10.9952C0 14.8798 2.58024 18.2044 5.87746 20.2583C7.46104 21.2448 8.92659 22.4551 9.61717 23.8212C9.70992 24.0047 10.2901 24.0047 10.3828 23.8212C11.0734 22.4551 12.539 21.2448 14.1225 20.2583C17.4198 18.2044 20 14.8798 20 10.9952V10C20 4.47715 15.5228 0 10 0C4.47715 0 0 4.47715 0 10Z" fill="white"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M8.45844 4.4165H8.48341H11.5167H11.5417C12.1739 4.4165 12.6838 4.41649 13.0968 4.45023C13.522 4.48497 13.8954 4.55836 14.2409 4.7344C14.7897 5.01403 15.2359 5.46023 15.5155 6.00903C15.6915 6.35454 15.7649 6.72798 15.7997 7.15314C15.8334 7.56605 15.8334 8.07595 15.8334 8.70813V8.73317V11.7665V11.7915C15.8334 12.4237 15.8334 12.9336 15.7997 13.3465C15.7649 13.7717 15.6915 14.1452 15.5155 14.4907C15.2359 15.0395 14.7897 15.4857 14.2409 15.7653C13.8954 15.9413 13.522 16.0147 13.0968 16.0495C12.6839 16.0832 12.174 16.0832 11.5418 16.0832H11.5167H8.48341H8.45843C7.82626 16.0832 7.3163 16.0832 6.90339 16.0495C6.47822 16.0147 6.10478 15.9413 5.75928 15.7653C5.21047 15.4857 4.76427 15.0395 4.48465 14.4907C4.3086 14.1452 4.23521 13.7717 4.20048 13.3465C4.16674 12.9336 4.16674 12.4237 4.16675 11.7915V11.7665V8.73317V8.7082C4.16674 8.07599 4.16674 7.56607 4.20048 7.15314C4.23521 6.72798 4.3086 6.35454 4.48465 6.00903C4.76427 5.46023 5.21047 5.01403 5.75928 4.7344C6.10478 4.55836 6.47822 4.48497 6.90339 4.45023C7.31631 4.41649 7.82624 4.4165 8.45844 4.4165ZM6.99839 5.61303C6.64537 5.64187 6.44255 5.69563 6.28893 5.77391C5.95965 5.94169 5.69193 6.2094 5.52415 6.53869C5.44588 6.69231 5.39211 6.89513 5.36327 7.24814C5.33387 7.60797 5.33341 8.07015 5.33341 8.73317V11.7665C5.33341 12.4295 5.33387 12.8917 5.36327 13.2516C5.36613 13.2866 5.36925 13.3203 5.37261 13.3525L6.26742 11.8925L6.28131 11.8699C6.46683 11.5672 6.62664 11.3064 6.77319 11.11C6.92275 10.9096 7.11058 10.7022 7.37928 10.5859C7.74882 10.4259 8.16801 10.4259 8.53755 10.5859C8.80625 10.7022 8.99406 10.9096 9.14363 11.11C9.26806 11.2767 9.40199 11.4898 9.55313 11.7356L10.3508 10.4342L10.3647 10.4115C10.5502 10.1088 10.7099 9.84804 10.8565 9.65169C11.0061 9.45131 11.1939 9.24382 11.4626 9.12756C11.8322 8.96764 12.2513 8.96764 12.6209 9.12756C12.8896 9.24382 13.0774 9.45131 13.227 9.65169C13.3736 9.84804 13.5333 10.1088 13.7188 10.4115L13.7327 10.4342L14.6667 11.958L14.6667 11.7665V8.73317C14.6667 8.07015 14.6663 7.60797 14.6369 7.24814C14.6081 6.89513 14.5543 6.69231 14.476 6.53869C14.3082 6.2094 14.0405 5.94169 13.7112 5.77391C13.5576 5.69563 13.3548 5.64187 13.0018 5.61303C12.6419 5.58363 12.1798 5.58317 11.5167 5.58317H8.48341C7.82039 5.58317 7.35821 5.58363 6.99839 5.61303ZM10.2374 12.8518L11.5028 14.9165H11.5167C12.1798 14.9165 12.6419 14.916 13.0018 14.8866C13.3548 14.8578 13.5576 14.804 13.7112 14.7258C14.0405 14.558 14.3082 14.2903 14.476 13.961C14.4835 13.9462 14.4908 13.931 14.4979 13.9152L12.738 11.0439C12.5347 10.7121 12.4027 10.4978 12.292 10.3495C12.2036 10.231 12.1614 10.2013 12.1553 10.1973C12.0827 10.1666 12.0008 10.1666 11.9282 10.1973C11.922 10.2013 11.8799 10.231 11.7915 10.3495C11.6808 10.4978 11.5488 10.7121 11.3455 11.0439L10.2374 12.8518ZM10.1344 14.9165L8.6547 12.5022C8.45134 12.1704 8.31936 11.9561 8.20867 11.8079C8.12021 11.6893 8.07814 11.6596 8.07199 11.6556C7.99939 11.6249 7.91744 11.6249 7.84484 11.6556C7.83869 11.6596 7.79662 11.6893 7.70816 11.8079C7.59747 11.9561 7.46548 12.1704 7.26212 12.5022L6.00854 14.5475C6.09569 14.6153 6.1895 14.6751 6.28893 14.7258C6.44255 14.804 6.64537 14.8578 6.99839 14.8866C7.35821 14.916 7.82039 14.9165 8.48341 14.9165H10.1344Z" fill="#212121"/>
    </svg>
  );
}

const TimeStick = (props: {swipe: SwipeDirectiveArgs}) => {
  return (
    <svg class={styles.TimeStick} use:swipe={props.swipe} width="6" height="60" viewBox="0 0 6 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 0.75C4.69036 0.75 5.25 1.30964 5.25 2V3.29297C5.24998 3.812 5.04377 4.30975 4.67676 4.67676C4.40352 4.95 4.25002 5.32061 4.25 5.70703V54.293C4.25002 54.6794 4.40352 55.05 4.67676 55.3232C5.04377 55.6903 5.24998 56.188 5.25 56.707V58C5.25 58.6904 4.69036 59.25 4 59.25H2C1.30964 59.25 0.75 58.6904 0.75 58V56.707C0.75002 56.188 0.956231 55.6903 1.32324 55.3232C1.59648 55.05 1.74998 54.6794 1.75 54.293V5.70703C1.74998 5.32061 1.59648 4.95 1.32324 4.67676C0.956231 4.30975 0.75002 3.812 0.75 3.29297V2C0.75 1.30964 1.30964 0.75 2 0.75H4Z" fill="white" stroke="#212121" stroke-width="0.5"/>
    </svg>
  )
};

export const PausePlay: Component<{
  paused: boolean;
}> = (props) => {
  return (
    <svg
      class={styles.PausePlaySvg}
      classList={{
        [styles.paused]: props.paused
      }}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <clipPath id="playSymbolClipPath">
        <path class={styles.PausePlaySvgPlay} d="M5 19.9138V4.0862C5 2.83455 6.44254 2.13342 7.42673 2.90672L17.4988 10.8205C18.2632 11.4211 18.2632 12.5789 17.4988 13.1795L7.42673 21.0933C6.44254 21.8666 5 21.1655 5 19.9138Z" fill="black" /* transform="translate(8, 12) scale(1.4) translate(-8, -12)" */ />
      </clipPath>

      <g class={styles.PausePlaySvgPause} id="pauseSymbol" clip-path='url(#playSymbolClipPath)'>
        <path class={styles.PausePlaySvgPauseLeft} d="M8.5 3H5C4.44772 3 4 3.44772 4 4V20C4 20.5523 4.44772 21 5 21H8.5C9.05228 21 9.5 20.5523 9.5 20V4C9.5 3.44772 9.05228 3 8.5 3Z" fill="white" />
        <path class={styles.PausePlaySvgPauseRight} d="M19 3H15.5C14.9477 3 14.5 3.44772 14.5 4V20C14.5 20.5523 14.9477 21 15.5 21H19C19.5523 21 20 20.5523 20 20V4C20 3.44772 19.5523 3 19 3Z" fill="white" />
      </g>
    </svg>
  );
};

function getPositionInCropper(e: PointerEvent | MouseEvent | TouchEvent, cropper: HTMLDivElement) {
  const clientX = e instanceof TouchEvent ? e.changedTouches[0].clientX : e.clientX;

  const bcr = cropper.getBoundingClientRect();
  const x = clientX - bcr.left - HANDLE_WIDTH_PX;
  const pos = x / (bcr.width - 2 * HANDLE_WIDTH_PX);

  return clamp(pos, 0, 1);
}

export default VideoControls;
