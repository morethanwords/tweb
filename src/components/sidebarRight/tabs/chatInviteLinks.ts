/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {hexToRgb, hslaToString, mixColors, rgbaToHsla} from '../../../helpers/color';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import createContextMenu from '../../../helpers/dom/createContextMenu';
import customProperties from '../../../helpers/dom/customProperties';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import paymentsWrapCurrencyAmount from '../../../helpers/paymentsWrapCurrencyAmount';
import tsNow from '../../../helpers/tsNow';
import {ExportedChatInvite, MessagesExportedChatInvite, MessagesExportedChatInvites} from '../../../layer';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import getPeerActiveUsernames from '../../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import {LangPackKey, i18n, joinElementsWith} from '../../../lib/langPack';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import wrapPlainText from '../../../lib/richTextProcessor/wrapPlainText';
import lottieLoader from '../../../lib/rlottie/lottieLoader';
import rootScope from '../../../lib/rootScope';
import Button from '../../button';
import {ButtonMenuItemOptionsVerifiable} from '../../buttonMenu';
import confirmationPopup from '../../confirmationPopup';
import {StarsAmount, StarsChange} from '../../popups/stars';
import SettingSection from '../../settingSection';
import {InviteLink} from '../../sidebarLeft/tabs/sharedFolder';
import {SliderSuperTabEventable} from '../../sliderTab';
import {UsernameRow} from '../../usernamesSection';
import wrapPeerTitle from '../../wrappers/peerTitle';
import {wrapLeftDuration} from '../../wrappers/wrapDuration';
import AppChatInviteLinkTab from './chatInviteLink';
import AppEditChatInviteLink from './editChatInviteLink';

type ChatInvite = ExportedChatInvite.chatInviteExported;

function isActiveInvite(invite: ChatInvite) {
  if(invite.pFlags.revoked) {
    return false;
  }

  if(invite.expire_date && invite.expire_date <= tsNow(true)) {
    return false;
  }

  if(invite.usage_limit && invite.usage_limit <= (invite.usage || 0)) {
    return false;
  }

  return true;
}

export class ChatInviteLink extends InviteLink {
  public subtitle: HTMLElement;

  constructor(public options: ConstructorParameters<typeof InviteLink>[0] & {
    actions: AppChatInviteLinksTab['actions'],
    withSubtitle?: boolean
  }) {
    super({
      ...options
    });

    if(options.withSubtitle) {
      this.subtitle = document.createElement('div');
      this.subtitle.classList.add('invite-link-subtitle', 'hide');
      this.container.append(this.subtitle);
    }
  }

  public setChatInvite(chatInvite: ChatInvite | string) {
    const isUsername = typeof(chatInvite) === 'string';
    const username = typeof(chatInvite) === 'string' ? chatInvite : undefined;
    this.setUrl(isUsername ? 't.me/' + username : chatInvite.link);

    if(this.subtitle) {
      if(!isUsername && chatInvite?.usage) {
        this.subtitle.replaceChildren(i18n('InviteLink.JoinedNew', [chatInvite.usage]));
      }

      this.subtitle.classList.toggle('hide', isUsername || !chatInvite?.usage);
    }

    let hasSomething: LangPackKey;
    if(!isUsername) {
      if(chatInvite.pFlags.revoked) {
        this.onButtonClick = () => this.options.actions.deleteLink();
        hasSomething = 'DeleteLink';
      } else if(!isActiveInvite(chatInvite)) {
        this.onButtonClick = () => this.options.actions.editLink();
        hasSomething = 'InviteLinks.Reactivate';
      }
    }

    if(!hasSomething) {
      hasSomething = 'ShareLink';
      this.onButtonClick = undefined;
    }

    this.buttonText.replaceChildren(i18n(hasSomething));
  }
}

export default class AppChatInviteLinksTab extends SliderSuperTabEventable {
  private chatId: ChatId;
  private adminId: UserId;
  public menuButtons: ButtonMenuItemOptionsVerifiable[];
  public actions: {
    revokeLink: () => void,
    deleteLink: () => void,
    editLink: () => void
  };

  public static getInitArgs(chatId: ChatId, adminId?: UserId) {
    return {
      animationData: !adminId && lottieLoader.loadAnimationFromURLManually('UtyanLinks'),
      invites: rootScope.managers.appChatInvitesManager.getExportedChatInvites({chatId, adminId}),
      invitesRevoked: rootScope.managers.appChatInvitesManager.getExportedChatInvites({chatId, adminId, revoked: true}),
      adminsInvites: !adminId && rootScope.managers.appChatInvitesManager.getAdminsWithInvites(chatId),
      chatFull: rootScope.managers.appProfileManager.getChatFull(chatId)
    };
  }

