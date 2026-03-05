import {createMemo, JSX} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {useMediaEditorContext} from '../context';
import {getSnappedViewportsScale} from '../utils';
import {useCropOffset} from './useCropOffset';


const strokeWidth = 3;
const strokeLength = 6;
const strokeGap = 10;

export default function AvatarEdgePreview() {
  const {editorState, isEditingForumAvatar} = useMediaEditorContext();

  const isCropping = () => editorState.currentTab === 'crop';

  const size = createMemo(() => {
    const [w, h] = editorState.canvasSize;
    return w > h ? h : w;
  });

  const cropOffset = useCropOffset();

  const toCropScale = createMemo(() => {
    return 1 / getSnappedViewportsScale(1 / 1, size(), size(), cropOffset().width, cropOffset().height);
  });

  const toCropTranslate = createMemo(() => {
    const [w, h] = editorState.canvasSize;
    const cropOffsetCenterW = cropOffset().left + cropOffset().width / 2;
    const cropOffsetCenterH = cropOffset().top + cropOffset().height / 2;
    return [cropOffsetCenterW - w / 2, cropOffsetCenterH - h / 2];
  });

  return (
    <div class="media-editor__avatar-edge-preview">
      <svg
        style={{
          width: size() + 'px',
          height: size() + 'px',
          transform: isCropping() ? `translate(${toCropTranslate()[0]}px, ${toCropTranslate()[1]}px) scale(${toCropScale()})` : undefined,
          opacity: editorState.isMoving ? 0 : 1
          // transition: 'opacity 0.12s'
        }}
        viewBox={`0 0 ${size()} ${size()}`}
      >
        <Dynamic
          component={isEditingForumAvatar ? Rect : Circle}
          size={size()}
          fill="none"
          stroke="black"
          stroke-width={strokeWidth}
          stroke-dasharray={`${strokeLength + strokeWidth / 2} ${strokeGap - strokeWidth / 2}`}
          stroke-dashoffset={strokeWidth / 4}
          stroke-linecap='round'
        />
        <Dynamic
          component={isEditingForumAvatar ? Rect : Circle}
          size={size()}
          fill="none"
          stroke="white"
          stroke-width={strokeWidth / 2}
          stroke-dasharray={`${strokeLength} ${strokeGap}`}
          stroke-linecap='round'
        />
      </svg>
    </div>
  )
}

const Circle = (props: { size: number } & JSX.PresentationSVGAttributes) =>
  <circle
    cx={props.size / 2}
    cy={props.size / 2}
    r={props.size / 2 - strokeWidth}
    {...props}
  />

const Rect = (props: { size: number } & JSX.PresentationSVGAttributes) =>
  <rect
    x={strokeWidth}
    y={strokeWidth}
    width={props.size - strokeWidth * 2}
    height={props.size - strokeWidth * 2}
    rx={0.33 * (props.size - strokeWidth * 2)}
    ry={0.33 * (props.size - strokeWidth * 2)}
    {...props}
  />
