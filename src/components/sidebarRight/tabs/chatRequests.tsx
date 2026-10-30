import {Component, createSignal, Show} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {createSelectorForTab} from '@components/sidebarRight/tabs/participantsSelector';
import {getImportersLoader} from '@components/sidebarRight/tabs/chatInviteLinkShared';
import {formatFullSentTime} from '@helpers/date';
import Button from '@components/button';
import {i18n} from '@lib/langPack';
import confirmationPopup from '@components/confirmationPopup';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import findUpClassName from '@helpers/dom/findUpClassName';
import {DialogElement} from '@components/dialogElement';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppChatRequestsTab} from '@components/solidJsTabs/tabs';

const ChatRequests: Component = () => {
  const [tab] = useSuperTab<typeof AppChatRequestsTab>();
  const promiseCollector = usePromiseCollector();
  const {appImManager} = useHotReloadGuard();
  const chatId = tab.payload;
  const managers = tab.managers;
  // * the whole queue, as the server counts it: the buttons that answer all of it are for more than one
  const [pendingCount, setPendingCount] = createSignal(0);
  const [hidingAll, setHidingAll] = createSignal(false);

  promiseCollector.collect((async() => {
    const isBroadcast = await managers.appChatsManager.isBroadcast(chatId);
    tab.container.classList.add('edit-peer-container', 'chat-members-container', 'chat-requests-container');
    tab.title.replaceChildren(i18n(isBroadcast ? 'SubscribeRequests' : 'MemberRequests'));

    const {importersMap, deleteImporter, load, reset} = getImportersLoader({
      chatId,
      managers,
      requested: true,
      link: undefined,
      onCount: setPendingCount
    });

    const dialogElements: Map<PeerId, DialogElement> = new Map();
    const {selector, loadPromise} = createSelectorForTab({
      appendTo: tab.content,
      managers,
      middleware: tab.middlewareHelper.get(),
      peerId: chatId.toPeerId(true),
      peerType: ['custom'],
      getMoreCustom: load,
      getSubtitleForElement: (peerId) => i18n('RequestedToJoinAt', [formatFullSentTime(importersMap.get(peerId)?.date)]),
      processElementAfter: (peerId, dialogElement) => {
        const buttons = document.createElement('div');
        buttons.classList.add('chatlist-chat-buttons');
        const button = Button('btn-primary btn-control-small btn-color-primary', {text: isBroadcast ? 'AddToChannel' : 'AddToGroup'});
        const button2 = Button('btn-transparent btn-control-small primary', {text: 'Dismiss'});
        buttons.append(button, button2);
        dialogElement.container.append(buttons);
        dialogElements.set(peerId, dialogElement);
      },
      placeholderElementsGap: 36
    });

    let changedLength = 0;
    // * the tab lists every request, of every link, so it answers all of them: no `link` to narrow it to one
    const hideAll = async(approved: boolean) => {
      if(hidingAll()) {
        return;
      }

      try {
        await confirmationPopup({
          titleLangKey: approved ? 'JoinRequestAcceptAllTitle' : 'JoinRequestRejectAllTitle',
          descriptionLangKey: approved ? 'JoinRequestAcceptAllDescription' : 'JoinRequestRejectAllDescription',
          button: approved ? {langKey: 'JoinRequestAcceptAll'} : {langKey: 'JoinRequestDismissAll', isDanger: true}
        });
      } catch{
        return;
      }

      setHidingAll(true);
      try {
        await managers.appChatsManager.hideAllChatJoinRequests(chatId, approved);
      } catch(err) {
        toastNew({langPackKey: 'Error.AnError'});
        return;
      } finally {
        setHidingAll(false);
      }

      changedLength += pendingCount();
      setPendingCount(0);
      // * a row still being drawn is in the map before it is in the list, and a page on its way is dropped
      const peerIds = new Set([...importersMap.keys(), ...dialogElements.keys()]);
      reset();
      for(const peerId of peerIds) {
        selector.deletePeerId(peerId);
      }
      dialogElements.clear();
      // * the queue as the server has it now, from its start: requests that came while it was answered stay
      selector.reload();
    };

    // * a holder of its own: the section comes and goes with the count, the place it takes in the list stays
    const bulkSection = wrapSolidComponent(() => (
      <div>
        <Show when={pendingCount() > 1}>
          <Section noDelimiter>
            <Row clickable={() => hideAll(true)} disabled={hidingAll()}>
              <Row.Icon icon="adduser" />
              <Row.Title class="primary">{i18n('JoinRequestAcceptAll')}</Row.Title>
            </Row>
            <Row color="danger" clickable={() => hideAll(false)} disabled={hidingAll()}>
              <Row.Icon icon="crossround" />
              <Row.Title class="danger">{i18n('JoinRequestDismissAll')}</Row.Title>
            </Row>
          </Section>
        </Show>
      </div>
    ), tab.middlewareHelper.get());
    selector.scrollable.append(bulkSection, selector.scrollable.container.lastElementChild);
    attachClickEvent(selector.scrollable.container, async(e) => {
      const target = findUpClassName(e.target as HTMLElement, 'chatlist-chat');
      if(!target) {
        return;
      }

      const peerId = target.dataset.peerId.toPeerId();
      const dialogElement = dialogElements.get(peerId);

      const addButton = findUpClassName(e.target, 'btn-color-primary');
      const dismissButton = findUpClassName(e.target, 'btn-transparent');
      const add = addButton ? true : (dismissButton ? false : undefined);

      if(add === undefined) {
        appImManager.setInnerPeer({peerId});
        return;
      }

      const toggle = dialogElement.toggleDisability(true);
      try {
        await managers.appChatsManager.hideChatJoinRequest(chatId, peerId, add);
        ++changedLength;
        setPendingCount((count) => Math.max(0, count - 1));
        selector.deletePeerId(peerId);
        dialogElements.delete(peerId);
        deleteImporter(peerId);
      } catch(err) {
        toggle();
      }
    }, {listenerSetter: tab.listenerSetter});

    tab.eventListener.addEventListener('close', () => {
      tab.eventListener.dispatchEvent('finish', changedLength);
    });

    await loadPromise;
  })());

  return null;
};

export default ChatRequests;