  public async init({
    chatId,
    adminId,
    p = AppChatInviteLinksTab.getInitArgs(chatId, adminId)
  }: {
    chatId: ChatId,
    adminId?: UserId,
    p?: ReturnType<typeof AppChatInviteLinksTab['getInitArgs']>
  }) {
    this.chatId = chatId;
    this.adminId = adminId;
    this.actions = {} as any;
    const loadPromises: Promise<any>[] = [];
    const middleware = this.middlewareHelper.get();
    const [chat, chatFull] = await Promise.all([
      this.managers.appChatsManager.getChat(this.chatId),
      p.chatFull
    ]);

    const usernames = getPeerActiveUsernames(chat);

    this.setTitle('InviteLinks');
    this.container.classList.add('chat-folders-container', 'chat-discussion-container');

    let stickerContainer: HTMLElement, caption: HTMLElement;
    if(!this.adminId) {
      stickerContainer = document.createElement('div');
      stickerContainer.classList.add('sticker-container');

      caption = document.createElement('div');
      caption.classList.add('caption');
      caption.append(i18n('ChannelLinkInfo'));
    }

    const wrapInviteTitle = (invite: ChatInvite) => {
      return invite.title ? wrapEmojiText(invite.title) : wrapPlainText(invite.link.split('://').pop());
    };

    let inviteLink: ChatInviteLink,
      menuInvite: ChatInvite,
      menuItem: K,
      primaryInvite: ChatInvite,
      chatInviteLinkTab: AppChatInviteLinkTab;
    const menuButtons: ButtonMenuItemOptionsVerifiable[] = this.menuButtons = [{
      icon: 'copy',
      text: 'CopyLink',
      onClick: () => inviteLink.copyLink(menuInvite?.link),
      verify: () => !menuInvite?.pFlags?.revoked
    }, {
      icon: 'forward',
      text: 'ShareLink',
      onClick: () => {
        const url = menuInvite?.link || inviteLink.url;
        inviteLink.shareLink(url);
      },
      verify: () => !menuInvite ? true : isActiveInvite(menuInvite)
    }, {
      icon: 'edit',
      text: 'InviteLinks.Edit',
      onClick: this.actions.editLink = async() => {
        const _menuItem = menuItem;
        const tab = this.slider.createTab(AppEditChatInviteLink);
        tab.eventListener.addEventListener('finish', (invite) => {
          _menuItem.destroy();
          _menuItem.row.container.replaceWith(createRow(invite).container);
        });
        await tab.open({
          chatId: this.chatId,
          invite: menuInvite
        });
        if(chatInviteLinkTab) {
          this.slider.removeTabFromHistory(chatInviteLinkTab);
        }
      },
      verify: () => menuInvite && !menuInvite.pFlags.revoked
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'RevokeLink',
      onClick: this.actions.revokeLink = async() => {
        const _menuItem = menuItem;
        await confirmationPopup({
          titleLangKey: 'RevokeLink',
          descriptionLangKey: 'RevokeAlert',
          button: {
            langKey: 'RevokeButton',
            isDanger: true
          }
        });

        const invite = _menuItem?.invite || primaryInvite;

        const chatInvite = await this.managers.appChatInvitesManager.editExportedChatInvite({
          chatId: this.chatId,
          link: invite.link,
          revoked: true
        });

        const editedInvite = chatInvite.invite as ChatInvite;
        const newInvite = (chatInvite as MessagesExportedChatInvite.messagesExportedChatInviteReplaced).new_invite as ChatInvite;

        if(_menuItem) {
          if(newInvite) {
            _menuItem.row.container.replaceWith(createRow(newInvite).container);
          }

          revokedLinks.content.prepend(_menuItem.row.container);
          _menuItem.update(editedInvite);
        } else {
          const row = createRow(editedInvite);
          revokedLinks.content.prepend(row.container);
          primaryInvite = newInvite;
          inviteLink.setChatInvite(primaryInvite);
        }

        onRevokedLinksUpdate();

        chatInviteLinkTab?.close();
      },
      verify: () => menuInvite ? !menuInvite.pFlags.revoked : !!primaryInvite
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'DeleteLink',
      onClick: this.actions.deleteLink = () => {
        const _menuItem = menuItem;
        this.managers.appChatInvitesManager.deleteExportedChatInvite(
          this.chatId,
          _menuItem.invite.link
        ).then(() => {
          _menuItem.destroy(true);
          onRevokedLinksUpdate();

          chatInviteLinkTab?.close();
        });
      },
      verify: () => !!menuInvite?.pFlags?.revoked
    }];

    let inviteLinkSection: SettingSection;
    {
      const section = inviteLinkSection = new SettingSection({
        name: 'InviteLink',
        caption: this.adminId ? 'ManageLinks.Admin.Permanent.Desc' : undefined,
        captionArgs: this.adminId ? await Promise.all([
          wrapPeerTitle({peerId: this.adminId.toPeerId(false)}),
          wrapPeerTitle({peerId: this.chatId.toPeerId(true)})
        ]) : undefined
      });

      inviteLink = new ChatInviteLink({
        buttons: menuButtons,
        listenerSetter: this.listenerSetter,
        actions: this.actions,
        withSubtitle: true
      });

      attachClickEvent(inviteLink.subtitle, () => {
        // menuInvite = primaryInvite;
        openLink(primaryInvite);
      }, {listenerSetter: this.listenerSetter});

      section.content.append(inviteLink.container);
    }

    let additionalLinks: SettingSection;
    {
      const section = additionalLinks = new SettingSection({
        name: this.adminId ? 'LinksCreatedByThisAdmin' : 'InviteLinks.Additional',
        caption: this.adminId ? undefined : 'InviteLinks.Description'
      });

      if(!this.adminId) {
        const btn = Button('btn-primary btn-transparent primary', {icon: 'plus', text: 'CreateNewLink'});

        attachClickEvent(btn, () => {
          const tab = this.slider.createTab(AppEditChatInviteLink);
          tab.eventListener.addEventListener('finish', (chatInvite) => {
            const row = createRow(chatInvite);
            if(primaryInvite) {
              section.content.prepend(row.container);
            } else {
              section.content.firstElementChild.after(row.container);
            }
          });
          tab.open({chatId: this.chatId});
        }, {listenerSetter: this.listenerSetter});

        section.content.append(btn);
        section.content = section.generateContentElement();
      }
    }

    let adminsLinks: SettingSection;
    if(!this.adminId) {
      const section = adminsLinks = new SettingSection({name: 'LinksCreatedByOtherAdmins'});

      const promise = p.adminsInvites.then((adminsInvites) => {
        let {admins} = adminsInvites;
        admins = admins.filter((admin) => admin.admin_id.toPeerId(false) !== rootScope.myId);
        if(!admins.length) {
          section.container.classList.add('hide');
          return;
        }

        const chatlist = appDialogsManager.createChatList();
        const loadPromises: Promise<any>[] = [];
        admins.forEach((admin) => {
          const peerId = admin.admin_id.toPeerId(false);
          const {dom} = appDialogsManager.addDialogNew({
            peerId,
            container: chatlist,
            rippleEnabled: true,
            avatarSize: 'abitbigger',
            append: true,
            loadPromises,
            wrapOptions: {
              middleware: this.middlewareHelper.get()
            }
          });

          dom.lastMessageSpan.append(i18n('InviteLinkCount', [admin.invites_count]));
        });

        attachClickEvent(chatlist, (e) => {
          const target = findUpClassName(e.target, 'chatlist-chat');
          if(!target) {
            return;
          }

          const peerId = target.dataset.peerId.toPeerId();
          const tab = this.slider.createTab(AppChatInviteLinksTab);
          tab.open({
            chatId: this.chatId,
            adminId: peerId.toUserId()
          });
        }, {listenerSetter: this.listenerSetter});

        section.content.append(chatlist);

        return Promise.all(loadPromises);
      }, () => {
        section.container.remove();
      });

      loadPromises.push(promise);
    }

    let revokedLinks: SettingSection;
    {
      const section = revokedLinks = new SettingSection({name: 'RevokedLinks'});

      const btn = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'DeleteAllRevokedLinks'});

