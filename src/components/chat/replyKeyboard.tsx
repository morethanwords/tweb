import type ChatInput from '@components/chat/input';
import {ReplyMarkup} from '@layer';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {getHeavyAnimationPromise} from '@hooks/useHeavyAnimationCheck';
import safeAssign from '@helpers/object/safeAssign';
import {AppManagers} from '@lib/managers';
import Scrollable, {ScrollableContextValue} from '@components/scrollable2';
import wrapKeyboardButton from '@components/wrappers/keyboardButton';
import {Middleware, MiddlewareHelper} from '@helpers/middleware';
import {For} from 'solid-js';
import {render} from 'solid-js/web';
import ReplyMarkupLayout from '@components/chat/bubbleParts/replyMarkupLayout';
import {ChatType} from '@components/chat/chatType';
import isForceReplyMarkup from '@appManagers/utils/messages/isForceReplyMarkup';
import EventListenerBase from '@helpers/eventListenerBase';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ensureButtonSemantics from '@helpers/dom/ensureButtonSemantics';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {getFocusableElements} from '@helpers/dom/focusTrap';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import {I18n} from '@lib/langPack';
import Modes from '@config/modes';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import {EASING_Y} from '@components/chat/bubbleShape';
import mediaSizes, {ScreenSize} from '@helpers/mediaSizes';
import {APP_TABS, LEFT_COLUMN_ACTIVE_CLASSNAME, RIGHT_COLUMN_ACTIVE_CLASSNAME} from '@lib/appColumns';
import overlayCounter from '@helpers/overlayCounter';
import contextMenuController from '@helpers/contextMenuController';

let keyboardId = 0;
// * Android's keyboard time (AdjustPanLayoutHelper.keyboardDuration), in its curve (`EASING_Y`)
const DURATION = 250;
const FADE_IN = 200;

/**
 * A bot's keyboard, laid out under the message field like the inline keyboard under a bubble. The
 * field moves up by its height, and the history with it (`Chat.setChatInputKeyboardHeight`). It is a
 * part of the composer rather than a popup, and opens and closes as on iOS and Android: by itself when
 * a keyboard comes and when the chat opens (`autoShow`), by the button, and it stays open until that
 * button, Escape or a single-use keyboard's press closes it.
 */
