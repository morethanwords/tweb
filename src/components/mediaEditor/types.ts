import {Document} from '@layer';
import type {StaticImageLayerPayloadV1} from '@components/mediaEditor/imageLayer/source';

export type NumberPair = [number, number];

export type MediaType = 'image' | 'video';

export type AndroidEditorStage = 'preview' | 'crop' | 'adjustments' | 'paint';
export type AndroidAdjustmentMode = 'settings' | 'blur' | 'curves';

type ResizableLayerBase = {
  id: number;
  position: NumberPair;
  rotation: number;
  scale: number;

  // Creation-time object action contract, not a rendering/export profile.
  desktopActions?: {version: number};

  sticker?: Document.document;
  // Reflection in the sticker's local horizontal axis, before its rotation.
  stickerFlip?: boolean;
  shapeInfo?: ShapeLayerInfo;

  textInfo?: TextLayerInfo;
  textRenderingInfo?: TextRenderingInfo;
};

/** Source pixels stay in image.width/height; these are the initial source-space frame. */
export type ImageLayerInfo = {
  type: 'image';
  image: StaticImageLayerPayloadV1;
  displayWidth: number;
  displayHeight: number;
  // Creation-time Desktop placement contract; absent/unknown versions stay legacy.
  imageReflection?: {version: number; horizontal: boolean};
};

export type ResizableLayer = ResizableLayerBase & ({type: 'text' | 'sticker' | 'shape'} | ImageLayerInfo);

export type EditorShape = 'circle' | 'rectangle' | 'star' | 'bubble' | 'arrow';

export type ShapeLayerInfo = {
  shape: EditorShape;
  // Missing means the original shared geometry, including on saved Desktop shapes.
  geometryVersion?: 'desktop-v1' | 'desktop-arrow-v1';
  // Normalized local curvature, interpreted only by desktop-arrow-v1.
  bend?: number;
  // Local horizontal reflection, interpreted only by versioned Desktop geometry.
  shapeFlip?: boolean;
  filled: boolean;
  color: string;
  // Dimensions and stroke width are in source-image pixels, like brush lines.
  width: number;
  height: number;
  strokeWidth: number;
};

export type TextRenderingInfo = {
  width: number;
  height: number;

  path?: (number | string)[];
  lines: TextRenderingInfoLine[];
};

export type StickerRenderingInfo = {
  container?: HTMLDivElement;
};

export type TextRenderingInfoLine = {
  left: number;
  right: number;
  height: number;
  content: string;
};

// Saved documents retain the original eight faces, independently of the native catalogs.
export type LegacyFontKey = 'roboto' | 'suez' | 'bubbles' | 'playwrite' | 'chewy' | 'courier' | 'fugaz' | 'sedan';
export type AndroidFontKey = 'android-roboto' | 'android-italic' | 'android-serif' | 'android-condensed' | 'android-mono' | 'android-merriweather';
export type DesktopFontKey = 'desktop-default' | 'desktop-italic' | 'desktop-serif' | 'desktop-condensed' | 'desktop-monospace';
export type FontKey = LegacyFontKey | AndroidFontKey | DesktopFontKey;

export type TextLayerInfo = {
  color: string;
  alignment: string;
  style: string;
  size: number;
  font: FontKey;
};

export type ResizableLayerProps = {
  layer: ResizableLayer;
};

export type FontInfo = {
  fontFamily: string;
  fontWeight: number;
  fontStyle?: 'normal' | 'italic';
  // Qt's requested percentage, not a promise that a browser can stretch this face.
  fontStretch?: number;
  baseline: number;
};