      attachClickEvent(btn, async() => {
        await confirmationPopup({
          titleLangKey: 'DeleteAllRevokedLinks',
          descriptionLangKey: 'ManageLinks.DeleteAll.Confirm',
          button: {
            langKey: 'Delete',
            isDanger: true
          }
        });

        const toggle = toggleDisability(btn, true);
        await this.managers.appChatInvitesManager.deleteRevokedExportedChatInvites(this.chatId, this.adminId);
        toggle();

        Array.from(section.content.children).forEach((el) => {
          const cache = invitesMap.get(el as HTMLElement);
          cache.destroy(true);
        });
        onRevokedLinksUpdate();
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btn);
      section.content = section.generateContentElement();
    }

    this.scrollable.append(...[
      stickerContainer,
      caption,
      inviteLinkSection.container,
      additionalLinks.container,
      adminsLinks?.container,
      revokedLinks.container
    ].filter(Boolean));

    const openLink = (invite: ChatInvite) => {
      const tab = chatInviteLinkTab = this.slider.createTab(AppChatInviteLinkTab);
      tab.eventListener.addEventListener('close', () => {
        chatInviteLinkTab = menuItem = menuInvite = undefined;
      });
      tab.open(this.chatId, invite, this, menuItem?.update);
    };

    attachClickEvent(this.scrollable.container, (e) => {
      const container = findUpClassName(e.target, 'is-link');
      if(!container) {
        return;
      }

      menuItem = invitesMap.get(container);
      menuInvite = menuItem.invite;
      openLink(menuInvite);
    }, {listenerSetter: this.listenerSetter});

