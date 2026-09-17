import PopupElement, {addCancelButton, createPopup} from '@components/popups/indexTsx';
import {ScrollableContextValue} from '@components/scrollable2';
import filterUnique from '@helpers/array/filterUnique';
import {Chat, ChatFull, Message, Reaction} from '@layer';
import I18n, {FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import Section from '@components/section';
import StackedAvatars from '@components/stackedAvatars';
import {createEffect, createSignal, JSX, onCleanup, Show} from 'solid-js';
import CheckboxFields, {CheckboxFieldsField} from '@components/checkboxFields';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import flatten from '@helpers/array/flatten';
import {avatarNew} from '@components/avatarNew';
import PeerTitle from '@components/peerTitle';
import Row, {createRowTitle} from '@components/rowTsx';
import {IconTsx} from '@components/iconTsx';
import classNames from '@helpers/string/classNames';
import {ChatPermissions} from '@components/sidebarRight/tabs/groupPermissions/sharedPermissions';
import {animate} from '@helpers/animation';
import canEditAdmin from '@appManagers/utils/chats/canEditAdmin';
import rootScope from '@lib/rootScope';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import type {AppManagers} from '@lib/managers';
import {
  DeleteAction,
  DeleteCheckboxFieldsField,
  ModerateMessage,
  ModerateOptions,
  ModerateReactionEntry,
  getCommunityId,
  getCommunityModerateOptions,
  getNoModerateOptions
} from '@components/popups/deleteMegagroupMessagesShared';
import {
  DeleteMegagroupContext,
  banParticipantFromCommunity,
  confirmDeleteMegagroupMessages,
  getModerateOptionsFor
} from '@components/popups/deleteMegagroupMessagesActions';

const className = 'popup-delete-megagroup-messages';

export type {ModerateReactionEntry};

export type PopupDeleteMegagroupMessagesOptions = ({
  messages: ModerateMessage[],
  reaction?: never
} | {
  messages?: never,
  reaction: ModerateReactionEntry
}) & {
  onConfirm?: () => void
};

import {getMiddleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';

export default async function showDeleteMegagroupMessagesPopup(options: PopupDeleteMegagroupMessagesOptions) {
  const reaction = 'reaction' in options ? options.reaction : undefined;
  const messages = 'messages' in options ? options.messages : [];
  const managers = rootScope.managers;
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const listenerSetter = new ListenerSetter();

  const [show, setShow] = createSignal(false);
  const [title, setTitle] = createSignal<JSX.Element>(
    reaction ? i18n('DeleteReaction') : i18n('DeleteOptionsTitle', [messages.length])
  );

  const ctx: DeleteMegagroupContext = {
    fields: undefined,
    messages,
    reaction,
    managers,
    onConfirm: options.onConfirm,
    banFromCommunity: (communityId, participantId) => banParticipantFromCommunity(managers, communityId, participantId)
  };

  const [scrollableRef, setScrollableRef] = createSignal<ScrollableContextValue>();

function updateReactionTitle() {
  if(!reaction || !ctx.fields) {
    return;
  }

  const isChecked = (action: DeleteAction) => ctx.fields.some((field) =>
    field.peerId === reaction.participantPeerId &&
    field.action === action &&
    field.checkboxField?.checked
  );
  const key: LangPackKey = isChecked('delete') ?
    'DeleteAllMessages' :
    (isChecked('deleteReactions') ? 'DeleteAllReactions' : 'DeleteReaction');
  setTitle(i18n(key));
}

  const fromPeerIds = reaction ?
    [reaction.participantPeerId] :
    filterUnique(messages.map(({fromId}) => fromId));
  const peerId = reaction?.message.peerId ?? messages[0].peerId;

  const stackedAvatars = new StackedAvatars({
    middleware: middleware,
    avatarSize: 32
  });

  const loadPromises: Promise<any>[] = [];
  stackedAvatars.render(fromPeerIds.slice(0, 3), loadPromises);
  stackedAvatars.container.classList.add(`${className}-avatars`);
  const avatarsContainer = stackedAvatars.container;

  const isSinglePeer = fromPeerIds.length === 1;
  const moderateOptions = await getModerateOptionsFor(ctx, peerId);
  ctx.reportReaction = moderateOptions.reportReaction;
  const deletePeerTitle = isSinglePeer ?
    await wrapPeerTitle({peerId: fromPeerIds[0], onlyFirstName: true}) :
    undefined;

  const actions: {
    action: DeleteAction,
    peerIds: PeerId[],
    langKey: LangPackKey,
    langArgs?: FormatterArguments,
    callback?: () => void
  }[] = [];

  if(moderateOptions.reportSpam) {
    actions.push({
      action: 'report',
      peerIds: fromPeerIds,
      langKey: 'DeleteReportSpam'
    });
  }

  if(!isSinglePeer) {
    if(moderateOptions.deleteAllMessages) {
      actions.push({
        action: 'delete',
        peerIds: fromPeerIds,
        langKey: 'DeleteAllMessages'
      });
    }

    if(moderateOptions.deleteAllReactions) {
      actions.push({
        action: 'deleteReactions',
        peerIds: fromPeerIds,
        langKey: 'DeleteAllReactions'
      });
    }
  }

  if(moderateOptions.banOrRestrict) {
    actions.push({
      action: 'ban',
      peerIds: fromPeerIds,
      langKey: isSinglePeer ? 'DeleteBan' : 'DeleteBanUsers',
      langArgs: isSinglePeer ? [await wrapPeerTitle({peerId: fromPeerIds[0], onlyFirstName: true})] : undefined
    });
  }

  if(
    isSinglePeer &&
    fromPeerIds[0].isUser() &&
    fromPeerIds[0] !== rootScope.myId &&
    moderateOptions.communityId
  ) {
    actions.push({
      action: 'communityBan',
      peerIds: fromPeerIds,
      langKey: 'Community.BanFromCommunity'
    });
  }

  const nameStart = 'delete-fields';

  const join = (...args: string[]) => [nameStart, ...args].join('-');

  const wrap = (item: typeof actions[number]): DeleteCheckboxFieldsField[] => {
    const nested = isSinglePeer ? [] : item.peerIds.map((peerId) => {
      const name = join(item.action, '' + peerId);
      const field: DeleteCheckboxFieldsField = {
        action: item.action,
        name,
        peerId,
        peerRow: true
      };

      return field;
    });

    return [{
      action: item.action,
      text: item.langKey,
      textArgs: item.langArgs,
      nested: isSinglePeer ? undefined : nested,
      name: isSinglePeer ? join(item.action, '' + peerId) : join(item.action),
      peerId: isSinglePeer ? item.peerIds[0] : undefined
    }, ...nested];
  };

  const fields = flatten(actions.map(wrap));
  if(isSinglePeer) {
    const nested: DeleteCheckboxFieldsField[] = [];
    if(moderateOptions.deleteAllMessages) {
      nested.push({
        action: 'delete',
        text: 'DeleteAllMessages',
        name: join('delete', '' + fromPeerIds[0]),
        peerId: fromPeerIds[0]
      });
    }

    if(moderateOptions.deleteAllReactions) {
      nested.push({
        action: 'deleteReactions',
        text: 'DeleteAllReactions',
        name: join('deleteReactions', '' + fromPeerIds[0]),
        peerId: fromPeerIds[0]
      });
    }

    if(nested.length) {
      const useDeleteOptions = nested.length > 1;
      const deleteOptionsField: DeleteCheckboxFieldsField = useDeleteOptions ? {
        action: 'deleteOptions',
        text: 'DeleteAllFrom',
        textArgs: [deletePeerTitle],
        nested,
        name: join('deleteOptions'),
        nestedRightButtonIcon: false
      } : nested[0];
      if(useDeleteOptions) {
        deleteOptionsField.setNestedCounter = (count) => {
          deleteOptionsField.nestedCounter.textContent = `${count}/${nested.length}`;
        };
      }

      const reportIndex = fields.findIndex((field) => field.action === 'report');
      fields.splice(reportIndex + 1, 0, deleteOptionsField, ...(useDeleteOptions ? nested : []));
    }
  }
  ctx.fields = fields;

  const checkboxFields = new CheckboxFields({
    fields,
    listenerSetter: listenerSetter,
    middleware: middleware,
    round: true,
    onRowCreation: (row, info) => {
      if(!info.nestedTo || !info.peerRow) {
        return;
      }

      row.container.classList.add(`${className}-row`);

      const div = document.createElement('div');
      div.classList.add(`${className}-row-title`);
      const title = createRowTitle();

      const avatar = avatarNew({
        peerId: info.peerId,
        middleware: middleware,
        size: 32
      });

      const peerTitle = new PeerTitle();
      const peerTitlePromise = peerTitle.update({
        peerId: info.peerId,
        onlyFirstName: true
      });

      title.append(peerTitle.element);

      loadPromises.push(avatar.readyThumbPromise, peerTitlePromise);
      div.append(avatar.node, title);
      row.container.append(div);
    },
    rightButtonIcon: 'group_filled',
    onAnyChange: () => {
      updateReactionTitle();
      onAnyChange();
    },
    onExpand: () => {
      const duration = 300;
      const startTime = Date.now();
      animate(() => {
        scrollableRef()?.onSizeChange();
        const progress = Math.min((Date.now() - startTime) / duration, 1);
        return progress < 1;
      });
    }
  });

  const createdFields = fields.map((field) => {
    const created = checkboxFields.createField(field);
    return created?.nodes;
  }).filter(Boolean);

  const hasBanAction = fields.some((field) => field.action === 'ban');
  let chatPermissionsContainer: HTMLElement;
  if(hasBanAction) {
    chatPermissionsContainer = document.createElement('div');
    ctx.chatPermissions = new ChatPermissions({
      appendTo: chatPermissionsContainer,
      chatId: peerId.toChatId(),
      listenerSetter: listenerSetter
    }, managers);
  }

  let onAnyChange: () => void;
  const Content = () => {
    const [banning, setBanning] = createSignal<PeerId[]>([]);
    const [communityBanning, setCommunityBanning] = createSignal(false);
    const [collapsed, setCollapsed] = createSignal(true);
    const collapsedName = () => collapsed() ?
      (banning().length === 1 ? 'DeleteToggleRestrictUser' : 'DeleteToggleRestrictUsers') :
      (banning().length === 1 ? 'DeleteToggleBanUser' : 'DeleteToggleBanUsers');

    onAnyChange = () => {
      const peerIds = fields
      .filter((field) => field.action === 'ban' && field.checkboxField.checked && field.peerId)
      .map(({peerId}) => peerId);
      setBanning(peerIds);
      setCommunityBanning(fields.some((field) => {
        return field.action === 'communityBan' &&
          field.checkboxField.checked;
      }));
    };

    createEffect(() => {
      if(!banning().length) {
        setCollapsed(true);
      }
    });

    createEffect(() => {
      if(!hasBanAction) {
        return;
      }

      const field = fields.find((field) => field.action === 'ban' && (isSinglePeer ? true : !field.peerId));
      const i18nElement = I18n.weakMap.get(field.row.title.firstElementChild as HTMLElement) as I18n.IntlElement;
      ctx.restricting = !collapsed();
      i18nElement.compareAndUpdate({
        key: collapsed() ?
          (isSinglePeer ? 'DeleteBan' : 'DeleteBanUsers') :
          (isSinglePeer ? 'DeleteRestrict' : 'DeleteRestrictUsers')
      });
    });

    createEffect(() => {
      if(!collapsed()) {
        const duration = 300;
        const startTime = Date.now();
        const scrollPosition = scrollableRef().container.scrollTop + scrollableRef().container.clientHeight;
        const scrollHeight = scrollableRef().container.scrollHeight;
        const path = 712 + scrollHeight - scrollPosition;
        animate(() => {
          const progress = Math.min((Date.now() - startTime) / duration, 1);
          const newScrollPosition = scrollPosition + path * progress;
          scrollableRef().container.scrollTop = newScrollPosition;
          return progress < 1;
        });
      }
    });

    // let lastRowRef: HTMLElement;
    return (
      <>
        {!!createdFields.length &&
          <Section name="DeleteAdditionalActions" noShadow noDelimiter>
            {flatten(createdFields)}
          </Section>
        }
        <Show when={
          communityBanning() &&
          moderateOptions.communityChatsCount
        }>
          <Section noShadow noDelimiter>
            <Row>
              <Row.Subtitle>
                {i18n('Community.BanFromCommunityInfo', [
                  moderateOptions.communityChatsCount
                ])}
              </Row.Subtitle>
            </Row>
          </Section>
        </Show>
        {hasBanAction && <>
          <Section
            class={`${className}-permissions`}
            name="UserRestrictionsCanDoUsers"
            nameArgs={[banning().length]}
            noShadow
            style={{
              // 'max-height': collapsed() ? '0px' : ((chatPermissionsContainer.childElementCount - 1) * 48) + 40 + 'px'
              'max-height': collapsed() ? '0px' : '712px'
            }}
          >
            {chatPermissionsContainer}
          </Section>
          <Section
            classList={{hide: !banning().length}}
          >
            <Row
              ref={(e) => {
                // lastRowRef = e;
                e.classList.add('primary');
              }}
              clickable={() => {
                setCollapsed((v) => !v);
              }}
              color="primary"
            >
              <Row.Title>
                <div class={classNames(`${className}-expand-row`, !collapsed() && 'is-expanded')}>
                  {i18n(collapsedName())}
                  <IconTsx icon="down" class={`${className}-expand-row-icon`} />
                </div>
              </Row.Title>
            </Row>
          </Section>
        </>}
      </>
    );
  };

  await Promise.all(loadPromises);

  createPopup(() => {
    onCleanup(() => {
      listenerSetter.removeAll();
      middlewareHelper.destroy();
    });

    return (
      <PopupElement class={className} closable show={show()}>
        <PopupElement.Header>
          {avatarsContainer}
          <PopupElement.Title>{title()}</PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Scrollable contextRef={setScrollableRef}>
          <PopupElement.Body>
            <Content />
          </PopupElement.Body>
        </PopupElement.Scrollable>
        <PopupElement.Buttons>
          <PopupElement.Button
            langKey="DeleteProceedBtn"
            danger
            iconLeft="delete_filled"
            callback={() => confirmDeleteMegagroupMessages(ctx)}
          />
          <PopupElement.Button langKey="Cancel" cancel />
        </PopupElement.Buttons>
      </PopupElement>
    );
  });

  setShow(true);
}
