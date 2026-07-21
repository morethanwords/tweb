import PopupElement, {addCancelButton} from '.';
import filterUnique from '@helpers/array/filterUnique';
import {Chat, ChatFull, Message, Reaction} from '@layer';
import I18n, {FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import Section from '@components/section';
import StackedAvatars from '@components/stackedAvatars';
import {createEffect, createSignal} from 'solid-js';
import CheckboxFields, {CheckboxFieldsField} from '@components/checkboxFields';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import flatten from '@helpers/array/flatten';
import {avatarNew} from '@components/avatarNew';
import PeerTitle from '@components/peerTitle';
import Row from '@components/rowTsx';
import {IconTsx} from '@components/iconTsx';
import classNames from '@helpers/string/classNames';
import {ChatPermissions} from '@components/sidebarRight/tabs/groupPermissions/sharedPermissions';
import {animate} from '@helpers/animation';
import canEditAdmin from '@appManagers/utils/chats/canEditAdmin';
import rootScope from '@lib/rootScope';

const className = 'popup-delete-megagroup-messages';

type DeleteCheckboxFieldsField = CheckboxFieldsField & {
  peerId?: PeerId,
  action: 'report' | 'delete' | 'deleteReactions' | 'deleteOptions' | 'ban',
  peerRow?: boolean
};

type DeleteAction = Exclude<DeleteCheckboxFieldsField['action'], 'deleteOptions'>;

type ModerateOptions = {
  reportSpam: boolean,
  reportReaction: boolean,
  deleteAllMessages: boolean,
  deleteAllReactions: boolean,
  banOrRestrict: boolean
};

const getNoModerateOptions = (): ModerateOptions => ({
  reportSpam: false,
  reportReaction: false,
  deleteAllMessages: false,
  deleteAllReactions: false,
  banOrRestrict: false
});

type ModerateMessage = Message.message | Message.messageService;

export type ModerateReactionEntry = {
  message: ModerateMessage,
  participantPeerId: PeerId,
  knownReaction?: Reaction
};

export type PopupDeleteMegagroupMessagesOptions = ({
  messages: ModerateMessage[],
  reaction?: never
} | {
  messages?: never,
  reaction: ModerateReactionEntry
}) & {
  onConfirm?: () => void
};

export default class PopupDeleteMegagroupMessages extends PopupElement {
  private messages: ModerateMessage[];
  private reaction: ModerateReactionEntry;
  private fields: DeleteCheckboxFieldsField[];
  private restricting: boolean;
  private chatPermissions: ChatPermissions;
  private onConfirm: () => void;
  private reportReaction: boolean;

  private updateReactionTitle() {
    if(!this.reaction || !this.fields) {
      return;
    }

    const isChecked = (action: DeleteAction) => this.fields.some((field) =>
      field.peerId === this.reaction.participantPeerId &&
      field.action === action &&
      field.checkboxField?.checked
    );
    const key: LangPackKey = isChecked('delete') ?
      'DeleteAllMessages' :
      (isChecked('deleteReactions') ? 'DeleteAllReactions' : 'DeleteReaction');
    this.title.replaceChildren(i18n(key));
  }

  constructor(options: PopupDeleteMegagroupMessagesOptions) {
    const reaction = 'reaction' in options ? options.reaction : undefined;
    const messages = 'messages' in options ? options.messages : [];
    super(className, {
      body: true,
      scrollable: true,
      title: reaction ? i18n('DeleteReaction') : i18n('DeleteOptionsTitle', [messages.length]),
      overlayClosable: true,
      buttons: addCancelButton([{
        langKey: 'DeleteProceedBtn',
        isDanger: true,
        callback: () => this.onConfirmClick(),
        iconLeft: 'delete_filled'
      }])
    });

    this.messages = messages;
    this.reaction = reaction;
    this.onConfirm = options.onConfirm;

    this.construct();
  }

  private async onConfirmClick() {
    const byPeers = this.fields.reduce((acc, field) => {
      if(field.peerId === undefined || field.action === 'deleteOptions' || !field.checkboxField.checked) {
        return acc;
      }

      let set = acc.get(field.peerId);
      if(!set) {
        acc.set(field.peerId, set = new Set());
      }

      set.add(field.action);
      return acc;
    }, new Map<PeerId, Set<DeleteAction>>());

    const mids = this.messages.length ?
      this.messages.map(({mid}) => mid) :
      [this.reaction.message.mid];
    const peerId = this.reaction?.message.peerId ?? this.messages[0].peerId;
    const deleteOriginReactions = !!this.reaction &&
      byPeers.get(this.reaction.participantPeerId)?.has('deleteReactions');
    const {restricting, managers} = this;
    for(const [fromId, actions] of byPeers) {
      const promises: Promise<any>[] = [];
      if(actions.has('ban') && restricting) {
        const rights = this.chatPermissions.takeOut();
        promises.push(managers.appChatsManager.editBanned(peerId.toChatId(), fromId, rights));
      } else if(actions.has('ban')) {
        promises.push(managers.appChatsManager.kickFromChannel(peerId.toChatId(), fromId));
      }

      if(actions.has('report')) {
        if(this.reaction && this.reportReaction && fromId === this.reaction.participantPeerId) {
          promises.push(managers.appReactionsManager.reportParticipantReaction({
            peerId,
            mid: this.reaction.message.mid,
            participantPeerId: fromId
          }));
        } else {
          promises.push(managers.appMessagesManager.reportSpamMessages(peerId, fromId, mids));
        }
      }

      if(actions.has('delete')) {
        promises.push(managers.appMessagesManager.doFlushHistory({peerId, justClear: false, revoke: true, participantPeerId: fromId}));
      }

      if(actions.has('deleteReactions')) {
        promises.push(managers.appReactionsManager.deleteParticipantReactions({
          peerId,
          participantPeerId: fromId,
          ...(this.reaction?.participantPeerId === fromId ? {
            originMid: this.reaction.message.mid,
            knownReaction: this.reaction.knownReaction
          } : {})
        }));
      }
    }

    if(this.reaction && !deleteOriginReactions) {
      managers.appReactionsManager.deleteParticipantReaction({
        peerId,
        mid: this.reaction.message.mid,
        participantPeerId: this.reaction.participantPeerId,
        knownReaction: this.reaction.knownReaction
      });
    }

    if(this.messages.length) {
      managers.appMessagesManager.deleteMessages(peerId, mids, true);
    }

    this.onConfirm?.();
    return true;
  }

  private async getModerateOptions(peerId: PeerId): Promise<ModerateOptions> {
    if(!this.reaction) {
      return {
        reportSpam: true,
        reportReaction: false,
        deleteAllMessages: true,
        deleteAllReactions: true,
        banOrRestrict: true
      };
    }

    const participantPeerId = this.reaction.participantPeerId;
    if(participantPeerId === peerId || participantPeerId === rootScope.myId) {
      return getNoModerateOptions();
    }

    const chatId = peerId.toChatId();
    if(participantPeerId.isAnyChat()) {
      const participantFull = await this.managers.appProfileManager
      .getChatFull(participantPeerId.toChatId())
      .catch((): undefined => undefined);
      if((participantFull as ChatFull.channelFull)?.linked_chat_id === chatId) {
        return getNoModerateOptions();
      }
    }

    const [chat, canDeleteMessages, canBanUsers, isPublic] = await Promise.all([
      this.managers.appChatsManager.getChat(chatId) as Promise<Chat>,
      this.managers.appChatsManager.hasRights(chatId, 'delete_messages'),
      this.managers.appChatsManager.hasRights(chatId, 'ban_users'),
      this.managers.appChatsManager.isPublic(chatId)
    ]);
    const isChannel = chat?._ === 'channel';
    const isMegagroup = isChannel && !!chat.pFlags.megagroup;
    let banOrRestrict = false;

    if(isChannel && canBanUsers) {
      if(chat.pFlags.creator) {
        banOrRestrict = true;
      } else {
        const participant = await this.managers.appProfileManager.getParticipant(chatId, participantPeerId).catch((): undefined => undefined);
        banOrRestrict = !!participant && canEditAdmin(chat, participant, rootScope.myId);
      }
    }

    return {
      reportSpam: isChannel,
      reportReaction: isMegagroup && isPublic,
      deleteAllMessages: isChannel && canDeleteMessages,
      deleteAllReactions: canDeleteMessages,
      banOrRestrict
    };
  }

  private async construct() {
    const fromPeerIds = this.reaction ?
      [this.reaction.participantPeerId] :
      filterUnique(this.messages.map(({fromId}) => fromId));
    const peerId = this.reaction?.message.peerId ?? this.messages[0].peerId;

    const stackedAvatars = new StackedAvatars({
      middleware: this.middlewareHelper.get(),
      avatarSize: 32
    });

    const loadPromises: Promise<any>[] = [];
    stackedAvatars.render(fromPeerIds.slice(0, 3), loadPromises);
    stackedAvatars.container.classList.add(`${className}-avatars`);
    this.header.prepend(stackedAvatars.container);

    const isSinglePeer = fromPeerIds.length === 1;
    const moderateOptions = await this.getModerateOptions(peerId);
    this.reportReaction = moderateOptions.reportReaction;
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
    this.fields = fields;

    const checkboxFields = new CheckboxFields({
      fields,
      listenerSetter: this.listenerSetter,
      round: true,
      onRowCreation: (row, info) => {
        if(!info.nestedTo || !info.peerRow) {
          return;
        }

        row.container.classList.add(`${className}-row`);

        const div = document.createElement('div');
        div.classList.add(`${className}-row-title`);
        const title = row.createTitle();

        const avatar = avatarNew({
          peerId: info.peerId,
          middleware: this.middlewareHelper.get(),
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
        this.updateReactionTitle();
        onAnyChange();
      },
      onExpand: () => {
        const duration = 300;
        const startTime = Date.now();
        animate(() => {
          this.scrollable.onScroll();
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
      this.chatPermissions = new ChatPermissions({
        appendTo: chatPermissionsContainer,
        chatId: peerId.toChatId(),
        listenerSetter: this.listenerSetter
      }, this.managers);
    }

    let onAnyChange: () => void;
    this.appendSolid(() => {
      const [banning, setBanning] = createSignal<PeerId[]>([]);
      const [collapsed, setCollapsed] = createSignal(true);
      const collapsedName = () => collapsed() ?
        (banning().length === 1 ? 'DeleteToggleRestrictUser' : 'DeleteToggleRestrictUsers') :
        (banning().length === 1 ? 'DeleteToggleBanUser' : 'DeleteToggleBanUsers');

      onAnyChange = () => {
        const peerIds = fields
        .filter((field) => field.action === 'ban' && field.checkboxField.checked && field.peerId)
        .map(({peerId}) => peerId);
        setBanning(peerIds);
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
        this.restricting = !collapsed();
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
          const scrollPosition = this.scrollable.scrollPosition + this.scrollable.clientSize;
          const scrollHeight = this.scrollable.scrollSize;
          const path = 712 + scrollHeight - scrollPosition;
          animate(() => {
            const progress = Math.min((Date.now() - startTime) / duration, 1);
            const newScrollPosition = scrollPosition + path * progress;
            this.scrollable.scrollPosition = newScrollPosition;
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
    });

    await Promise.all(loadPromises);

    this.show();
  }
}