    createContextMenu({
      buttons: menuButtons,
      listenTo: this.scrollable.container,
      findElement: (e) => {
        const container = findUpClassName(e.target, 'is-link');
        if(container) {
          menuItem = invitesMap.get(container);
          menuInvite = menuItem.invite;
        }

        return container;
      },
      onClose: () => menuItem = menuInvite = undefined,
      middleware,
      listenerSetter: this.listenerSetter
    });

    const loadAnimationPromise = stickerContainer && p.animationData.then(async(cb) => {
      const player = await cb({
        container: stickerContainer,
        loop: true,
        autoplay: true,
        width: 120,
        height: 120
      });

      return lottieLoader.waitForFirstFrame(player);
    });

    type K = {
      row: UsernameRow,
      invite: ChatInvite,
      update: (newInvite?: ChatInvite) => void,
      destroy: (unmount?: boolean) => void
    };
    const invitesMap: Map<HTMLElement, K> = new Map();
    const updateCallbacks: Set<() => void> = new Set();

    const createRow = (invite: ChatInvite) => {
      let priceElement: HTMLElement, subtitleRight: HTMLElement;
      if(invite.subscription_pricing) {
        priceElement = StarsAmount({
          stars: invite.subscription_pricing.amount
        }) as HTMLElement;
        subtitleRight = i18n('Stars.Subscriptions.PerMonth');
      }

      const row = new UsernameRow(
        true,
        invite.subscription_pricing ? 'link_paid' : undefined,
        invite.subscription_pricing ? 'green' : undefined,
        priceElement,
        subtitleRight
      );
      row.title.replaceChildren(wrapInviteTitle(invite));

      if(!invite.expire_date && !invite.pFlags.revoked && !invite.subscription_pricing) {
        delete row.media.dataset.color;
      }

      let onClean: () => void;

      const destroy = (unmount?: boolean) => {
        onClean?.();
        invitesMap.delete(row.container);
        if(unmount) {
          row.container.remove();
        }
      };

      const update = (newInvite?: ChatInvite) => {
        if(newInvite) {
          invite = cache.invite = newInvite;
        }

        const elements: HTMLElement[] = [];
        const joined = invite.usage || 0;
        const requested = invite.requested || 0;
        const time = tsNow(true);
        const expireDate = invite.expire_date;
        const isExpired = expireDate && expireDate <= time;
        const isLimit = joined && joined >= invite.usage_limit;
        const timeLeft = expireDate ? Math.max(0, expireDate - time) : undefined;

        if(invite.pFlags.revoked) {
          elements.push(
            i18n('InviteLink.JoinedRevoked'),
            i18n('ExportedInvitation.Status.Revoked')
          );

          row.media.dataset.color = 'archive';
          if(circle) {
            circle.parentElement.remove();
            circle = undefined;
          }
          onClean?.();
        } else {
          if(joined) {
            elements.push(i18n('InviteLink.JoinedNew', [joined]));

            if(isLimit) {
              elements.push(i18n('InviteLinks.LimitReached'));
              row.media.dataset.color = 'red';
            } else if(invite.usage_limit) {
              elements.push(i18n('PeopleJoinedRemaining', [invite.usage_limit - joined]));
            } else if(requested) {
              elements.push(i18n('JoinRequests', [requested]));
            }
          } else if(requested) {
            elements.push(i18n('JoinRequests', [requested]));
          } else if(invite.usage_limit && !isExpired) {
            elements.push(i18n('CanJoin', [invite.usage_limit]));
          } else {
            elements.push(i18n(isExpired ? 'InviteLink.JoinedRevoked' : 'Chat.VoiceChat.JoinLink.Participants_ZeroValueHolder'));
          }
        }

        if(!invite.pFlags.revoked && expireDate) {
          if(!isExpired) {
            elements.push(i18n('InviteLink.Sticker.TimeLeft', [wrapLeftDuration(timeLeft)]));
          } else {
            row.media.dataset.color = 'red';
            elements.push(i18n('ExportedInvitation.Status.Expired'));
            onClean?.();
          }
        }

        if(!invite.pFlags.revoked && ((expireDate && !isExpired) || (invite.usage_limit && !isLimit))) {
          const limitProgress = invite.usage_limit ? joined / invite.usage_limit : undefined;
          const timeProgress = expireDate ? 1 - timeLeft / (expireDate - (invite.start_date || invite.date)) : undefined;
          const progress = Math.max(limitProgress ?? 0, timeProgress ?? 0);

          const color1 = hexToRgb(customProperties.getProperty('green-color'));
          const color2 = hexToRgb(customProperties.getProperty('danger-color'));
          const mixedColor = mixColors(color2, color1, progress);
          const hsla = rgbaToHsla(...mixedColor);
          hsla.s = Math.max(55, hsla.s);
          row.media.style.setProperty('--color', hslaToString(hsla));

          if(circle) {
            totalLength ??= circle.getTotalLength();
            circle.style.strokeDasharray = `${totalLength * (1 - progress)}, ${totalLength}`;

            if(isExpired) {
              const c = () => {
                _circle.parentElement.remove();
              };

              const _circle = circle;
              circle = undefined;

              setTimeout(c, 400);
            }
          }
        }

        row.subtitle.replaceChildren(...joinElementsWith(elements, ' • '));
      };

      const cache: K = {row, invite, update, destroy};
      invitesMap.set(row.container, cache);

      let circle: SVGCircleElement, totalLength = 146.70338439941406;
      if((invite.expire_date || invite.usage_limit) && isActiveInvite(invite)) {
        if(invite.expire_date) {
          onClean = () => {
            // invitesMap.delete(row);
            updateCallbacks.delete(update);
          };
          updateCallbacks.add(update);
          middleware.onDestroy(onClean);
        }

        row.media.insertAdjacentHTML('beforeend', `
          <svg class="usernames-username-icon-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 51 51">
            <circle class="usernames-username-icon-circle" cx="25.5" cy="25.5" r="23.5"/>
          </svg>
        `);

        circle = row.media.lastElementChild.firstElementChild as any;
      }

      update();

      return row;
    };

