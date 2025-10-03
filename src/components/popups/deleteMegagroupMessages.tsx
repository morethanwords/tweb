/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton} from '.';
import filterUnique from '../../helpers/array/filterUnique';
import {Message} from '../../layer';
import I18n, {FormatterArguments, i18n, LangPackKey} from '../../lib/langPack';
import Section from '../section';
import StackedAvatars from '../stackedAvatars';
import {createEffect, createSignal} from 'solid-js';
import CheckboxFields, {CheckboxFieldsField} from '../checkboxFields';
import wrapPeerTitle from '../wrappers/peerTitle';
import flatten from '../../helpers/array/flatten';
import {avatarNew} from '../avatarNew';
import PeerTitle from '../peerTitle';
import Row from '../rowTsx';
import {IconTsx} from '../iconTsx';
import classNames from '../../helpers/string/classNames';
import {ChatPermissions} from '../sidebarRight/tabs/groupPermissions';
import {animate} from '../../helpers/animation';

const className = 'popup-delete-megagroup-messages';

type DeleteCheckboxFieldsField = CheckboxFieldsField & {
  peerId?: PeerId,
  action: 'report' | 'delete' | 'ban'
};

export default class PopupDeleteMegagroupMessages extends PopupElement {
  private messages: (Message.message | Message.messageService)[];
  private fields: DeleteCheckboxFieldsField[];
  private restricting: boolean;
  private chatPermissions: ChatPermissions;
  private onConfirm: () => void;

  constructor(options: {
    messages: (Message.message | Message.messageService)[],
    onConfirm?: () => void
  }) {
    super(className, {
      body: true,
      scrollable: true,
      title: i18n('DeleteOptionsTitle', [options.messages.length]),
      overlayClosable: true,
      buttons: addCancelButton([{
        langKey: 'DeleteProceedBtn',
        isDanger: true,
        callback: () => this.onConfirmClick(),
        iconLeft: 'delete_filled'
      }])
    });

    this.messages = options.messages;
    this.onConfirm = options.onConfirm;

    this.construct();
  }

  private async onConfirmClick() {
    const byPeers = this.fields.reduce((acc, field) => {
      let set = acc.get(field.peerId);
      if(!set) {
        acc.set(field.peerId, set = new Set());
      }

      if(field.checkboxField.checked) {
        set.add(field.action);
      }
      return acc;
    }, new Map<PeerId, Set<DeleteCheckboxFieldsField['action']>>());

    const mids = this.messages.map(({mid}) => mid);
    const peerId = this.messages[0].peerId;
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
        promises.push(managers.appMessagesManager.reportSpamMessages(peerId, fromId, mids));
      }

      if(actions.has('delete')) {
        promises.push(managers.appMessagesManager.doFlushHistory({peerId, justClear: false, revoke: true, participantPeerId: fromId}));
      }
    }

    managers.appMessagesManager.deleteMessages(peerId, mids, true);

    this.onConfirm?.();
    return true;
  }

  private async construct() {
    const fromPeerIds = filterUnique(this.messages.map(({fromId}) => fromId));
    const peerId = this.messages[0].peerId;

    const stackedAvatars = new StackedAvatars({
      middleware: this.middlewareHelper.get(),
      avatarSize: 32
    });

    const loadPromises: Promise<any>[] = [];
    stackedAvatars.render(fromPeerIds.slice(0, 3), loadPromises);
    stackedAvatars.container.classList.add(`${className}-avatars`);
    this.header.prepend(stackedAvatars.container);

    const isSinglePeer = fromPeerIds.length === 1;

    const actions: {
      action: DeleteCheckboxFieldsField['action'],
      peerIds: PeerId[],
      langKey: LangPackKey,
      langArgs?: FormatterArguments,
      callback?: () => void
    }[] = [{
      action: 'report',
      peerIds: fromPeerIds,
      langKey: 'DeleteReportSpam'
    }, {
      action: 'delete',
      peerIds: fromPeerIds,
      langKey: isSinglePeer ? 'DeleteAllFrom' : 'DeleteAllFromUsers',
      langArgs: isSinglePeer ? [await wrapPeerTitle({peerId: fromPeerIds[0], onlyFirstName: true})] : undefined
    }, {
      action: 'ban',
      peerIds: fromPeerIds,
      langKey: isSinglePeer ? 'DeleteBan' : 'DeleteBanUsers',
      langArgs: isSinglePeer ? [await wrapPeerTitle({peerId: fromPeerIds[0], onlyFirstName: true})] : undefined
    }];

    const nameStart = 'delete-fields';

    const join = (...args: string[]) => [nameStart, ...args].join('-');

    const wrap = (item: typeof actions[number]): DeleteCheckboxFieldsField[] => {
      const nested = isSinglePeer ? [] : item.peerIds.map((peerId) => {
        const name = join(item.action, '' + peerId);
        const field: DeleteCheckboxFieldsField = {
          action: item.action,
          name,
          peerId
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

    const fields = this.fields = flatten(actions.map(wrap));
    const checkboxFields = new CheckboxFields({
      fields,
      listenerSetter: this.listenerSetter,
      round: true,
      onRowCreation: (row, info) => {
        if(!info.nestedTo) {
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

    const chatPermissionsContainer = document.createElement('div');
    this.chatPermissions = new ChatPermissions({
      appendTo: chatPermissionsContainer,
      chatId: peerId.toChatId(),
      listenerSetter: this.listenerSetter
    }, this.managers);

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
          <Section name="DeleteAdditionalActions" noShadow noDelimiter>
            {flatten(createdFields)}
          </Section>
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
        </>
      );
    });

    await Promise.all(loadPromises);

    this.show();
  }
}
