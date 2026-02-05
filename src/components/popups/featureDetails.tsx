import {createSignal, For, JSX} from 'solid-js';
import PopupElement from '@components/popups/indexTsx';
import Row from '@components/rowTsx';
import {createPopup} from '@components/popups/indexTsx';
import styles from '@components/popups/featureDetails.module.scss';
import classNames from '@helpers/string/classNames';
import StickerAndTitle, {StickerAndTitleProps} from '@components/stickerAndTitle';

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
  rows: FeatureDetailsRow[],
  buttons: FeatureDetailsButton[],
  onClose?: () => void
} & StickerAndTitleProps;

export default function showFeatureDetailsPopup(props: FeatureDetailsPopupProps) {
  const [show, setShow] = createSignal(false);
  const close = () => setShow(false);

  createPopup(() => (
    <PopupElement
      class={styles.popup}
      containerClass={styles.popupContainer}
      show={show()}
      onClose={props.onClose}
    >
      <PopupElement.Header class={styles.popupHeader}>
        <PopupElement.CloseButton class={styles.popupCloseButton} />
      </PopupElement.Header>
      <PopupElement.Body>
        <StickerAndTitle {...props} onReady={() => setShow(true)} />
        <For each={props.rows}>{({icon, title, subtitle}) => (
          <Row class={styles.row}>
            <Row.Icon class={classNames('primary', styles.rowIcon)} icon={icon} />
            <Row.Title class="text-bold">{title}</Row.Title>
            <Row.Subtitle class={styles.rowSubtitle}>{subtitle}</Row.Subtitle>
          </Row>
        )}</For>
      </PopupElement.Body>
      <PopupElement.Footer class={styles.popupFooter}>
        <For each={props.buttons}>{(button) => (
          <PopupElement.FooterButton
            callback={button.onClick ? () => button.onClick?.(close) : close}
            cancel={button.isCancel}
            secondary={button.isSecondary}
          >
            {button.text}
          </PopupElement.FooterButton>
        )}</For>
      </PopupElement.Footer>
    </PopupElement>
  ));
}