    const onRevokedLinksUpdate = () => {
      revokedLinks.container.classList.toggle('hide', !revokedLinks.content.childElementCount);
    };

    const loadLinksPromise = Promise.all([p.invites, p.invitesRevoked]).then(([chatInvites, chatInvitesRevoked]) => {
      if(this.adminId) {
        primaryInvite = chatInvites.invites[0] as ChatInvite;
      } else if(!usernames.length) {
        primaryInvite = chatFull.exported_invite as ChatInvite;
      }

      inviteLink.setChatInvite(primaryInvite || usernames[0]);

      ([
        [chatInvites, additionalLinks],
        [chatInvitesRevoked, revokedLinks]
      ] as Array<[MessagesExportedChatInvites, SettingSection]>).forEach(([chatInvites, section]) => {
        (chatInvites.invites as ChatInvite[]).forEach((invite) => {
          if(primaryInvite?.link === invite.link) {
            return;
          }

          const row = createRow(invite);
          section.content.append(row.container);
        });
      });

      onRevokedLinksUpdate();

      const update = () => {
        updateCallbacks.forEach((cb) => cb());
      };

      const updateInterval = setInterval(update, 1000);
      middleware.onDestroy(() => {
        invitesMap.forEach(({destroy}) => destroy());
        clearInterval(updateInterval);
      });
      this.listenerSetter.add(rootScope)('theme_changed', () => {
        invitesMap.forEach(({update}) => update());
      });
    });

    loadPromises.push(loadAnimationPromise, loadLinksPromise);
    return Promise.all(loadPromises);
  }
}
