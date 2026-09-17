import {createSignal, For, JSX, Show} from 'solid-js';
import PopupElement from '@components/popups/indexTsx';
import FeatureRows, {FeatureRow} from '@components/featureRows';
import {createPopup} from '@components/popups/indexTsx';
import styles from '@components/popups/featureDetails.module.scss';
import MediaHeader, {MediaHeaderStickerProps} from '@components/mediaHeader';

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
  rows: FeatureRow[],
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
      show={show()}
      onClose={props.onClose}
      old
    >
      <PopupElement.Header floating>
        <PopupElement.CloseButton />
      </PopupElement.Header>
      <PopupElement.Body class={styles.popupBody}>
        <MediaHeader>
          <MediaHeader.Sticker {...props.sticker} onReady={() => setShow(true)} />
          <Show when={props.title}>
            <MediaHeader.Title>{props.title}</MediaHeader.Title>
          </Show>
          <Show when={props.subtitle}>
            <MediaHeader.Subtitle color={props.subtitleSecondary ? 'secondary' : undefined}>{props.subtitle}</MediaHeader.Subtitle>
          </Show>
        </MediaHeader>
        <FeatureRows rows={props.rows} />
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
      <PopupElement.Footer>
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
