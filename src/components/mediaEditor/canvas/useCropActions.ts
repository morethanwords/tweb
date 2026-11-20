import {animateToNewRotationOrRatio} from '@components/mediaEditor/canvas/animateToNewRotationOrRatio';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import {getAppWindow} from '@helpers/appWindow';
import {desktopCropOrientation, isDesktopCropGeometryActive} from '@components/mediaEditor/native/desktopCropGeometry';

/** Geometry actions shared by the crop wheel and the native controls. */
export default function useCropActions() {
  const context = useMediaEditorContext();
  const {editorState, mediaState, actions, isEditingForAvatar} = context;

  const rotate = withCurrentOwner((deltaRadians: number) => {
    if(context.canUseDesktopExpandedCrop) {
      if(!isDesktopCropGeometryActive(context)) return;
      desktopCropOrientation(mediaState.rotation + deltaRadians, mediaState.flip);
      animateToNewRotationOrRatio(mediaState.rotation + deltaRadians);
      return;
    }
    // Android CropView.rotate (21f7d109:879–890) turns the locked crop with
    // the photo. Desktop keeps its chosen output ratio; Free/Original are
    // already resolved from the source orientation by the geometry action.
    if(!isEditingForAvatar && getAppWindow().innerWidth <= 800 && editorState.mediaSize &&
      Math.abs(Math.round(deltaRadians / Math.PI * 2)) % 2 && editorState.fixedImageRatioKey?.includes('x')) {
      editorState.fixedImageRatioKey = editorState.fixedImageRatioKey.split('x').reverse().join('x');
    }
    animateToNewRotationOrRatio(Math.round(mediaState.rotation / Math.PI * 2) * Math.PI / 2 + deltaRadians);
    actions.resetRotationWheel();
  });

  const setAspectRatio = withCurrentOwner((key?: string) => {
    if(context.canUseDesktopExpandedCrop && !isDesktopCropGeometryActive(context)) return;
    editorState.fixedImageRatioKey = key;
    // Desktop Crop::setAspectRatio (a532622:600–632) only unlocks the
    // edges for Free. The output shape and visible source rectangle stay put.
    if(key === undefined && !isEditingForAvatar && getAppWindow().innerWidth > 800) return;
    animateToNewRotationOrRatio(mediaState.rotation);
    actions.resetRotationWheel();
  });

  return {rotate, setAspectRatio};
}
