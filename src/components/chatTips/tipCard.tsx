import {createContext, Index, JSX, onCleanup, Show, useContext} from 'solid-js';

import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import classNames from '@helpers/string/classNames';
import type {AppSidebarLeft} from '@components/sidebarLeft';
import type {SliderSuperTabConstructable} from '@components/sliderTab';

import {IconTsx} from '@components/iconTsx';
import RippleElement from '@components/rippleElement';

import styles from '@components/chatTips/chatTips.module.scss';

/**
 * The shared tip-card frame, after the macOS client's `WidgetView` (Telegram-Mac/WidgetView.swift):
 * a fixed-size card holding four slots — title, a row of segmented buttons, the content, and a
 * description pinned to the bottom edge with a link into the matching settings screen.
 *
 * Every card is the SAME fixed size (macOS lays each widget out at 320×320 and centres it), which
 * is what lets the carousel cross-fade one card into the next without the box resizing under the
 * nav buttons.
 */

/**
 * What the carousel hands each card through its slot:
 * - `ready` — how a card tells the carousel its content has landed. The deck stays folded away
 *   until the card being shown reports in, so the first thing the empty column does is animate a
 *   finished card in rather than show three quarters of one assembling itself.
 * - `titleId` — the id the card's title is rendered with, so the slot can be named by it and the
 *   carousel can announce it when stepping to the card.
 */
const TipSlotContext = createContext<{ready: () => void, titleId: string}>();

export const TipSlotProvider = TipSlotContext.Provider;

/** Call once the card's own content is on screen. Safe to call more than once. */
export const useTipReady = () => useContext(TipSlotContext)?.ready ?? (() => {});

/**
 * Opens the settings screen a card's description points at. An already-open copy is brought back
 * to the front instead of stacking a second one — the description can be clicked any number of
 * times, and `createTab` would happily pile up identical tabs.
 */
export function openSettingsTab(appSidebarLeft: AppSidebarLeft, tab: SliderSuperTabConstructable) {
  const existing = appSidebarLeft.getTab(tab);
  if(existing) {
    appSidebarLeft.closeTabsUntilTab(existing);
    return;
  }

  appSidebarLeft.createTab(tab).open();
}

export type TipCardButton = {
  icon: Icon,
  text: JSX.Element,
  selected: boolean,
  onClick: (e: MouseEvent) => void
};

export default function TipCard(props: {
  title: JSX.Element,
  /** The segmented row under the title — each card's primary control (macOS `WidgetData.buttons`). */
  buttons: TipCardButton[],
  /** Small centred heading above the content, when the card has one (macOS's "Chat Mode" etc). */
  contentTitle?: JSX.Element,
  children: JSX.Element,
  /** Bottom line, secondary; build it with `i18n(key, [anchorCallback(…)])` to get the link. */
  description: JSX.Element
}) {
  const slot = useContext(TipSlotContext);
  return (
    <div class={styles.card}>
      <div id={slot?.titleId} class={styles.cardTitle}>{props.title}</div>
      {/* One choice out of a few, so one tab stop: Tab enters on the chosen button, the arrows move
          between them, Enter / Space picks — the same as the theme strip, and without applying
          on every arrow press, which here would switch the theme. A toolbar from three controls
          up, a plain group below that (the Chats filters hide the empty ones). */}
      <div
        class={styles.buttons}
        role={props.buttons.length > 2 ? 'toolbar' : 'group'}
        aria-labelledby={slot?.titleId}
        ref={(el) => onCleanup(attachPickerGrid(el, 'button'))}
      >
        {/* `Index`, not `For`: the cards rebuild the whole array whenever the selection moves, and
            `For` would key those fresh objects by reference and recreate every button — killing
            the ripple of the one just clicked. By position the element stays and only updates.
            Toggle buttons: `aria-pressed` says which one is on. */}
        <Index each={props.buttons}>{(button) => (
          <RippleElement
            component="button"
            type="button"
            class={classNames(styles.button, button().selected && styles.buttonSelected)}
            aria-pressed={button().selected}
            onClick={(e: MouseEvent) => button().onClick(e)}
          >
            <IconTsx icon={button().icon} class={styles.buttonIcon} />
            <span class={styles.buttonText}>{button().text}</span>
          </RippleElement>
        )}</Index>
      </div>
      <div class={styles.content}>
        <Show when={props.contentTitle}>
          <div class={styles.contentTitle}>{props.contentTitle}</div>
        </Show>
        {props.children}
      </div>
      <div class={styles.description}>{props.description}</div>
    </div>
  );
}
