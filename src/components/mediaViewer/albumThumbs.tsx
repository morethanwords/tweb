import {Accessor, createMemo, createSignal, For, onCleanup, Show} from 'solid-js';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyPhoto} from '@appManagers/appPhotosManager';
import type {MyMessage} from '@appManagers/appMessagesManager';
import type {Message, PhotoSize} from '@layer';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import PhotoTsx from '@components/wrappers/photoTsx';
import VideoTsx from '@components/wrappers/videoTsx';
import A11yButton from '@components/a11yButton';
import mediaSizes from '@helpers/mediaSizes';
import windowSize from '@helpers/windowSize';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import styles from '@components/mediaViewer/albumThumbs.module.scss';

export const ALBUM_THUMBS_CLASSNAME = 'media-viewer-album-thumbs';

export type AlbumThumbItem = {
  key: string,
  media: MyPhoto | MyDocument,
  message: MyMessage
};

type Sizes = {
  // * the height of every thumb, the width of one that is not current, and the most the current one can take
  height: number,
  width: number,
  maxWidth: number,
  // * between two thumbs, and on either side of the current one
  gap: number,
  gapCurrent: number,
  // * the strip's own height, padding included: the viewer keeps that much free under the media
  box: number
};

// * tdesktop's GroupThumbs (80px thumbs, 56 wide, up to 160 for the current one, 6px apart and 15px around
// * the current one), brought to the web viewer's scale; handhelds get iOS's denser strip
const DESKTOP: Sizes = {height: 48, width: 34, maxWidth: 96, gap: 4, gapCurrent: 10, box: 72};
const MOBILE: Sizes = {height: 36, width: 24, maxWidth: 72, gap: 2, gapCurrent: 8, box: 52};

export function getAlbumThumbsHeight() {
  return (mediaSizes.isMobile ? MOBILE : DESKTOP).box;
}

function getMediaAspect(media: MyPhoto | MyDocument, size: PhotoSize) {
  const {w, h} = media._ === 'document' && media.w && media.h ? media : size as PhotoSize.photoSize;
  return w && h ? w / h : 1;
}

/**
 * The album's thumbnails under the media: the current one wide, centered, the others narrow slices of
 * theirs; a click on one opens it. Switching slides the row and widens the new current thumb at once.
 */
export default function AlbumThumbs(props: {
  items: Accessor<AlbumThumbItem[]>,
  current: Accessor<number>,
  onSelect: (index: number) => void
}) {
  const [isMobile, setIsMobile] = createSignal(mediaSizes.isMobile);
  const onScreenChange = () => setIsMobile(mediaSizes.isMobile);
  mediaSizes.addEventListener('changeScreen', onScreenChange);
  onCleanup(() => mediaSizes.removeEventListener('changeScreen', onScreenChange));

  const sizes = () => isMobile() ? MOBILE : DESKTOP;

  const thumbs = createMemo(() => {
    const {height, maxWidth} = sizes();
    return props.items().map((item) => {
      const size = choosePhotoSize(item.media, maxWidth, height);
      return {
        size,
        // * how wide the thumb is when it is current: its own shape, kept within the bounds
        fullWidth: Math.round(height * getMediaAspect(item.media, size))
      };
    });
  });

  const layout = createMemo(() => {
    const {width, maxWidth, gap, gapCurrent} = sizes();
    const current = props.current();
    const widths = thumbs().map((thumb, index) => {
      return index === current ? Math.min(maxWidth, Math.max(width, thumb.fullWidth)) : width;
    });
    const getGap = (index: number) => index === current || index + 1 === current ? gapCurrent : gap;

    const lefts: number[] = new Array(widths.length);
    lefts[current] = -widths[current] / 2;
    for(let i = current - 1; i >= 0; --i) {
      lefts[i] = lefts[i + 1] - getGap(i) - widths[i];
    }

    for(let i = current + 1; i < widths.length; ++i) {
      lefts[i] = lefts[i - 1] + widths[i - 1] + getGap(i - 1);
    }

    return {widths, lefts};
  });

  // * like tdesktop, only the thumbs that fit on the screen: an Instant View page can carry dozens
  const visible = createMemo(() => {
    const {width, maxWidth, gap, gapCurrent} = sizes();
    const perSide = Math.max(1, Math.ceil((windowSize.width / 2 - maxWidth / 2 - gapCurrent) / (width + gap)));
    const current = props.current();
    return props.items().filter((_, index) => Math.abs(index - current) <= perSide);
  });
  const indexes = createMemo(() => new Map(props.items().map((item, index) => [item, index])));

  // * one native listener: a click on an image that reaches the viewer closes it
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if(!button) {
      return;
    }

    const index = +button.dataset.index;
    if(index !== props.current()) {
      props.onSelect(index);
    }
  };

  return (
    <Show when={props.items().length > 1}>
      <div
        class={styles.strip}
        style={{
          'height': `${sizes().box}px`,
          '--thumb-height': `${sizes().height}px`
        }}
        role="group"
        aria-label={I18n.format('AttachAlbum', true)}
        on:click={onClick}
      >
        <div class={styles.track}>
          <For each={visible()}>
            {(item) => {
              const index = () => indexes().get(item);
              const isCurrent = () => index() === props.current();
              // * an image sent as a file is drawn as a photo
              const isVideo = item.media._ === 'document' && (
                (['video', 'gif'] as MyDocument['type'][]).includes(item.media.type) ||
                !!item.media.mime_type?.startsWith('video/')
              );
              return (
                <A11yButton
                  class={classNames(styles.thumb, isCurrent() && styles.isCurrent)}
                  style={{
                    'width': `${layout().widths[index()]}px`,
                    // * the offset runs from the inline start: later thumbs lie to the left in a right-to-left layout
                    'transform': `translateX(calc(${layout().lefts[index()]}px * var(--reflect)))`
                  }}
                  data-index={index()}
                  aria-current={isCurrent() ? 'true' : undefined}
                  aria-label={
                    I18n.format(isVideo ? 'AttachVideo' : 'AttachPhoto', true) + ', ' +
                    I18n.format('Of', true, [index() + 1, props.items().length])
                  }
                >
                  {isVideo ? (
                    <VideoTsx
                      class={styles.media}
                      doc={item.media as MyDocument}
                      message={item.message as Message.message}
                      boxWidth={0}
                      boxHeight={0}
                      onlyPreview
                      withoutPreloader
                      noPlayButton
                      photoSize={thumbs()[index()]?.size}
                    />
                  ) : (
                    <PhotoTsx
                      class={styles.media}
                      photo={item.media}
                      message={item.message}
                      boxWidth={0}
                      boxHeight={0}
                      withoutPreloader
                      noBlur
                      size={thumbs()[index()]?.size}
                    />
                  )}
                </A11yButton>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
}
