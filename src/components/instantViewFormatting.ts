import classNames from '@helpers/string/classNames';
import styles from '@components/instantViewStyles';
import type {ButtonBackground, ButtonRowAlign} from '@components/wrappers/buttonTypes';

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

/** How a layer 229 button looks wherever it is drawn: page, bubble, composer, the button's box. */
export function getPageButtonClasses(background?: ButtonBackground, link?: boolean) {
  return [
    styles.PageButton,
    background && styles[`PageButton-${background}`],
    !background && link && styles.PageButtonLink
  ];
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
