/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppStickersManager} from '@appManagers/appStickersManager';
import type ChatInput from '@components/chat/input';
import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import wrapSticker from '@components/wrappers/sticker';
import LazyLoadQueue from '@components/lazyLoadQueue';
import {putPreloader} from '@components/putPreloader';
import animationIntersector, {AnimationItemGroup} from '@components/animationIntersector';
import appImManager from '@lib/appImManager';
import mediaSizes from '@helpers/mediaSizes';
import {i18n} from '@lib/langPack';
import findUpClassName from '@helpers/dom/findUpClassName';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {toastNew} from '@components/toast';
import createStickersContextMenu from '@helpers/dom/createStickersContextMenu';
import attachStickerViewerListeners from '@components/stickerViewer';
import {Document, StickerSet} from '@layer';
import Row from '@components/row';
import rootScope from '@lib/rootScope';
import wrapCustomEmoji from '@components/wrappers/customEmoji';
import emoticonsDropdown from '@components/emoticonsDropdown';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {copyTextToClipboard} from '@helpers/clipboard';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {onMediaCaptionClick} from '@components/appMediaViewer';
import DEBUG from '@config/debug';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import appDownloadManager from '@lib/appDownloadManager';
import pause from '@helpers/schedulers/pause';
import toArray from '@helpers/array/toArray';
import ListenerSetter from '@helpers/listenerSetter';
import {createSignal, JSX, onCleanup, onMount, Show, untrack, useContext} from 'solid-js';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import MyShow from '@helpers/solid/myShow';

const ANIMATION_GROUP: AnimationItemGroup = 'STICKERS-POPUP';
export const STICKERS_POPUP_KIND = Symbol('stickers-popup');

const TEST_LOADING_DELAY = 0;

