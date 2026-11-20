import MediaEditorContext, {EditingMediaState, MediaEditorContextValue, MediaEditorState} from '@components/mediaEditor/context';
import {batch, createComponent, createSignal} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {restoreBrushBanks, snapshotBrushBanks} from '@components/mediaEditor/native/brushStateBank';
import {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import {NumberPair} from '@components/mediaEditor/types';
import {getSnappedViewportsScale} from '@components/mediaEditor/utils';
import {isDesktopCropGeometryActive} from '@components/mediaEditor/native/desktopCropGeometry';

type ModeSnapshot = {
  brushBank: ReturnType<typeof snapshotBrushBanks>;
  cropSize?: NumberPair;
  media: EditingMediaState;
  defaults: Pick<MediaEditorState, 'fixedImageRatioKey' | 'currentBrush' | 'currentTextLayerInfo'>;
};

/** Native mode Apply keeps ordinary history; Cancel returns to the mode's entry state. */
export default function createModeCheckpoint(context: MediaEditorContextValue) {
  const {mediaState, editorState, actions, mediaType} = context;
  // The checkpoint is made before the editor's provider mounts. Bind the shared
  // crop geometry helper to the same context without mounting any UI.
  let cropOffset: ReturnType<typeof useCropOffset>;
  createComponent(MediaEditorContext.Provider, {
    value: context,
    get children(): undefined {
      cropOffset = useCropOffset();
      return undefined;
    }
  });
  let snapshot: ModeSnapshot;
  const [active, setActive] = createSignal(false);

  return {
    active,
    // Repeated entry must not replace the checkpoint with the edits being previewed.
    begin() {
      if(snapshot) return;
      snapshot = structuredClone({
        brushBank: snapshotBrushBanks(editorState),
        cropSize: editorState.canvasSize && [cropOffset().width, cropOffset().height],
        media: unwrap(mediaState),
        defaults: {
          fixedImageRatioKey: editorState.fixedImageRatioKey,
          currentBrush: unwrap(editorState.currentBrush),
          currentTextLayerInfo: unwrap(editorState.currentTextLayerInfo)
        }
      });
      setActive(true);
    },
    apply() {
      snapshot = undefined;
      setActive(false);
    },
    cancel() {
      if(!snapshot) return;
      context.nativePaint?.cancelPending();
      context.nativePaint?.undoDraft();
      const saved = snapshot;
      snapshot = undefined;
      const resetRotation = mediaState.rotation !== saved.media.rotation ||
        editorState.fixedImageRatioKey !== saved.defaults.fixedImageRatioKey;

      // useFinalTransform compensates both values when the canvas resizes.
      // Restore them in the current crop viewport, so leaving the mode (and its
      // later ResizeObserver update) compensates only once, including after a
      // window resize or a change of aspect ratio inside the mode.
      const source = editorState.renderingPayload?.media;
      const savedDesktopGeometry = isDesktopCropGeometryActive({mediaState: saved.media,
        canUseDesktopExpandedCrop: context.canUseDesktopExpandedCrop});
      if(!savedDesktopGeometry && saved.cropSize && editorState.canvasSize && source && saved.media.currentImageRatio > 0) {
        const {width, height} = cropOffset();
        const [savedWidth, savedHeight] = saved.cropSize;
        const compensation = getSnappedViewportsScale(source.width / source.height, savedWidth, savedHeight, width, height) /
          getSnappedViewportsScale(saved.media.currentImageRatio, savedWidth, savedHeight, width, height);
        saved.media.scale *= compensation;
        saved.media.translation = saved.media.translation.map(value => value * compensation) as NumberPair;
      }

      // Let selection effects finish (including pending text history) before replacing it.
      editorState.selectedResizableLayer = undefined;
      batch(() => {
        // Do not reconcile by id: new layer objects remount contenteditable text content.
        if(!Object.prototype.hasOwnProperty.call(saved.media, 'nativeVideoQuality')) delete mediaState.nativeVideoQuality;
        if(!Object.prototype.hasOwnProperty.call(saved.media, 'desktopExpandedCrop')) delete mediaState.desktopExpandedCrop;
        if(!Object.prototype.hasOwnProperty.call(saved.media, 'androidPaintDocument')) delete mediaState.androidPaintDocument;
        Object.assign(mediaState, saved.media);
        Object.assign(editorState, saved.defaults);
        restoreBrushBanks(editorState, saved.brushBank);
        setActive(false);
      });
      actions.redrawBrushes();
      if(mediaType === 'video') actions.setVideoTime(saved.media.currentVideoTime);
      // This resets the wheel, not an in-flight crop/flip animation. The mode shell
      // must wait for that animation: the context currently exposes no cancellation.
      if(resetRotation) actions.resetRotationWheel();
    }
  };
}
