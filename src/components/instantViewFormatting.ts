import classNames from '@helpers/string/classNames';
import styles from '@components/instantViewStyles';
import {getButtonTypeIcon, type AnyButtonType, type ButtonBackground, type ButtonRowAlign} from '@components/wrappers/buttonTypes';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import wrapTelegramRichText from '@lib/richTextProcessor/wrapTelegramRichText';
import type {Document, Photo, RichText} from '@layer';

export type InstantViewHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const HEADING_PRESENTATION = {
  1: {tag: 'h1', baseClass: styles.Title, levelClass: styles.HeadingH1},
  2: {tag: 'h2', baseClass: styles.Subtitle, levelClass: styles.HeadingH2},
  3: {tag: 'h3', baseClass: styles.Header, levelClass: styles.HeadingH3},
  4: {tag: 'h4', baseClass: styles.Subheader, levelClass: styles.HeadingH4},
  5: {tag: 'h5', baseClass: styles.Subheader, levelClass: styles.HeadingH5},
  6: {tag: 'h6', baseClass: styles.Subheader, levelClass: styles.HeadingH6}
} as const;

export const instantViewStyles = styles;

/**
 * How a layer 229 button looks wherever it is drawn: page, bubble, composer, the button's box. A
 * button styled as a link looks like any other.
 */
export function getPageButtonClasses(background?: ButtonBackground, label?: RichText) {
  return [
    styles.PageButton,
    styles[`PageButton-${background || 'default'}`],
    label && isPageButtonLabelEmpty(label) && styles.PageButtonEmpty
  ];
}

/**
 * A button with no text to show keeps its place and what it does, but draws no pill. Custom emoji
 * are pictures, not text: a label of nothing but them (a board's pieces and its blank squares — a
 * transparent emoji) is such a button too.
 */
function isPageButtonLabelEmpty(label: RichText) {
  const {text, entities = []} = wrapTelegramRichText(label);
  let rest = '', from = 0;
  entities
  .filter((entity) => entity._ === 'messageEntityCustomEmoji')
  .sort((a, b) => a.offset - b.offset)
  .forEach((entity) => {
    rest += text.slice(from, entity.offset);
    from = Math.max(from, entity.offset + entity.length);
  });
  rest += text.slice(from);
  return !rest.trim();
}

/**
 * The corner icon a button of a row wears for its type — wherever the row is drawn — with the
 * classes that place it and the one that makes room for it beside the label.
 */
export function getPageButtonIcon(type: AnyButtonType | undefined) {
  const icon = type && getButtonTypeIcon(type);
  if(!icon) return;
  return {
    icon,
    iconClasses: [styles.PageButtonIcon, ...(type._ === 'inlineButtonTypeUrl' ? [styles.PageButtonIconLink] : [])],
    buttonClass: styles.PageButtonWithIcon
  };
}

const PAGE_BUTTON_ROW_ALIGN_CLASSES: {[align in ButtonRowAlign]: string} = {
  left: styles.PageButtonRowLeft,
  center: styles.PageButtonRowCenter,
  right: styles.PageButtonRowRight
};

export function getPageButtonRowClasses(align?: ButtonRowAlign) {
  return [styles.PageButtonRow, align && PAGE_BUTTON_ROW_ALIGN_CLASSES[align]];
}
export const INSTANT_VIEW_MEDIA_MAX_HEIGHT = 360;

/** A photo's or a video's own size, which its box is worked out from. */
export function getPageMediaSize(media: Photo.photo | Document.document | undefined): {w: number, h: number} {
  if(media?._ === 'photo') {
    const size = choosePhotoSize(media, 480, 480);
    if(size && 'w' in size && 'h' in size && size.w > 0 && size.h > 0) {
      return {w: size.w, h: size.h};
    }
  } else if(media?._ === 'document') {
    const attribute = media.attributes?.find((candidate) => candidate._ === 'documentAttributeVideo');
    const width = (media as Document.document & {w?: number}).w || (
      attribute?._ === 'documentAttributeVideo' ? attribute.w : 0
    );
    const height = (media as Document.document & {h?: number}).h || (
      attribute?._ === 'documentAttributeVideo' ? attribute.h : 0
    );
    if(width > 0 && height > 0) return {w: width, h: height};
  }
  return {w: 3, h: 2};
}

/**
 * The box a photo or a video on its own is fitted into — on a page, in a bubble, in the composer:
 * a wide one's width, no taller than media goes. Media that does not fill it shows whole, its
 * blurred self filling the sides (`media-container-fitted`).
 */
export function getPageMediaBox(size: {w: number, h: number}) {
  const width = 480;
  return {
    height: Math.min(INSTANT_VIEW_MEDIA_MAX_HEIGHT, width * size.h / size.w),
    width
  };
}

export type InstantViewMediaSize = {
  height: number,
  width: number
};

export function getMaximumHeightMediaSize(
  sizes: readonly InstantViewMediaSize[]
): InstantViewMediaSize | undefined {
  let result: InstantViewMediaSize;
  let maximumRelativeHeight = 0;
  sizes.forEach((size) => {
    if(
      !Number.isFinite(size.width) ||
      size.width <= 0 ||
      !Number.isFinite(size.height) ||
      size.height <= 0
    ) return;
    const relativeHeight = size.height / size.width;
    if(relativeHeight <= maximumRelativeHeight) return;
    maximumRelativeHeight = relativeHeight;
    result = size;
  });
  return result;
}

export function applyInstantViewMediaSize(
  element: HTMLElement,
  width: number,
  height: number,
  paddings = 0
) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 3;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 2;
  element.style.setProperty('--aspect-ratio', `${safeWidth / safeHeight}`);
  element.style.setProperty('--paddings', `${paddings > 2 ? paddings : 0}`);
}

export function getInstantViewHeadingPresentation(
  level: InstantViewHeadingLevel,
  withPadding = true
) {
  const presentation = HEADING_PRESENTATION[level];
  return {
    tag: presentation.tag,
    class: classNames(
      withPadding ? styles.Padding : undefined,
      presentation.baseClass,
      presentation.levelClass,
      'text-bold'
    )
  };
}
