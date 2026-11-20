import {AdjustmentKey, adjustmentsConfig, NativeAdjustments, PhotoProcessingPolicy} from '@components/mediaEditor/adjustments';
import {BrushDrawnLine} from '@components/mediaEditor/canvas/brushPainter';
import {FinalTransform} from '@components/mediaEditor/canvas/useFinalTransform';
import type {PaintPreviewAffine} from '@components/mediaEditor/canvas/previewAffine';
import type {MediaEditorProps} from '@components/mediaEditor/mediaEditor';
import {EditorShape, MediaType, NumberPair, ResizableLayer, StickerRenderingInfo, TextLayerInfo} from '@components/mediaEditor/types';
import {approximateDeepEqual, brushDefaults, processHistoryItem, textLayerInfoDefaults, traverseObjectDeep} from '@components/mediaEditor/utils';
import {RenderingPayload} from '@components/mediaEditor/webgl/initWebGL';
import exceptKeys from '@helpers/object/exceptKeys';
import throttle from '@helpers/schedulers/throttle';
import type {AppManagers} from '@lib/managers';
import type {ObjectPath} from '@types';
import {Accessor, batch, createContext, createEffect, createMemo, createSignal, on, useContext} from 'solid-js';
import {createMutable, modifyMutable, produce, Store} from 'solid-js/store';
import createTextSessionBarrier from '@components/mediaEditor/native/textSessionBarrier';
import type {NativeVideoQualitySelectionV1} from '@components/mediaEditor/native/videoQualityPolicy';
import createNativeVideoSession from '@components/mediaEditor/native/nativeVideoSession';
import {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import {getAppWindow} from '@helpers/appWindow';
import {createComponent} from 'solid-js';
import createAndroidShapePreference from '@components/mediaEditor/native/androidShapePreference';
import type {DesktopExpandedCrop} from '@components/mediaEditor/native/desktopExpandedCrop';
import {desktopCropIntegrationReady, hasUnsupportedDesktopCropLayers} from '@components/mediaEditor/native/desktopCropAvailability';
import {desktopCropSource} from '@components/mediaEditor/native/desktopCropSource';
import type {AndroidPaintDocument} from '@components/mediaEditor/native/androidPaintDocument';
import createAndroidPaintSession from '@components/mediaEditor/native/androidPaintSession';
import {androidPaintIntegrationReady} from '@components/mediaEditor/native/androidPaintAvailability';
import {isDesktopShape} from '@components/mediaEditor/native/desktopShapeGeometry';
import {DesktopPlacementIntent, isDesktopPlacementHistory, isDesktopPlacementLayer} from '@components/mediaEditor/native/desktopPlacementHistory';
import selectResizableLayer from '@components/mediaEditor/selectResizableLayer';


type EditingMediaStateWithoutHistory = {
  scale: number;
  rotation: number;
  translation: NumberPair;
  flip: NumberPair;
  currentImageRatio: number;

  currentVideoTime: number;
  videoCropStart: number;
  videoCropLength: number;
  videoThumbnailPosition: number;
  videoMuted: boolean;
  videoQuality: number;
  nativeVideoQuality?: NativeVideoQualitySelectionV1;
  desktopExpandedCrop?: DesktopExpandedCrop;
  androidPaintDocument?: AndroidPaintDocument;

  adjustments: Record<AdjustmentKey, number> & {native?: NativeAdjustments} & PhotoProcessingPolicy;

  resizableLayers: ResizableLayer[];
  brushDrawnLines: BrushDrawnLine[];
};

export type EditingMediaState = EditingMediaStateWithoutHistory & {
  history: HistoryItem[];
  redoHistory: HistoryItem[];
};

export type KeyofEditingMediaState = ObjectPath<EditingMediaStateWithoutHistory>;

export namespace HistoryItem {
  export const RemoveArrayItem = 'SSBiZWxpZXZlIEkgY2FuIGZseSwgSSBiZWxpZXZlIEkgY2FuIHRvdWNoIHRoZSBza3kh'; // Symbol('Remove'); Symbol cannot be structuredClone :(
}

export type HistoryItem = {
  desktopPlacement?: DesktopPlacementIntent;
  path: KeyofEditingMediaState;
  newValue: any;
  oldValue: any;

  // Resizable layers can change order!
  findBy?: {
    id: any;
  };
};

export type ColoredBrushType = 'pen' | 'brush' | 'neon' | 'arrow';
export type BrushType = ColoredBrushType | 'blur' | 'eraser';

export type MediaEditorState = {
  isReady: boolean;

  pixelRatio: number;
  renderingPayload?: RenderingPayload;

  currentTab: string;
  drawingShape?: {shape: EditorShape; filled: boolean};
  // Account preference, not document state; native 21f7d109 PersistColorPalette.java:68-84,163-169.
  androidFilledShapes: boolean;
  cropTabAnimationProgress: number;

  mediaSize?: NumberPair;
  mediaRatio?: number;
  canvasSize?: NumberPair;
  fixedImageRatioKey?: string;
  finalTransform: FinalTransform;
  // Transient Paint camera only; deliberately absent from EditingMediaState/history/export.
  paintPreviewAffine?: PaintPreviewAffine;

  currentTextLayerInfo: TextLayerInfo;
  selectedResizableLayer?: number;
  editingTextLayer?: number;
  // Desktop text is inserted into history only when its first editing session commits.
  draftTextLayer?: number;
  stickersLayersInfo: Record<number, StickerRenderingInfo>;

  imageCanvas?: HTMLCanvasElement;
  brushCanvas?: HTMLCanvasElement;

  currentBrush: {
    color: string;
    size: number;
    brush: BrushType;
  };
  previewBrushSize?: number;

  resizeHandlesContainer?: HTMLDivElement;

  isAdjusting: boolean;
  previewOriginal?: boolean;
  isMoving: boolean;
  isPlaying: boolean;
};

export enum SetVideoTimeFlags {
  Redraw = 0b001,
  UpdateCursor = 0b010,
  UpdateVideo = 0b100
};

export type EditorOverridableGlobalActions = {
  pushToHistory: (item: HistoryItem) => void;
  updateMediaStateClone: (callback: (state: EditingMediaState) => void) => void;
  redrawBrushes: () => void;
  abortDrawerSlide: () => void;
  resetRotationWheel: () => void;
  setVideoTime: (time: number, flags?: SetVideoTimeFlags) => void;
};

export type MediaEditorActions = EditorOverridableGlobalActions & {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
};


const getDefaultEditingMediaState = (): EditingMediaState => ({
  scale: 1,
  rotation: 0,
  translation: [0, 0],
  flip: [1, 1],
  currentImageRatio: 0,

  currentVideoTime: 0,
  videoCropStart: 0,
  videoCropLength: 1,
  videoThumbnailPosition: 0,
  videoMuted: false,
  videoQuality: 0,

  adjustments: Object.fromEntries(adjustmentsConfig.map(entry => [entry.key, 0])) as Record<AdjustmentKey, number>,

  resizableLayers: [],
  brushDrawnLines: [],

  history: [],
  redoHistory: []
});

const getDefaultMediaEditorState = (): MediaEditorState => ({
  isReady: false,

  pixelRatio: window.devicePixelRatio,
  renderingPayload: undefined,

  currentTab: 'adjustments',
  androidFilledShapes: false,
  cropTabAnimationProgress: 0,

  mediaSize: undefined,
  canvasSize: undefined,
  fixedImageRatioKey: undefined,
  finalTransform: {
    flip: [1, 1],
    rotation: 0,
    scale: 1,
    translation: [0, 0]
  },

  currentTextLayerInfo: structuredClone(textLayerInfoDefaults),
  selectedResizableLayer: undefined,
  editingTextLayer: undefined,
  stickersLayersInfo: {},

  currentBrush: structuredClone(brushDefaults),
  previewBrushSize: undefined,

  resizeHandlesContainer: undefined,

  isAdjusting: false,
  isMoving: false,
  isPlaying: false
});

export type MediaEditorContextValue = {
  readonly desktopCropCandidate?: boolean;
  readonly desktopCropScopeEligible?: boolean;
  readonly canUseDesktopExpandedCrop?: boolean;
  readonly canUseNativePhotoProcessing: boolean;
  managers: AppManagers;

  mediaSrc: string;
  mediaType: MediaType;
  getMediaBlob: () => Promise<Blob | null>;
  canImageResultInGIF: boolean;
  isEditingForAvatar: boolean;
  isEditingForumAvatar: boolean;
  isVideoAvatarMode: boolean;
  dontCreatePreview: boolean;
  imageType?: 'image/jpeg' | 'image/png';
  imageQuality?: number;

  mediaState: Store<EditingMediaState>;
  editorState: Store<MediaEditorState>;
  actions: MediaEditorActions;
  textSessions: ReturnType<typeof createTextSessionBarrier>;
  androidShapePreference: ReturnType<typeof createAndroidShapePreference>;
  nativeVideo?: ReturnType<typeof createNativeVideoSession>;
  nativePaint?: ReturnType<typeof createAndroidPaintSession>;

  canFinish: Accessor<boolean>;
  hasModifications: Accessor<boolean>;

  resizableLayersSeed: number;
};


const MediaEditorContext = createContext<MediaEditorContextValue>();

export function createContextValue(props: MediaEditorProps): MediaEditorContextValue {
  const canUseNativePhotoProcessing = !props.editingMediaState && props.mediaType === 'image' && !props.isEditingForAvatar;
  const mediaStateInit = props.editingMediaState ?
    structuredClone(props.editingMediaState) : // Prevent mutable store being synchronized with the passed object reference
    getDefaultEditingMediaState();

  const mediaStateInitClone = structuredClone(mediaStateInit);


  // Video-avatar mode forces audio off, since profile videos have no sound.
  if(props.isVideoAvatarMode) {
    mediaStateInit.videoMuted = true;
  }

  const mediaState = createMutable(mediaStateInit);
  const editorState = createMutable(getDefaultMediaEditorState());
  const androidShapePreference = createAndroidShapePreference(editorState, props.managers);

  if(!props.isEditingForAvatar) {
    editorState.currentTextLayerInfo.style = 'normal';
    editorState.currentTextLayerInfo.color = editorState.currentBrush.color;
  }

  if(props.initialTab) {
    editorState.currentTab = props.initialTab;
    if(props.initialTab === 'crop') {
      editorState.cropTabAnimationProgress = 1;
    }
  }

  function processHistory(history: HistoryItem[], otherHistory: HistoryItem[]) {
    batch(() => {
      const item = history.pop();
      if(!item) return;
      // Explicit Desktop placement preserves CURRENT selection, not recorded selection.
      // Older shape histories retain their narrower same-target compatibility rule.
      const before = item.oldValue as ResizableLayer, after = item.newValue as ResizableLayer;
      const placement = isDesktopPlacementHistory(props, item) && mediaState.resizableLayers.some(layer =>
        layer.id === item.desktopPlacement.id && layer.type === item.desktopPlacement.type && isDesktopPlacementLayer(props, layer));
      const selected = placement && editorState.selectedResizableLayer !== undefined ? mediaState.resizableLayers.find(layer =>
        layer.id === editorState.selectedResizableLayer && isDesktopPlacementLayer(props, layer)) : undefined;
      const keepShapeSelection = !placement && !props.isEditingForAvatar && item.path.length === 2 && item.path[0] === 'resizableLayers' &&
        before?.type === 'shape' && after?.type === 'shape' && before.id === after.id && item.findBy?.id === before.id &&
        editorState.selectedResizableLayer === before.id && isDesktopShape(before.shapeInfo) && isDesktopShape(after.shapeInfo) &&
        mediaState.resizableLayers.some(layer => layer.id === before.id && layer.type === 'shape' && isDesktopShape(layer.shapeInfo));

      otherHistory.push({
        ...item,
        path: item.path,
        newValue: item.oldValue,
        oldValue: item.newValue
      });

      processHistoryItem(item, mediaState);
      // Undo the first explicit choice to an ABSENT root, not a lingering
      // undefined key. The descriptor is one atomic history item in both directions.
      if(item.path.length === 1 && item.path[0] === 'nativeVideoQuality' && item.oldValue === undefined) {
        delete mediaState.nativeVideoQuality;
      }
      if(item.path.length === 1 && item.path[0] === 'desktopExpandedCrop' && item.oldValue === undefined) {
        delete mediaState.desktopExpandedCrop;
      }
      if(item.path.length === 1 && item.path[0] === 'androidPaintDocument' && item.oldValue === undefined) {
        delete mediaState.androidPaintDocument;
      }

      if(selected) {
        // Replay replaces A's snapshot; B is untouched. Neither selection enters editing or takes focus.
        selectResizableLayer(editorState, mediaState.resizableLayers.find(layer => layer.id === selected.id));
      } else if(!keepShapeSelection) editorState.selectedResizableLayer = undefined;
      editorState.editingTextLayer = undefined;
    });
  }

  const textSessions = createTextSessionBarrier();
  let historyPending: Promise<void>;
  const historyStep = (undo: boolean) => {
    if(historyPending) return;
    if(undo && context.nativePaint?.undoDraft()) return;
    context.nativePaint?.cancel();
    const work = textSessions.afterFinish(() => {
      textSessions.cancel();
      processHistory(undo ? mediaState.history : mediaState.redoHistory, undo ? mediaState.redoHistory : mediaState.history);
    });
    if(work) {
      historyPending = work.finally(() => { historyPending = undefined; });
      // Expose failures to callers of the actions as well as the editable's error UI.
      return historyPending;
    }
  };
  const actions: MediaEditorActions = {
    undo: () => historyStep(true),
    redo: () => historyStep(false),
    pushToHistory: (item: HistoryItem) => {
      modifyMutable(mediaState, produce(({history, redoHistory}) => {
        history.push(item);
        redoHistory.length && redoHistory.splice(0, Infinity);
      }));
    },
    updateMediaStateClone: (callback) => {
      callback(mediaStateInitClone);
    },
    redrawBrushes: () => {},
    abortDrawerSlide: () => {},
    resetRotationWheel: () => {},
    setVideoTime: () => {}
  };

  const [hasModifications, setHasModifications] = createSignal(false);

  const keysToExcept = ['history', 'redoHistory', 'currentVideoTime'] satisfies (keyof EditingMediaState)[];

  const throttledUpdateHasModifications = throttle(() => {
    setHasModifications(
      !approximateDeepEqual(
        exceptKeys(mediaStateInitClone, keysToExcept),
        exceptKeys(mediaState, keysToExcept)
      )
    );
  }, 200, false);

  createEffect(on(() => traverseObjectDeep(exceptKeys(mediaState, keysToExcept)), () => {
    throttledUpdateHasModifications();
  }));

  // (window as any).mediaState = mediaState;
  // (window as any).unwrap = unwrap;

  const context: MediaEditorContextValue = {
    // Keep the unfinished controller inaccessible until preview/export/lifecycle
    // verification is complete. This is not a user-facing experimental switch.
    desktopCropScopeEligible: props.mediaType === 'image' && !props.isEditingForAvatar &&
      (Object.prototype.hasOwnProperty.call(mediaStateInit, 'desktopExpandedCrop') ||
        !props.editingMediaState && getAppWindow().innerWidth > 800),
    get desktopCropCandidate() {
      return desktopCropIntegrationReady && this.desktopCropScopeEligible;
    },
    get canUseDesktopExpandedCrop() {
      const facts = desktopCropSource(this).facts();
      return this.desktopCropCandidate && this.desktopCropScopeEligible && !!facts && facts.mediaSrc === this.mediaSrc &&
        this.mediaType === 'image' && !this.isEditingForAvatar &&
        !hasUnsupportedDesktopCropLayers(this.mediaState.resizableLayers);
    },
    canUseNativePhotoProcessing,
    managers: props.managers,

    mediaSrc: props.mediaSrc,
    mediaType: props.mediaType,
    getMediaBlob: props.getMediaBlob,
    canImageResultInGIF: props.canImageResultInGIF || false,
    isEditingForAvatar: props.isEditingForAvatar || false,
    isEditingForumAvatar: props.isEditingForumAvatar || false,
    isVideoAvatarMode: props.isVideoAvatarMode || false,
    dontCreatePreview: props.dontCreatePreview || false,
    imageType: props.imageType,
    imageQuality: props.imageQuality,

    mediaState,
    editorState,
    actions,
    textSessions,
    androidShapePreference,

    canFinish: createMemo(() => props.canFinishWithoutChanges || hasModifications()),
    hasModifications,

    // [0-1] make sure it's different even after reopening the editor, note that there might be some items in history!
    resizableLayersSeed: Math.random()
  };
  const newAndroidPaint = androidPaintIntegrationReady && !props.editingMediaState && props.mediaType === 'image' &&
    !props.isEditingForAvatar && !props.isVideoAvatarMode && getAppWindow().innerWidth <= 800;
  if(newAndroidPaint || Object.prototype.hasOwnProperty.call(mediaStateInit, 'androidPaintDocument')) {
    context.nativePaint = createAndroidPaintSession(context, newAndroidPaint);
  }
  const nativeVideoEligible = props.mediaType === 'video' && !props.isEditingForAvatar && !props.isVideoAvatarMode &&
    (!props.editingMediaState || props.editingMediaState.nativeVideoQuality !== undefined);
  if(nativeVideoEligible) {
    // Capture once at creation. A saved descriptor always owns its style, even
    // when reopened in a different shell. Export never consults viewport width.
    const style = mediaState.nativeVideoQuality?.nativeStyle ?? (getAppWindow().innerWidth <= 800 ? 'android' : 'desktop');
    createComponent(MediaEditorContext.Provider, {
      value: context,
      get children(): undefined {
        context.nativeVideo = createNativeVideoSession(context, style, useCropOffset());
        return undefined;
      }
    });
  }
  return context;
}

export const useMediaEditorContext = () => useContext(MediaEditorContext);

export default MediaEditorContext;
