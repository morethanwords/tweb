import {JSX, Show} from 'solid-js';
import {StickerSet} from '@layer';
import LazyLoadQueue from '@components/lazyLoadQueue';
import RadioFieldTsx from '@components/radioFieldTsx';
import wrapStickerSetThumb from '@components/wrappers/stickerSetThumb';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import styles from '@components/stickerSetRow.module.scss';

const THUMB_SIZE = 36;

/**
 * A sticker set as a row of a tab's list — its thumb, title and count — with a radio to choose it or an
 * action (a button) of its own at the end
 */
export default function StickerSetRow(props: {
  set: StickerSet.stickerSet,
  isEmoji: boolean,
  lazyLoadQueue: LazyLoadQueue,
  action?: () => JSX.Element,
  radioChecked?: boolean,
  radioName?: string,
  radioValue?: string,
  onRadioChange?: (checked: boolean) => void,
  onClick?: () => void
}) {
  const [tab] = useSuperTab();
  const {Row, i18n, wrapEmojiText} = useHotReloadGuard();

  const thumb = document.createElement('div');
  wrapStickerSetThumb({
    set: props.set,
    container: thumb,
    group: 'GENERAL-SETTINGS',
    lazyLoadQueue: props.lazyLoadQueue,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    autoplay: true,
    middleware: tab.middlewareHelper.get()
  });

  return (
    <Row
      class={styles.setRow}
      clickable={props.radioName ? undefined : props.onClick}
    >
      <Show when={props.radioName}>
        <Row.RadioField>
          <RadioFieldTsx
            alignRight
            class="disable-hover"
            checked={props.radioChecked}
            name={props.radioName}
            value={props.radioValue}
            onChange={props.onRadioChange}
          />
        </Row.RadioField>
      </Show>
      <Row.Media>{thumb}</Row.Media>
      <Row.Title>{wrapEmojiText(props.set.title)}</Row.Title>
      <Row.Subtitle>{i18n(props.isEmoji ? 'EmojiCount' : 'Stickers', [props.set.count])}</Row.Subtitle>
      <Show when={props.action}>
        <Row.RightContent
          class={styles.setAction}
          onClick={(event) => event.stopPropagation()}
        >
          {props.action()}
        </Row.RightContent>
      </Show>
    </Row>
  );
}
