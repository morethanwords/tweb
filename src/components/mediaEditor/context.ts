import {Accessor, createContext, createMemo, createSignal, Signal, useContext} from 'solid-js';
import {createMutable, Store} from 'solid-js/store';

import {AppManagers} from '../../lib/appManagers/managers';

import {NumberPair, ResizableLayer, StickerRenderingInfo, TextLayerInfo, TextRenderingInfo} from './types';
import {AdjustmentKey, adjustmentsConfig} from './adjustments';
import {FinalTransform} from './canvas/useFinalTransform';
import {BrushDrawnLine} from './canvas/brushPainter';
import type {MediaEditorProps} from './mediaEditor';
import {RenderingPayload} from './webgl/initWebGL';
import {approximateDeepEqual} from './utils';


export type EditingMediaState = {
  scale: number;
  rotation: number;
  translation: NumberPair;
  flip: NumberPair;

  adjustments: Record<AdjustmentKey, number>;

  resizableLayers: ResizableLayer[];
  brushDrawnLines: BrushDrawnLine[];

  history: HistoryItem[];
  redoHistory: HistoryItem[];
};

export type MediaEditorState = {
  isReady: boolean;

  pixelRatio: number;
  renderingPayload?: RenderingPayload;

  currentTab: string;

  imageSize?: NumberPair;
  canvasSize?: NumberPair;
  currentImageRatio: number;
  fixedImageRatioKey?: string;
  finalTransform: FinalTransform;

  currentTextLayerInfo: TextLayerInfo;
  selectedResizableLayer?: number;
  textLayersInfo: Record<number, TextRenderingInfo>;
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
  redrawBrushes: () => void;
  abortDrawerSlide: () => void;
  resetRotationWheel: () => void;
};


const getDefaultEditingMediaState = (): EditingMediaState => ({
  scale: 1,
  rotation: 0,
  translation: [0, 0],
  flip: [1, 1],

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
  currentImageRatio: 0,
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
  textLayersInfo: {},
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
  imageSrc: string;

  mediaState: Store<EditingMediaState>;
  editorState: Store<MediaEditorState>;
  actions: EditorOverridableGlobalActions;

  hasModifications: Accessor<boolean>;

  resizableLayersSeed: number;

  gifCreationProgress: Signal<number>;
};

export namespace HistoryItem {
  export const Remove = Symbol('Remove');
}

export type HistoryItem = {
  path: (keyof any)[];
  newValue: any;
  oldValue: any;
};

const MediaEditorContext = createContext<MediaEditorContextValue>();

export function createContextValue(props: MediaEditorProps): MediaEditorContextValue {
  const mediaStateInit = props.editingMediaState || getDefaultEditingMediaState()
  const mediaState = createMutable(mediaStateInit);
  const editorState = createMutable(getDefaultMediaEditorState());

  const actions = {
    redrawBrushes: () => {},
    abortDrawerSlide: () => {},
    resetRotationWheel: () => {}
  };

  const hasModifications = createMemo(() => !approximateDeepEqual(mediaStateInit, mediaState));

  return {
    managers: props.managers,
    imageSrc: props.imageURL,

    mediaState,
    editorState,
    actions,

    hasModifications,

    resizableLayersSeed: 1,

    gifCreationProgress: createSignal(0)
  };
}

export const useMediaEditorContext = () => useContext(MediaEditorContext);

export default MediaEditorContext;