export default class ReplyKeyboard extends EventListenerBase<{
  open: () => void,
  close: () => void
}> {
  private static BASE_CLASS = 'reply-keyboard';
  private element: HTMLElement;
  private appendTo: HTMLElement;
  private listenerSetter: ListenerSetter;
  private managers: AppManagers;
  private btnHover: HTMLElement;
  private peerId: PeerId;
  private chatInput: ChatInput;
  private scrollable: ScrollableContextValue;
  private middlewareHelper: MiddlewareHelper;
  private ephemeralMode = false;
  private active = false;
  private navigationItem: NavigationItem;
  private resizeObserver: ResizeObserver;
  // * what it takes under the field: the keyboard and the gap above it
  private height = 0;
  // * the field going up or down with it
  private slide: Animation;
  // * what it came to take under the field meanwhile (another keyboard), once the field is there
  private slideEndHeight: number;
  // * the keyboard it last saw come - another one opens by itself - and whether it was used up then: one that is now
  // * goes (a keyboard reopened by the user once used up stays)
  private seenMid: number;
  private seenHidden: boolean;
  // * what is to be shown once nothing stands in its place any more (`retry`): one that would have opened by itself
  // * meanwhile, and the keyboard the field took with it (a selection, the expanded editor, a recording) - its message,
  // * and whether it was used up then
  private autoShowPending = false;
  private restore: {mid: number, hidden: boolean};

  constructor(options: {
    listenerSetter: ListenerSetter,
    managers: AppManagers,
    appendTo: HTMLElement,
    btnHover: HTMLElement,
    chatInput: ChatInput,
    middleware: Middleware
  }) {
    super(false);
    safeAssign(this, options);

    this.element = document.createElement('div');
    this.element.classList.add(ReplyKeyboard.BASE_CLASS);
    this.element.id = `${ReplyKeyboard.BASE_CLASS}-${++keyboardId}`;
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', I18n.format('General.Keyboard', true));

    this.middlewareHelper = options.middleware.create();
    this.appendTo.append(this.element);

    const button = this.btnHover;
    ensureButtonSemantics(button);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', this.element.id);
    attachClickEvent(button, (event) => {
      const byKeyboard = Modes.a11y && event.type === 'click' && (event as MouseEvent).detail === 0;
      this.toggleByUser(undefined, byKeyboard);
    }, {listenerSetter: this.listenerSetter});

    this.listenerSetter.add(rootScope)('history_reply_markup', async({peerId}) => {
      if(this.peerId === peerId) {
        if(await this.checkAvailability()) {
          const replyMarkup = this.getReplyMarkup() as ReplyMarkup.replyKeyboardMarkup;
          const spent = replyMarkup.pFlags.hidden && !(replyMarkup.mid === this.seenMid && this.seenHidden);
          // * a single-use one is spent by the user's next message, typed too: it goes, a persistent one as well, its
          // * button stays for it
          if(this.isActive() && spent) this.toggle(false);
          else if(this.isActive()) {
            await this.render();
            // * persistent or not now
            this.updateDismissal();
          }
          // * a keyboard another message brought opens by itself, as it does on iOS and Android
          else if(this.getReplyMarkup().mid !== this.seenMid) this.autoShow();
        }

        this.see();

        getHeavyAnimationPromise().then(() => {
          this.checkForceReply();
        });
      }
    });

    // * once the change is made: what it registers stands over the chat's own entry, which is pushed after the event
    const {appImManager} = this.chatInput.chat;
    this.listenerSetter.add(appImManager)('chat_changing', ({to}) => {
      queueMicrotask(() => this.onShownChange(to === this.chatInput.chat && this.isChatShown()));
    });
    this.listenerSetter.add(appImManager)('tab_changing', (tabId) => {
      queueMicrotask(() => this.onShownChange(this.isChatShown(tabId)));
    });
    this.listenerSetter.add(overlayCounter)('change', (isActive) => {
      if(!isActive) this.onShownChange(this.isChatShown());
    });
    // * a menu (a message's, the attachments') counts no overlay, and has an Escape of its own as well
    this.listenerSetter.add(contextMenuController)('toggle', (open) => {
      if(!open) this.onShownChange(this.isChatShown());
    });
    // * a window widened past a phone's shows the chat beside the list, which no change of chat or column tells
    this.listenerSetter.add(mediaSizes)('changeScreen', () => {
      this.onShownChange(this.isChatShown());
    });

    options.middleware.onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.slide?.cancel();
      appNavigationController.removeItem(this.navigationItem);
    });
  }

  public isActive() {
    return this.active;
  }

  private see() {
    const replyMarkup = this.getReplyMarkup() as ReplyMarkup.replyKeyboardMarkup;
    this.seenMid = replyMarkup.mid;
    this.seenHidden = !!replyMarkup.pFlags?.hidden;
  }

  // * a persistent keyboard of a bot's own chat is not closed by the user (iOS, Android and desktop alike):
  // * it has no button to close it while it is shown, and Escape leaves it
  public isPermanent() {
    return this.active && this.isPersistent(this.getReplyMarkup());
  }

  private isPersistent(replyMarkup: ReplyMarkup) {
    const {chat} = this.chatInput;
    return !!(replyMarkup as ReplyMarkup.replyKeyboardMarkup).pFlags?.persistent && chat.peerId.isUser() && chat.isBot;
  }

  // * the keyboard the user closed, of this history (a topic's is its own): it does not open by itself again,
  // * until another message brings one or the user opens it (`closed_botkeyboard_` of Android, iOS's
  // * `closedButtonKeyboardMessageId`)
  private isClosedByUser(replyMarkup: ReplyMarkup) {
    const {chat} = this.chatInput;
    return chat.appState.closedReplyKeyboards?.[chat.historyStorage.key] === replyMarkup.mid;
  }

  /**
   * The user's own open or close, remembered: the button, Escape, the device's keyboard taking an ordinary one's place,
   * a press of a single-use one - which closes a persistent one too (`evenPermanent`)
   */
  public toggleByUser(enable = !this.active, byKeyboard?: boolean, evenPermanent?: boolean) {
    if(enable === this.active || (!enable && !evenPermanent && this.isPermanent())) {
      return;
    }

    const {chat} = this.chatInput;
    const key = chat.historyStorage.key;
    if(!enable) chat.setAppState('closedReplyKeyboards', key, this.getReplyMarkup().mid);
    else if(chat.appState.closedReplyKeyboards?.[key] !== undefined) chat.setAppState('closedReplyKeyboards', key, undefined);
    return this.toggle(enable, byKeyboard);
  }

  /**
   * Opens the keyboard by itself, as iOS and Android do when one comes and when the chat opens: not over what the user
   * is writing or editing, not a single-use one used up, not one the user closed - a persistent one neither, as what puts
   * it away for the device's keyboard is no closing (`giveWayToDeviceKeyboard`)
   */
  public autoShow(animate = true) {
    const replyMarkup = this.getReplyMarkup() as ReplyMarkup.replyKeyboardMarkup;
    if(
      this.active ||
      !this.isAvailable(replyMarkup) ||
      replyMarkup.pFlags.hidden ||
      this.isClosedByUser(replyMarkup)
    ) {
      return;
    }

    // * not while something stands in its place for a while - the chat out of view (one under another, behind the chat
    // * list on a phone), a popup or a menu, whose focus and Escape it would take, the emoji panel the user has open, a
    // * field given way to a selection, expanded or recording: once that is over
    if(!this.isFieldFree()) {
      this.autoShowPending = true;
      return;
    }

    if(this.chatInput.canShowReplyKeyboardItself()) {
      return this.toggle(true, false, animate);
    }
  }

  private isFieldFree(shown = this.isChatShown()) {
    return shown &&
      !this.isCovered() &&
      !this.chatInput.isEmoticonsOpen() &&
      this.chatInput.canShowReplyKeyboard();
  }

  // * a popup or a menu over the chat, whose focus and Escape are theirs
  private isCovered() {
    return overlayCounter.isOverlayActive || contextMenuController.isOpened();
  }

  /**
   * Something that stood in its place is gone: what was to be shown is, if nothing else stands there still - the
   * keyboard the field took with it as it was, whatever opened it (the user, over their text too), but not once used up
   * meanwhile (answered from another device); else one that would have opened by itself
   */
  private retry(animate = true, shown?: boolean) {
    if(this.active) {
      this.autoShowPending = false;
      this.restore = undefined;
      return;
    }

    if(!this.isFieldFree(shown)) {
      return;
    }

    const {restore} = this;
    const replyMarkup = this.getReplyMarkup() as ReplyMarkup.replyKeyboardMarkup;
    this.restore = undefined;
    if(
      restore &&
      replyMarkup.mid === restore.mid &&
      this.isAvailable(replyMarkup) &&
      (restore.hidden || !replyMarkup.pFlags.hidden)
    ) {
      this.autoShowPending = false;
      return this.toggle(true, false, animate);
    }

    if(this.autoShowPending) {
      this.autoShowPending = false;
      return this.autoShow(animate);
    }
  }

  /**
   * A tap on the field brings the device's keyboard in its place: an ordinary one is closed, as the user would - a
   * persistent one only gives way, back once that keyboard goes (iOS, Android)
   */
  public giveWayToDeviceKeyboard() {
    if(this.isPermanent()) this.toggle(false);
    else this.toggleByUser(false);
  }

  /**
   * The field gives way to something else: the keyboard goes with it, and comes back with it (`resume`) - at once where
   * what comes takes its very place (the emoji panel under the field)
   */
  public suspend(animate = true) {
    if(!this.active) {
      // * on its way down already: out of the way now, if what comes takes its place
      if(!animate) this.toggle(false, false, false);
      return;
    }

    const replyMarkup = this.getReplyMarkup() as ReplyMarkup.replyKeyboardMarkup;
    this.restore = {mid: replyMarkup.mid, hidden: !!replyMarkup.pFlags.hidden};
    this.toggle(false, false, animate);
  }

  /** What stood in its place (a selection, the expanded editor, a recording, the emoji panel) is gone */
  public resume() {
    this.retry();
  }

  // * the chat in view: the top of the stack, and on a phone the column shown (as `Chat`'s observers have it)
  private isChatShown(tabId?: APP_TABS) {
    const {chat} = this.chatInput;
    // * a chat with no peer (the dialog deleted) shows nothing
    if(!chat.peerId || chat.appImManager.chat !== chat || mediaSizes.activeScreen !== ScreenSize.mobile) {
      return !!chat.peerId && chat.appImManager.chat === chat;
    }

    if(tabId !== undefined) {
      return tabId === APP_TABS.CHAT;
    }

    const {classList} = document.body;
    return !classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME) && !classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME);
  }

  // * coming into view (or out of under a popup) it opens at once, as the rest of what is shown
  private onShownChange(shown: boolean) {
    this.updateDismissal(shown);
    if(shown) this.retry(false, shown);
  }

  /**
   * What closes it while it is open, for the keyboard it shows: the button, and Escape or back - the chat's in view
   * only, or they would close it from another one - but nothing for a persistent one
   */
  private updateDismissal(shown = this.isChatShown()) {
    if(this.active && shown && !this.isPermanent()) {
      // * not over a popup's or a menu's Escape: once that is gone (`onShownChange`)
      if(!this.navigationItem && !this.isCovered()) appNavigationController.pushItem(this.navigationItem = {
        type: 'dropdown',
        noBlurOnPop: true,
        onPop: () => {
          this.toggleByUser(false);
        },
        // * a chat's own entry, pushed once it is shown, goes under it (`AppImManager.chatsSelectTab`)
        context: this.chatInput.chat
      });
    } else if(this.navigationItem) {
      appNavigationController.removeItem(this.navigationItem);
      this.navigationItem = undefined;
    }

    this.chatInput.updateReplyMarkupToggle();
  }

  public async toggle(enable = !this.active, byKeyboard?: boolean, animate = true) {
    if(enable === this.active) {
      // * at once while it goes down already (another chat, the emoji panel in its place): what is left of the way goes now
      if(!enable && !animate && this.slide) {
        this.settle();
        this.chatInput.chat.setChatInputKeyboardHeight(0);
      }

      return;
    }

    this.active = enable;
    this.btnHover.setAttribute('aria-expanded', '' + enable);
    // * closing, it takes no press while it goes down (_replyKeyboard.scss), nor focus with the layer (below)
    this.element.classList.toggle('active', enable);
    if(enable && Modes.a11y) this.element.inert = false;
    // * a way still going is over at once: the next one goes from where it ends
    this.settle();

    if(enable) {
      this.dispatchEvent('open');
      if(IS_TOUCH_SUPPORTED) {
        // * it takes the place of the device's keyboard
        blurActiveElement();
      }

      await this.render();
      if(!this.active) {
        return;
      }

      this.element.classList.add('is-shown');
      this.observeHeight();
      // * once, as it opens: what it takes under the field, the gap above it included
      this.setHeight(this.element.offsetHeight, animate);

      this.updateDismissal();

      if(byKeyboard) {
        this.element.ownerDocument.defaultView.requestAnimationFrame(() => {
          if(this.active) getFocusableElements(this.element)[0]?.focus();
        });
      }
    } else {
      this.dispatchEvent('close');
      this.updateDismissal();

      // * the keyboard is gone once it has gone down: what had focus in it, or on its button, would be left with
      // * nothing - the button, unless it went with it (text in the field, `ChatInput.updateReplyMarkupToggle`): the field
      const {activeElement} = this.element.ownerDocument;
      if(Modes.a11y && (this.element.contains(activeElement) || activeElement === this.btnHover)) {
        if(this.btnHover.classList.contains('show')) this.btnHover.focus();
        else this.chatInput.focusMessageInput();
      }

      if(Modes.a11y) this.element.inert = true;

      this.setHeight(0, animate);
    }
  }

  /**
   * The field stands `height` higher, and the history with it (`Chat.setChatInputKeyboardHeight`). With full
   * animations the keyboard comes up from the bottom with the field on it, or goes down with it, as the device's
   * keyboard does on iOS and Android, in Android's time and curve: the field and the keyboard are laid out where
   * they end at once and only moved there by the compositor, the history at its end with them. With reduced ones the
   * keyboard fades in where it stands.
   */
  private setHeight(height: number, animate = true) {
    const was = this.height;
    if(was === height) {
      if(!height) this.element.classList.remove('is-shown');
      return;
    }

    this.height = height;
    const composer = this.chatInput.chatInput;
    const motion = animate &&
      liteMode.isAvailable('motion') &&
      composer.isConnected &&
      composer.ownerDocument.visibilityState !== 'hidden';
    this.chatInput.chat.setChatInputKeyboardHeight(height, motion ? DURATION : undefined);

    // * opened or closed at once, or its height changed as it stood (another keyboard came)
    if(!motion || (was && height)) {
      if(!height) this.element.classList.remove('is-shown');
      else if(!was && animate && liteMode.isAvailable('animations')) {
        this.element.animate([{opacity: 0}, {opacity: 1}], {duration: FADE_IN});
      }

      return;
    }

    const distance = height || was;
    const animation = this.slide = composer.animate(
      height ?
        [{translate: `0 ${distance}px`}, {translate: '0 0'}] :
        [{translate: '0 0'}, {translate: `0 ${distance}px`}],
      {duration: DURATION, easing: EASING_Y, fill: 'forwards'}
    );
    animation.finished.then(() => {
      if(this.slide === animation) this.settle();
    }, noop);
  }

  // * the way the field goes, over: down, the keyboard goes away under it as the field takes its place
  private settle() {
    const animation = this.slide;
    if(!animation) {
      return;
    }

    this.slide = undefined;
    if(!this.height) this.element.classList.remove('is-shown');
    animation.cancel();

    const height = this.slideEndHeight;
    this.slideEndHeight = undefined;
    if(this.active && height) this.setHeight(height, false);
  }

  private observeHeight() {
    if(this.resizeObserver) {
      return;
    }

    // * another keyboard of another size, or the same one laid out anew (the window's width): the field and the
    // * history go where it has them at once. Shown, or laid out anew, it has more past one end of it or not
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const height = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      this.scrollable?.onSizeChange();
      if(!this.active || !height) return;
      if(this.slide) this.slideEndHeight = height;
      else this.setHeight(height, false);
    });
    this.resizeObserver.observe(this.element);
  }

  public async checkForceReply() {
    const replyMarkup = await this.getReplyMarkup();
    if(this.ephemeralMode) {
      return;
    }

    if(isForceReplyMarkup(replyMarkup) &&
      !replyMarkup.pFlags.hidden &&
      !replyMarkup.pFlags.used) {
      replyMarkup.pFlags.used = true;
      this.chatInput.initMessageReply({replyToMsgId: replyMarkup.mid});
    }
  }

  private getReplyMarkup(): ReplyMarkup {
    const {chat} = this.chatInput;
    // the welcome messages section shares the chat's history storage, yet a bot's keyboard or
    // force-reply there is not for writing templates (desktop and Android have none in it).
    // A topic or a comment thread shows the keyboard of its own last bot message, not the
    // chat's: its storage keeps that one (desktop's replies keyboard, Android's per-topic one)
    const replyMarkup = chat.type !== ChatType.Welcome &&
      chat.historyStorage.replyMarkup;
    return replyMarkup || {
      _: 'replyKeyboardHide',
      pFlags: {}
    };
  }

  public async render(replyMarkup?: ReplyMarkup.replyKeyboardMarkup) {
    if(replyMarkup === undefined) {
      replyMarkup = await this.getReplyMarkup() as any;
    }

    this.middlewareHelper.clean();

    // * a single-use keyboard goes once a button of it is pressed (desktop's `singleUse`),
    // * any other stays for the next one
    // * and is remembered so, as one the user closed, a persistent one too: a contact or a place sent by it is no text to
    // * mark it answered (`AppMessagesManager.mergeReplyKeyboard`), and it would open by itself again with the chat
    const onClick = replyMarkup.pFlags?.single_use ? () => this.toggleByUser(false, false, true) : undefined;
    // * which ends of it there is more past is in its classes, faded there (_replyKeyboard.scss)
    const dispose = render(() => (
      <Scrollable
        class={ReplyKeyboard.BASE_CLASS + '-scrollable'}
        relative
        withBorders="manual"
        contextRef={(scrollable) => this.scrollable = scrollable}
      >
        <ReplyMarkupLayout>
          <For each={replyMarkup.rows}>
            {(row) => (
              <ReplyMarkupLayout.Row class={ReplyKeyboard.BASE_CLASS + '-row'}>
                <For each={row.buttons}>
                  {(button) => (
                    wrapKeyboardButton({
                      button,
                      chat: this.chatInput.chat,
                      replyMarkup,
                      wrapOptions: {
                        textColor: 'white'
                      },
                      onClick
                    })
                  )}
                </For>
              </ReplyMarkupLayout.Row>
            )}
          </For>
        </ReplyMarkupLayout>
      </Scrollable>
    ), this.element);
    // * the next render cleans it away, not only the field's end
    this.middlewareHelper.get().onClean(dispose);
  }

  private isAvailable(replyMarkup: ReplyMarkup) {
    return !this.ephemeralMode &&
      replyMarkup._ !== 'replyKeyboardHide' &&
      // a force-reply inline markup is tracked as the last keyboard, but it is drawn in
      // its own bubble — there is no panel to open for it
      replyMarkup._ !== 'replyInlineMarkup' &&
      !!(replyMarkup as ReplyMarkup.replyKeyboardMarkup).rows?.length;
  }

  public async checkAvailability(replyMarkup?: ReplyMarkup) {
    if(replyMarkup === undefined) {
      replyMarkup = await this.getReplyMarkup();
    }

    const hide = !this.isAvailable(replyMarkup);
    this.btnHover.classList.toggle('hide', hide);

    if(hide) {
      this.toggle(false);
    }

    return !hide;
  }

  public setEphemeralMode(ephemeralMode: boolean) {
    this.ephemeralMode = ephemeralMode;
    this.checkAvailability();
  }

  /** The chat it is for, as it opens: its keyboard opens with it, if it would by itself (`autoShow`), once the field is laid out. */
  public setPeer(peerId: PeerId) {
    this.peerId = peerId;

    // * another chat's keyboard is not this one's
    this.autoShowPending = false;
    this.restore = undefined;
    this.toggle(false, false, false);
    this.checkAvailability();
    this.see();
    this.checkForceReply();
  }
}
