import {JSX, splitProps} from 'solid-js';

import {i18n} from '../../../lib/langPack';
import {IconTsx} from '../../iconTsx';

import {animateToNewRotationOrRatio} from '../canvas/animateToNewRotationOrRatio';
import LargeButton, {MediaEditorLargeButtonProps} from '../largeButton';
import {useMediaEditorContext} from '../context';
import {withCurrentOwner} from '../utils';

const ratioRects = {
  '1x1': () => <rect x="4" y="4" width="16" height="16" rx="2" stroke="white" stroke-width="1.66" />,
  '3x2': () => <rect x="3" y="6" width="18" height="12" rx="2" stroke="white" stroke-width="1.66" />,
  '4x3': () => <rect x="3" y="5" width="18" height="14" rx="2" stroke="white" stroke-width="1.66" />,
  '5x4': () => <rect x="3" y="4.5" width="18" height="15" rx="2" stroke="white" stroke-width="1.66" />,
  '7x5': () => <rect x="3" y="4" width="18" height="16" rx="2" stroke="white" stroke-width="1.66" />,
  '16x9': () => <rect x="2.5" y="6.5" width="19" height="11" rx="2" stroke="white" stroke-width="1.66" />
};

const ratioIcon = (ratio: keyof typeof ratioRects, rotated?: boolean) => (
  <svg
    classList={{'media-editor__crop-item-icon--rotated': rotated}}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {ratioRects[ratio]()}
  </svg>
);

function Item(
  inProps: MediaEditorLargeButtonProps & {
    icon: JSX.Element;
    text: JSX.Element;
  }
) {
  const [props, buttonProps] = splitProps(inProps, ['icon', 'text']);

  return (
    <LargeButton {...buttonProps} class="media-editor__crop-item">
      {props.icon}
      {props.text}
    </LargeButton>
  );
}

export default function CropTab() {
  const {editorState, mediaState, actions} = useMediaEditorContext();

  const isActive = (what?: string) => editorState.fixedImageRatioKey === what;

  const onRatioClick = withCurrentOwner((ratio?: string) => {
    editorState.fixedImageRatioKey = ratio;
    animateToNewRotationOrRatio(mediaState.rotation);
    actions.resetRotationWheel();
  });

  return (
    <>
      <div class="media-editor__label">{i18n('MediaEditor.AspectRatio')}</div>

      <Item
        icon={<IconTsx icon="free_transform" />}
        text={i18n('MediaEditor.Free')}
        active={isActive()}
        onClick={() => onRatioClick()}
      />
      <Item
        icon={<IconTsx icon="image_original" />}
        text={i18n('MediaEditor.Original')}
        active={isActive('original')}
        onClick={() => onRatioClick('original')}
      />
      <Item
        icon={ratioIcon('1x1')}
        text={i18n('MediaEditor.Square')}
        active={isActive('1x1')}
        onClick={() => onRatioClick('1x1')}
      />

      <div class="media-editor__crop-grid">
        <Item icon={ratioIcon('3x2')} text="3:2" active={isActive('3x2')} onClick={() => onRatioClick('3x2')} />
        <Item icon={ratioIcon('3x2', true)} text="2:3" active={isActive('2x3')} onClick={() => onRatioClick('2x3')} />

        <Item icon={ratioIcon('4x3')} text="4:3" active={isActive('4x3')} onClick={() => onRatioClick('4x3')} />
        <Item icon={ratioIcon('4x3', true)} text="3:4" active={isActive('3x4')} onClick={() => onRatioClick('3x4')} />

        <Item icon={ratioIcon('5x4')} text="5:4" active={isActive('5x4')} onClick={() => onRatioClick('5x4')} />
        <Item icon={ratioIcon('5x4', true)} text="4:5" active={isActive('4x5')} onClick={() => onRatioClick('4x5')} />

        <Item icon={ratioIcon('7x5')} text="7:5" active={isActive('7x5')} onClick={() => onRatioClick('7x5')} />
        <Item icon={ratioIcon('7x5', true)} text="5:7" active={isActive('5x7')} onClick={() => onRatioClick('5x7')} />

        <Item icon={ratioIcon('16x9')} text="16:9" active={isActive('16x9')} onClick={() => onRatioClick('16x9')} />
        <Item
          icon={ratioIcon('16x9', true)}
          text="9:16"
          active={isActive('9x16')}
          onClick={() => onRatioClick('9x16')}
        />
      </div>
    </>
  );
}
