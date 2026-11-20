import {useMediaEditorContext} from '@components/mediaEditor/context';

export default function SpotlightMask(props: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  roundness?: number;
}) {
  const {editorState} = useMediaEditorContext();
  return <>
    <div class="media-editor__spotlight-background" style={{mask: `url(#${props.id})`}} />
    <svg class="media-editor__spotlight-mask-svg" width="0" height="0">
      <mask id={props.id}>
        <rect x="0" y="0" width={editorState.canvasSize?.[0] + 1} height={editorState.canvasSize?.[1] + 1} fill="white" />
        <rect x={props.left} y={props.top} width={props.width} height={props.height} rx={props.roundness} fill="black" />
      </mask>
    </svg>
  </>;
}
