import {batch} from 'solid-js';
import {animateToNewRotationOrRatio} from '@components/mediaEditor/canvas/animateToNewRotationOrRatio';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import useCropActions from '@components/mediaEditor/canvas/useCropActions';
import desktopCropSession from '@components/mediaEditor/native/desktopCropSession';
import {isDesktopCropGeometryActive} from '@components/mediaEditor/native/desktopCropGeometry';

/** Shared canvas commands; the native shells supply their own direction and presentation. */
export default function useCropCommands() {
  const context = useMediaEditorContext();
  const {editorState, mediaState, actions} = context;
  const crop = useCropActions();

  const rotate = (deltaRadians: number) => {
    if(editorState.isMoving) return;
    crop.rotate(deltaRadians);
  };

  const flip = () => {
    if(editorState.isMoving) return;
    if(context.canUseDesktopExpandedCrop) {
      if(!isDesktopCropGeometryActive(context)) return;
      const session = desktopCropSession(context);
      session.commit(session.descriptor(), true);
    }
    // Flip the visible horizontal axis, which is the source's Y axis after a quarter turn.
    const reversed = Math.abs(Math.round(mediaState.rotation / Math.PI * 2)) & 1;
    const axis = reversed ? 1 : 0;
    mediaState.flip[axis] = mediaState.flip[axis] < 0 ? 1 : -1;
  };

  const setAspectRatio = (key?: string) => {
    if(editorState.isMoving) return;
    crop.setAspectRatio(key);
  };

  const reset = withCurrentOwner(() => {
    if(editorState.isMoving) return;
    batch(() => {
      editorState.fixedImageRatioKey = undefined;
      mediaState.flip = [1, 1];
      if(context.canUseDesktopExpandedCrop) {
        // Web's existing Reset adapts back to identity. The pinned Desktop has
        // quarter turns/flip and Save/Discard, not a fine-angle Reset control.
        mediaState.rotation = 0;
        mediaState.scale = 1;
        mediaState.translation = [0, 0];
        mediaState.currentImageRatio = editorState.mediaRatio;
        desktopCropSession(context).reset();
        actions.resetRotationWheel();
        return;
      }
      animateToNewRotationOrRatio(0);
      actions.resetRotationWheel();
    });
  });

  return {rotate, flip, setAspectRatio, reset};
}
