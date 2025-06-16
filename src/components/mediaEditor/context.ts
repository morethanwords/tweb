import {Accessor, createContext, createMemo, createSignal, Signal, useContext} from 'solid-js';
import {createMutable, modifyMutable, produce, Store} from 'solid-js/store';

import exceptKeys from '../../helpers/object/exceptKeys';
import type {AppManagers} from '../../lib/appManagers/managers';
import type {ObjectPath} from '../../types';

import {AdjustmentKey, adjustmentsConfig} from './adjustments';
import {BrushDrawnLine} from './canvas/brushPainter';
import {FinalTransform} from './canvas/useFinalTransform';
import type {MediaEditorProps} from './mediaEditor';
import {MediaType, NumberPair, ResizableLayer, StickerRenderingInfo, TextLayerInfo} from './types';
import {approximateDeepEqual} from './utils';
import {RenderingPayload} from './webgl/initWebGL';


type EditingMediaStateWithoutHistory = {
  scale: number;
  rotation: number;
  translation: NumberPair;
  flip: NumberPair;
  currentImageRatio: number;

  adjustments: Record<AdjustmentKey, number>;

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
  path: KeyofEditingMediaState;
  newValue: any;
  oldValue: any;

  // Resizable layers can change order!
  findBy?: {
    id: any;
  };
};

export type MediaEditorState = {
  isReady: boolean;

  pixelRatio: number;
  renderingPayload?: RenderingPayload;

  currentTab: string;

  imageSize?: NumberPair;
  canvasSize?: NumberPair;
  fixedImageRatioKey?: string;
  finalTransform: FinalTransform;

  currentTextLayerInfo: TextLayerInfo;
  selectedResizableLayer?: number;
  stickersLayersInfo: Record<number, StickerRenderingInfo>;

  imageCanvas?: HTMLCanvasElement;
  currentBrush: {
    color: string;
    size: number;
    brush: string;
  };
  previewBrushSize?: number;

  resizeHandlesContainer?: HTMLDivElement;

  isAdjusting: boolean;
  isMoving: boolean;
};

export type EditorOverridableGlobalActions = {
  pushToHistory: (item: HistoryItem) => void;
  setInitialImageRatio: (ratio: number) => void;
  redrawBrushes: () => void;
  abortDrawerSlide: () => void;
  resetRotationWheel: () => void;
};


const getDefaultEditingMediaState = (): EditingMediaState => ({
  scale: 1,
  rotation: 0,
  translation: [0, 0],
  flip: [1, 1],
  currentImageRatio: 0,

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

  imageSize: undefined,
  canvasSize: undefined,
  fixedImageRatioKey: undefined,
  finalTransform: {
    flip: [1, 1],
    rotation: 0,
    scale: 1,
    translation: [0, 0]
  },

  currentTextLayerInfo: {
    alignment: 'left',
    style: 'outline',
    color: '#ffffff',
    font: 'roboto',
    size: 40
  },
  selectedResizableLayer: undefined,
  stickersLayersInfo: {},

  imageCanvas: undefined,
  currentBrush: {
    brush: 'pen',
    color: '#fe4438',
    size: 18
  },
  previewBrushSize: undefined,

  resizeHandlesContainer: undefined,

  isAdjusting: false,
  isMoving: false
});

export type MediaEditorContextValue = {
  managers: AppManagers;
  mediaSrc: string;
  mediaType: MediaType;

  mediaState: Store<EditingMediaState>;
  editorState: Store<MediaEditorState>;
  actions: EditorOverridableGlobalActions;

  hasModifications: Accessor<boolean>;

  resizableLayersSeed: number;

  gifCreationProgress: Signal<number>;
};


const MediaEditorContext = createContext<MediaEditorContextValue>();

export function createContextValue(props: MediaEditorProps): MediaEditorContextValue {
  const mediaStateInit = props.editingMediaState ?
    structuredClone(props.editingMediaState) : // Prevent mutable store being synchronized with the passed object reference
    getDefaultEditingMediaState();

  const mediaStateInitClone = structuredClone(mediaStateInit);


  const mediaState = createMutable(mediaStateInit);
  const editorState = createMutable(getDefaultMediaEditorState());

  const actions: EditorOverridableGlobalActions = {
    pushToHistory: (item: HistoryItem) => {
      modifyMutable(mediaState, produce(({history, redoHistory}) => {
        history.push(item);
        redoHistory.length && redoHistory.splice(0, Infinity);
      }));
    },
    setInitialImageRatio: (ratio: number) => {
      mediaStateInitClone.currentImageRatio = ratio;
    },
    redrawBrushes: () => {},
    abortDrawerSlide: () => {},
    resetRotationWheel: () => {}
  };

  // TODO: Throttle to save computation power on animations
  const hasModifications = createMemo(() => {
    // log('mediaStateInitClone, mediaState :>> ', mediaStateInitClone, unwrap(mediaState), !approximateDeepEqual(mediaStateInitClone, mediaState));
    return !approximateDeepEqual(
      exceptKeys(mediaStateInitClone, ['history', 'redoHistory']),
      exceptKeys(mediaState, ['history', 'redoHistory'])
    );
  });

  // (window as any).mediaState = mediaState;
  // (window as any).unwrap = unwrap;

  return {
    managers: props.managers,
    mediaSrc: props.objectURL,
    mediaType: props.type,

    mediaState,
    editorState,
    actions,

    hasModifications,

    resizableLayersSeed: Math.random(), // [0-1] make sure it's different even after reopening the editor, note that there might be some items in history!

    gifCreationProgress: createSignal(0)
  };
}

export const useMediaEditorContext = () => useContext(MediaEditorContext);

export default MediaEditorContext;
