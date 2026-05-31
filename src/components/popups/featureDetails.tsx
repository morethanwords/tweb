import {createSignal, For, JSX, Show} from 'solid-js';
import PopupElement from '@components/popups/indexTsx';
import Row from '@components/rowTsx';
import {createPopup} from '@components/popups/indexTsx';
import styles from '@components/popups/featureDetails.module.scss';
import classNames from '@helpers/string/classNames';
import MediaHeader, {MediaHeaderStickerProps} from '@components/mediaHeader';

interface FeatureDetailsRow {
  icon: Icon;
  title: JSX.Element;
  subtitle: JSX.Element;
}

export interface FeatureDetailsButton {
  text: JSX.Element;
  onClick?: (close: () => void) => MaybePromise<boolean | void>;
  isCancel?: boolean;
  isSecondary?: boolean;
}

type FeatureDetailsPopupProps = {
  sticker: Omit<MediaHeaderStickerProps, 'onReady'>,
  title?: JSX.Element,
  subtitle?: JSX.Element,
  subtitleSecondary?: boolean,
  rows: FeatureDetailsRow[],
  caption?: {
    title?: JSX.Element,
    subtitle?: JSX.Element
  },
  buttons: FeatureDetailsButton[],
  onClose?: () => void
};

export default function showFeatureDetailsPopup(props: FeatureDetailsPopupProps) {
  const [show, setShow] = createSignal(false);
  const close = () => setShow(false);

  createPopup(() => (
    <PopupElement
      class={styles.popup}
      containerClass={styles.popupContainer}
      show={show()}
      onClose={props.onClose}
      old
    >
      <PopupElement.Header class={styles.popupHeader}>
        <PopupElement.CloseButton class={styles.popupCloseButton} />
      </PopupElement.Header>
      <PopupElement.Body>
        <MediaHeader>
          <MediaHeader.Sticker {...props.sticker} onReady={() => setShow(true)} />
          <Show when={props.title}>
            <MediaHeader.Title>{props.title}</MediaHeader.Title>
          </Show>
          <Show when={props.subtitle}>
            <MediaHeader.Subtitle secondary={props.subtitleSecondary}>{props.subtitle}</MediaHeader.Subtitle>
          </Show>
        </MediaHeader>
        <For each={props.rows}>{({icon, title, subtitle}) => (
          <Row class={styles.row}>
            <Row.Icon class={classNames('primary', styles.rowIcon)} icon={icon} />
            <Row.Title class="text-bold">{title}</Row.Title>
            <Row.Subtitle class={styles.rowSubtitle}>{subtitle}</Row.Subtitle>
          </Row>
        )}</For>
        <Show when={props.caption}>
          <div class={styles.caption}>
            <Show when={props.caption.title}>
              <div class={styles.captionTitle}>{props.caption.title}</div>
            </Show>
            <Show when={props.caption.subtitle}>
              <div class={styles.captionSubtitle}>{props.caption.subtitle}</div>
            </Show>
          </div>
        </Show>
      </PopupElement.Body>
      <PopupElement.Footer class={styles.popupFooter}>
        <For each={props.buttons}>{(button) => (
          <PopupElement.FooterButton
            callback={button.onClick ? () => button.onClick?.(close) : close}
            cancel={button.isCancel}
            color={button.isSecondary ? 'secondary' : undefined}
          >
            {button.text}
          </PopupElement.FooterButton>
        )}</For>
      </PopupElement.Footer>
    </PopupElement>
  ));

  return close;
}
