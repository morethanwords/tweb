/** Geometry only; not an encoder, audio, bitrate, default-selection or persistence policy.
 * Desktop a532622be61ffb811c34311583c9fd4828786833:
 * editor/video/video_editor_quality.cpp:16–43, media/media_video_encode.cpp:1803–1816.
 * Android 21f7d109: ui/PhotoViewer.java:21449–21483,21753–21763 and
 * ui/Components/VideoCompressButton.java:63–95.
 * No dependency on the legacy videoQuality field (an output HEIGHT), or viewport.
 */
export type VideoQualitySize = readonly [width: number, height: number];

export type NativeVideoQualitySelectionV1 = {
  version: 1;
  nativeStyle: 'desktop';
  shorterSide: number; // 0 is Original, never an unset/default sentinel.
} | {
  version: 1;
  nativeStyle: 'android';
  compressionIndex: number;
};

export type NativeVideoQualityChoiceV1 = {
  selection: NativeVideoQualitySelectionV1;
  resolution: VideoQualitySize;
  label: {kind: 'original'} | {kind: 'desktop'; text: string} | {
    kind: 'android';
    badge: 'HD' | 'SD';
    size: string;
  };
};

const desktopShorterSides = [360, 480, 720, 1080];
const androidLongerSides = [480, 854, 1280, 1920];
const androidBadgeSizes = [144, 240, 360, 480, 720, 1080, 1440, 2160];

function isValidSize(size: VideoQualitySize) {
  // Native inputs are integer pixel sizes. Reject unknown/invalid metadata rather
  // than guessing a source size or allowing NaN to become a selectable quality.
  return size?.length === 2 && size.every(side => Number.isInteger(side) && side > 0 && side <= 2147483647);
}

export function roundDesktopVideoDimensionV1(value: number) {
  const rounded = Math.round(value);
  return Math.max(rounded - rounded % 2, 2);
}

/** Caller supplies source-pixel crop dimensions AFTER orientation, not a preview
 * box or the legacy getResultSize's already codec-capped dimensions. Original's
 * choice resolution is verbatim, as in VideoQualityLevels (even if odd-sized).
 */
export function getDesktopVideoQualityChoicesV1(editedSize: VideoQualitySize): NativeVideoQualityChoiceV1[] {
  if(!isValidSize(editedSize)) return [];
  const [width, height] = editedSize;
  const shorter = Math.min(width, height);
  const choices: NativeVideoQualityChoiceV1[] = [];
  for(const shorterSide of desktopShorterSides) {
    if(shorterSide >= shorter) break;
    const scale = shorterSide / shorter;
    choices.push({
      selection: {version: 1, nativeStyle: 'desktop', shorterSide},
      resolution: [roundDesktopVideoDimensionV1(width * scale), roundDesktopVideoDimensionV1(height * scale)],
      label: {kind: 'desktop', text: `${shorterSide}p`}
    });
  }
  choices.push({
    selection: {version: 1, nativeStyle: 'desktop', shorterSide: 0},
    resolution: [width, height],
    label: {kind: 'original'}
  });
  return choices;
}

function getAndroidResolutionV1(sourceSize: VideoQualitySize, compressionIndex: number, count: number): VideoQualitySize {
  if(count === 1) return [...sourceSize];
  const [sourceWidth, sourceHeight] = sourceSize;
  // Java uses float, including the multiplication before Math.round(float).
  const scale = Math.fround(androidLongerSides[compressionIndex] / Math.fround(Math.max(sourceWidth, sourceHeight)));
  const keepSource = compressionIndex === count - 1 && scale >= 1;
  let width = keepSource ? sourceWidth : Math.round(Math.fround(Math.fround(sourceWidth) * scale) / 2) * 2;
  const height = keepSource ? sourceHeight : Math.round(Math.fround(Math.fround(sourceHeight) * scale) / 2) * 2;
  // Literal pinned v1 anomaly: BOTH remainders are subtracted from WIDTH.
  // Do not 'fix' to height -= height % 4: that changes portrait/landscape parity.
  if(width % 4 !== 0 || height % 4 !== 0) {
    width -= width % 4;
    width -= height % 4;
  }
  return [width, height];
}

function getAndroidLabel(resolution: VideoQualitySize): NativeVideoQualityChoiceV1['label'] {
  const shorter = Math.min(...resolution);
  let size: number;
  for(let i = androidBadgeSizes.length - 1; i >= 0; --i) {
    if(shorter >= androidBadgeSizes[i]) {
      size = androidBadgeSizes[i];
      break;
    }
  }
  return {
    kind: 'android',
    badge: shorter >= 720 ? 'HD' : 'SD',
    size: size === undefined ? '' : size === 1440 ? '2K' : size === 2160 ? '4K' : `${size}`
  };
}

/** Source dimensions BEFORE crop. These are PhotoViewer compression sizes, NOT
 * final cropped encoder dimensions. Android applies its crop downstream; it has
 * no Desktop-style Original choice, nor numeric p labels on its chooser dots.
 * Tiny inputs may expose the pinned algorithm's zero/negative result: this
 * helper preserves source arithmetic, not a promise of encoder support.
 */
export function getAndroidVideoQualityChoicesV1(sourceSize: VideoQualitySize): NativeVideoQualityChoiceV1[] {
  if(!isValidSize(sourceSize)) return [];
  const longer = Math.max(...sourceSize);
  const count = longer > 1280 ? 4 : longer > 854 ? 3 : longer > 640 ? 2 : 1;
  return Array.from({length: count}, (_, compressionIndex) => {
    const resolution = getAndroidResolutionV1(sourceSize, compressionIndex, count);
    return {
      selection: {version: 1, nativeStyle: 'android', compressionIndex},
      resolution,
      label: getAndroidLabel(resolution)
    };
  });
}

/** Explicit descriptor only: never reinterpret an old numeric output height.
 * A removed choice/unsupported version resolves to undefined, not a new default.
 * Desktop returns edited size; Android returns PRE-CROP compression size only.
 */
export function resolveNativeVideoQualityV1(selection: NativeVideoQualitySelectionV1, geometry: {
  sourceSize: VideoQualitySize;
  editedSize: VideoQualitySize;
}): VideoQualitySize | undefined {
  if(selection?.version !== 1) return;
  if(selection.nativeStyle === 'desktop') {
    return getDesktopVideoQualityChoicesV1(geometry.editedSize).find(choice =>
      choice.selection.nativeStyle === 'desktop' && choice.selection.shorterSide === selection.shorterSide
    )?.resolution;
  }
  if(selection.nativeStyle === 'android') {
    return getAndroidVideoQualityChoicesV1(geometry.sourceSize).find(choice =>
      choice.selection.nativeStyle === 'android' && choice.selection.compressionIndex === selection.compressionIndex
    )?.resolution;
  }
}