export default function showStickersPopup(
  stickerSetInput: Parameters<AppStickersManager['getStickerSet']>[0] | Parameters<AppStickersManager['getStickerSet']>[0][],
  isEmojisInitial?: boolean,
  chatInput: ChatInput = appImManager.chat?.input
) {
  const [show, setShow] = createSignal(true);

  const handle = {
    hide: () => setShow(false)
  };

  let isEmojis = isEmojisInitial;
  let sets: StickerSet.stickerSet[] = [];
  const updateAddedMap: {[setId: Long]: (added: boolean) => void} = {};
  const deferredCloseCallbacks: (() => void)[] = [];
  let containerEl!: HTMLDivElement;

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const managers = untrack(() => context.managers);
    const listenerSetter = new ListenerSetter();

    let scrollableEl!: HTMLDivElement;

    const [titleContent, setTitleContent] = createSignal<JSX.Element>(i18n('Loading'));
    const [menuEl, setMenuEl] = createSignal<HTMLElement>();
    const [isLoaded, setIsLoaded] = createSignal(false);
    const [isAdd, setIsAdd] = createSignal(false);
    const [buttonText, setButtonText] = createSignal<JSX.Element>();
    const [containers, setContainers] = createSignal<JSX.Element>();

    let rawSetsRef: Awaited<ReturnType<AppStickersManager['getStickerSet']>>[];

    emoticonsDropdown.setIgnoreMouseOut('popup', true);

    onCleanup(() => {
      emoticonsDropdown.setIgnoreMouseOut('popup', false);
      animationIntersector.setOnlyOnePlayableGroup();
      listenerSetter.removeAll();
    });

    const updateButton = () => {
      let buttonAppend: HTMLElement;
      let add: boolean;
      if(sets.length === 1) {
        const firstSet = sets[0];
        buttonAppend = i18n(isEmojis ? 'EmojiCount' : 'Stickers', [firstSet.count]);
        add = !firstSet.installed_date;
      } else {
        const installed = sets.filter((set) => set.installed_date);
        let count: number;
        if(sets.length === installed.length) {
          add = false;
          count = sets.length;
        } else {
          add = true;
          count = sets.length - installed.length;
        }
        buttonAppend = i18n('EmojiPackCount', [count]);
      }

      setIsAdd(add);
      setButtonText(i18n(add ? 'AddStickersCount' : 'RemoveStickersCount', [buttonAppend]));
    };

    const onStickerSetUpdate = (set: StickerSet.stickerSet) => {
      const idx = sets.findIndex((s) => s.id === set.id);
      if(idx === -1) return;
      sets[idx] = set;
      updateAddedMap[set.id]?.(!!set.installed_date);
      updateButton();
    };

    subscribeOn(rootScope)('stickers_installed', onStickerSetUpdate);
    subscribeOn(rootScope)('stickers_deleted', onStickerSetUpdate);

    const createStickerSetElements = (set?: StickerSet.stickerSet) => {
      const container = document.createElement('div');
      container.classList.add('sticker-set');

      let headerRow: Row, setUpdateAdded: (added: boolean) => void;
      if(set) {
        headerRow = new Row({
          title: wrapRichText(set.title),
          subtitle: i18n(set.pFlags.emojis ? 'EmojiCount' : 'Stickers', [set.count]),
          buttonRight: true
        });

        setUpdateAdded = (added) => {
          headerRow.buttonRight.replaceChildren(i18n(added ? 'Stickers.SearchAdded' : 'Stickers.SearchAdd'));
          headerRow.buttonRight.classList.toggle('active', added);
        };

        setUpdateAdded(!!set.installed_date);
        container.append(headerRow.container);
      }

      const itemsContainer = document.createElement('div');
      itemsContainer.classList.add('sticker-set-stickers');
      container.append(itemsContainer);

      return {container, headerRow, updateAdded: setUpdateAdded, itemsContainer};
    };

    const onStickersClick = async(e: MouseEvent) => {
      if(!chatInput.chat.peerId) return;

      const target = findUpClassName(e.target, 'sticker-set-sticker') || findUpClassName(e.target, 'custom-emoji');
      if(!target) return;

      const docId = target.dataset.docId;
      let emoji: {docId: DocId, emoji: string};
      if(isEmojis) {
        emoji = {docId, emoji: target.dataset.stickerEmoji};
        if(!chatInput.emoticonsDropdown.canUseEmoji(emoji, true)) return;
      }

      const shouldHide = isEmojis ?
        chatInput.onEmojiSelected(emoji, false) :
        await appImManager.chat.input.sendMessageWithDocument({document: docId, target});
      if(shouldHide) handle.hide();
    };

    const loadStickerSet = async() => {
      const inputs = toArray(stickerSetInput);
      const setsPromises = inputs.map((input) => managers.appStickersManager.getStickerSet(input));
      let rawSets = await Promise.all(setsPromises);
      if(!middleware()) return;
      let firstSet = rawSets[0];
      if(rawSets.length === 1 && !firstSet) {
        toastNew({langPackKey: isEmojis ? 'AddEmojiNotFound' : 'StickerSet.DontExist'});
        handle.hide();
        return;
      }

      rawSets = rawSets.filter(Boolean);
      firstSet = rawSets[0];
      sets = rawSets.map((set) => set.set);
      rawSetsRef = rawSets;

      isEmojis ??= !!firstSet.set.pFlags.emojis;

      attachClickEvent(scrollableEl, onStickersClick, {listenerSetter});

      const {destroy} = createStickersContextMenu({
        listenTo: scrollableEl,
        chatInput,
        isPack: true,
        isEmojis,
        onSend: () => handle.hide()
      });
      middleware.onClean(destroy);

      animationIntersector.setOnlyOnePlayableGroup(ANIMATION_GROUP);

      const lazyLoadQueue = new LazyLoadQueue();
      const loadPromises: Promise<any>[] = [];

      const containersPromises = rawSets.map(async(set) => {
        const {container, itemsContainer, headerRow, updateAdded: setUpdateAdded} =
          createStickerSetElements(rawSets.length > 1 ? set.set : undefined);

        if(headerRow) {
          attachClickEvent(headerRow.buttonRight, () => {
            managers.appStickersManager.toggleStickerSet(set.set);
          }, {listenerSetter});
        }

        updateAddedMap[set.set.id] = setUpdateAdded;

        let divs: (HTMLElement | DocumentFragment)[];
        const docs = set.documents.filter((doc) => doc?._ === 'document') as Document.document[];
        if(isEmojis) {
          const fragment = wrapCustomEmoji({
            docIds: docs.map((doc) => doc.id),
            loadPromises,
            animationGroup: ANIMATION_GROUP,
            customEmojiSize: mediaSizes.active.esgCustomEmoji,
            middleware
          });

          (Array.from(fragment.children) as HTMLElement[]).slice(1).forEach((element) => {
            const span = document.createElement('span');
            span.classList.add('super-emoji', 'super-emoji-custom');
            element.replaceWith(span);
            span.append(element);
          });

          divs = [fragment];
          itemsContainer.classList.replace('sticker-set-stickers', 'super-emojis');
          itemsContainer.classList.add('is-emojis');
        } else {
          divs = await Promise.all(docs.map(async(doc) => {
            const div = document.createElement('div');
            div.classList.add('sticker-set-sticker');
            const size = mediaSizes.active.popupSticker.width;
            await wrapSticker({
              doc,
              div,
              lazyLoadQueue,
              group: ANIMATION_GROUP,
              play: true,
              loop: true,
              width: size,
              height: size,
              withLock: true,
              loadPromises,
              middleware
            });
            return div;
          }));
        }

        itemsContainer.append(...divs.filter(Boolean));
        return container;
      });

      const containers = await Promise.all(containersPromises);
      await Promise.all(loadPromises);
      if(!middleware()) return;

      const title = rawSets.length === 1 ?
        wrapRichText(firstSet.set.title) :
        i18n('Emoji');

      updateButton();

      const buttons: ButtonMenuItemOptionsVerifiable[] = [{
        icon: 'copy',
        text: 'CopyLink',
        onClick: () => {
          const prefix = `https://t.me/${isEmojis ? 'addemoji' : 'addstickers'}/`;
          const text = rawSets.map((set) => prefix + set.set.short_name).join('\n');
          copyTextToClipboard(text);
        }
      }];

      if(DEBUG) {
        buttons.push({
          icon: 'download',
          text: 'MediaViewer.Context.Download',
          onClick: async() => {
            for(const set of rawSets) {
              for(const doc of set.documents) {
                appDownloadManager.downloadToDisc({media: doc as Document.document});
                await pause(100);
              }
            }
          }
        });
      }

      const buttonMenu = ButtonMenuToggle({
        listenerSetter,
        buttons,
        direction: 'bottom-left'
      });

      const onReady = () => {
        setTitleContent(title);
        setMenuEl(buttonMenu);
        setIsLoaded(true);
        setContainers(containers);
      };

      setTimeout(onReady, TEST_LOADING_DELAY);
    };

    onMount(() => {
      attachStickerViewerListeners({listenTo: scrollableEl, listenerSetter});

      const onContainerClick = (e: MouseEvent) => {
        const callback = onMediaCaptionClick(containerEl, e);
        if(callback) {
          deferredCloseCallbacks.push(callback);
          handle.hide();
          return false;
        }
      };

      containerEl.addEventListener('click', onContainerClick, {capture: true});
      middleware.onDestroy(() => {
        containerEl.removeEventListener('click', onContainerClick, {capture: true});
      });

      loadStickerSet();
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>{titleContent()}</PopupElement.Title>
          {menuEl()}
        </PopupElement.Header>
        <PopupElement.Body>
          <PopupElement.Scrollable
            ref={scrollableEl}
            class={!isLoaded() && 'is-loading'}
            withBorders="top"
          >
            <Show when={isLoaded()} fallback={putPreloader(undefined, true)}>
              {containers()}
            </Show>
          </PopupElement.Scrollable>
        </PopupElement.Body>
        <PopupElement.Footer floating={isLoaded()}>
          <PopupElement.FooterButton
            noRipple
            color={isLoaded() ? (isAdd() ? 'primary' : 'danger') : 'secondary'}
            callback={async() => {
              await managers.appStickersManager.toggleStickerSets(
                rawSetsRef.map((set) => set.set)
              );
            }}
            disabled={!isLoaded()}
          >
            <MyShow when={isLoaded()} fallback={i18n('Loading')}>
              {buttonText()}
            </MyShow>
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class="popup-stickers"
      closable
      show={show()}
      kind={STICKERS_POPUP_KIND}
      containerProps={{ref: (el) => containerEl = el}}
      onCloseAfterTimeout={() => {
        deferredCloseCallbacks.splice(0).forEach((cb) => cb());
      }}
      old
    >
      <Inner />
    </PopupElement>
  ));
}
