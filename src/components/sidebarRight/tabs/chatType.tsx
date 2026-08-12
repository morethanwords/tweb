import {Component} from 'solid-js';
import {copyTextToClipboard} from '@helpers/clipboard';
import {randomLong} from '@helpers/random';
import {Chat, ChatFull, ExportedChatInvite} from '@layer';
import Button from '@components/button';
import {setButtonLoader} from '@components/putPreloader';
import RadioField from '@components/radioField';
import Row, {RadioFormFromRows} from '@components/row';
import {toastNew} from '@components/toast';
import {UsernameInputField} from '@components/usernameInputField';
import {i18n} from '@lib/langPack';
import PopupPeer from '@components/popups/peer';
import ButtonCorner from '@components/buttonCorner';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import CheckboxField from '@components/checkboxField';
import rootScope from '@lib/rootScope';
import SettingSection from '@components/settingSection';
import UsernamesSection from '@components/usernamesSection';
import getPeerEditableUsername from '@appManagers/utils/peers/getPeerEditableUsername';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {purchaseUsernameCaption} from '@components/sidebarLeft/tabs/purchaseUsernameCaption';
import confirmationPopup from '@components/confirmationPopup';
import PopupElement from '@components/popups';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {openUserPermissionsTab, type AppChatTypeTab} from '@components/solidJsTabs/tabs';
import anchorCallback from '@helpers/dom/anchorCallback';

const ChatType: Component = () => {
  const [tab] = useSuperTab<typeof AppChatTypeTab>();
  const promiseCollector = usePromiseCollector();
  const {apiManagerProxy} = useHotReloadGuard();
  const {chatId, chatFull} = tab.payload;

  promiseCollector.collect((async() => {
    tab.container.classList.add('edit-peer-container', 'group-type-container');

    const isBroadcast = await tab.managers.appChatsManager.isBroadcast(chatId);
    const linkedChatId = (chatFull as ChatFull.channelFull).linked_chat_id;

    tab.title.replaceChildren(i18n(isBroadcast ? 'ChannelType' : 'GroupType'));

    const section = new SettingSection({
      name: isBroadcast ? 'ChannelType' : 'GroupType'
    });

    const random = randomLong();
    const privateRow = new Row({
      radioField: new RadioField({
        langKey: isBroadcast ? 'ChannelPrivate' : 'MegaPrivate',
        name: random,
        value: 'private'
      }),
      subtitleLangKey: isBroadcast ? 'ChannelPrivateInfo' : 'MegaPrivateInfo'
    });
    const publicRow = new Row({
      radioField: new RadioField({
        langKey: isBroadcast ? 'ChannelPublic' : 'MegaPublic',
        name: random,
        value: 'public'
      }),
      subtitleLangKey: isBroadcast ? 'ChannelPublicInfo' : 'MegaPublicInfo'
    });
    const form = RadioFormFromRows([privateRow, publicRow], (value) => {
      const a: HTMLElement[][] = [[privateSection.container], [publicContainer]];
      if(value === 'public') a.reverse();

      a[0].forEach((container) => container.classList.remove('hide'));
      a[1].forEach((container) => container.classList.add('hide'));

      onChange();

      if(joinRequestSection && !linkedChatId && !isBroadcast) {
        joinRequestSection.container.classList.toggle('hide', value !== 'public');
      }
    });

    let chat: Chat = apiManagerProxy.getChat(chatId);

    const chatUpdateListeners: {[type in 'basic']: (() => void)[]} = {basic: []};
    const addChatUpdateListener = (callback: () => void, type: 'basic' = 'basic') => {
      chatUpdateListeners[type].push(callback);
    };

    tab.listenerSetter.add(rootScope)('chat_update', (updatedChatId) => {
      if(chatId === updatedChatId) {
        chat = apiManagerProxy.getChat(chatId) as typeof chat;
        chatUpdateListeners['basic'].forEach((callback) => callback());
      }
    });

    section.content.append(form);

    const privateSection = new SettingSection({});

    const linkRow = new Row({
      title: (chatFull.exported_invite as ExportedChatInvite.chatInviteExported).link,
      subtitleLangKey: isBroadcast ? 'ChannelPrivateLinkHelp' : 'MegaPrivateLinkHelp',
      clickable: () => {
        copyTextToClipboard((chatFull.exported_invite as ExportedChatInvite.chatInviteExported).link);
        toastNew({langPackKey: 'LinkCopied'});
      },
      listenerSetter: tab.listenerSetter
    });

    const btnRevoke = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'RevokeLink'});

    attachClickEvent(btnRevoke, () => {
      PopupElement.createPopup(PopupPeer, 'revoke-link', {
        buttons: [{
          langKey: 'RevokeButton',
          callback: () => {
            const toggle = toggleDisability([btnRevoke], true);

            tab.managers.appProfileManager.getChatInviteLink(chatId, true).then((link) => {
              toggle();
              linkRow.title.textContent = link;
            });
          }
        }],
        titleLangKey: 'RevokeLink',
        descriptionLangKey: 'RevokeAlert'
      }).show();
    }, {listenerSetter: tab.listenerSetter});

    privateSection.content.append(linkRow.container, btnRevoke);

    const publicSection = new SettingSection({
      caption: true,
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 't.me';
    const placeholder = `${shortDomain}/`;

    let changedPrivacy: boolean, changedJoinToSend: boolean, changedJoinRequest: boolean;
    const onChange = () => {
      changedPrivacy = (privateRow.radioField.checked && (originalValue !== placeholder)) ||
        (linkInputField.isValidToChange() && linkInputField.input.classList.contains('valid'));
      changedJoinToSend = !!joinToSendRow && joinToSendRow.checkboxField.checked !== originalJoinToSend;
      changedJoinRequest = !!joinRequestRow && joinRequestRow.checkboxField.checked !== originalJoinRequest;
      applyBtn.classList.toggle('is-visible', changedPrivacy || changedJoinToSend || changedJoinRequest);

      const {error} = linkInputField;
      const isPurchase = error?.type === 'USERNAME_PURCHASE_AVAILABLE';
      setUsername(isPurchase ? linkInputField.getValue() : undefined);
    };

    const linkInputField = new UsernameInputField({
      label: 'SetUrlPlaceholder',
      name: 'group-public-link',
      plainText: true,
      listenerSetter: tab.listenerSetter,
      availableText: 'Link.Available',
      invalidText: 'Link.Invalid',
      takenText: 'Link.Taken',
      onChange: onChange,
      peerId: chatId.toPeerId(true),
      head: placeholder
    }, tab.managers);

    const {setUsername, element: p} = purchaseUsernameCaption();

    publicSection.caption.append(
      p,
      i18n(isBroadcast ? 'Channel.UsernameAboutChannel' : 'Channel.UsernameAboutGroup')
    );

    const usernamesSection = new UsernamesSection({
      peerId: chatId.toPeerId(true),
      peer: chat as Chat.channel,
      listenerSetter: tab.listenerSetter,
      usernameInputField: linkInputField,
      middleware: tab.middlewareHelper.get()
    });

    const publicContainer = document.createElement('div');
    publicContainer.append(publicSection.container, usernamesSection.container);

    const originalValue = placeholder + (getPeerEditableUsername(chat as Chat.channel) || '');

    inputWrapper.append(linkInputField.container);
    publicSection.content.append(inputWrapper);

    const applyBtn = ButtonCorner({icon: 'check', className: 'is-visible'});
    tab.content.append(applyBtn);

    const getUsername = () => publicRow.radioField.checked ? linkInputField.getValue() : '';

    const changePrivacy = async() => {
      const username = getUsername();
      const channelId = await tab.managers.appChatsManager.migrateChat(chatId);
      if(!username) {
        return tab.managers.appChatsManager.makeChannelPrivate(channelId);
      } else {
        return tab.managers.appChatsManager.updateUsername(channelId, username);
      }
    };

    const confirmChangingPrivacy = async() => {
      const username = getUsername();
      if(!username) {
        const chat = apiManagerProxy.getChat(chatId);
        const wasUsername = getPeerEditableUsername(chat as Chat.channel);
        if(wasUsername) {
          await confirmationPopup({
            descriptionLangKey: isBroadcast ? 'ChannelVisibility.Confirm.MakePrivate.Channel' : 'ChannelVisibility.Confirm.MakePrivate.Group',
            descriptionLangArgs: [wasUsername],
            button: {
              langKey: 'OK'
            }
          });
        }
      }
    };

    attachClickEvent(applyBtn, async() => {
      if(changedPrivacy) {
        await confirmChangingPrivacy();
      }

      const unsetLoader = setButtonLoader(applyBtn);
      try {
        if(changedPrivacy) {
          await changePrivacy();
        }

        if(changedJoinToSend || changedJoinRequest) {
          const joinToSendValue = joinToSendRow?.checkboxField.checked;
          const joinRequestValue = joinRequestRow.checkboxField.checked;
          const callbacks = [
            changedJoinToSend && (() => tab.managers.appChatsManager.toggleJoinToSend(
              chatId,
              joinToSendValue
            )),
            changedJoinRequest && (() => tab.managers.appChatsManager.toggleJoinRequest(
              chatId,
              joinRequestValue
            ))
          ].filter(Boolean);

          for(const callback of callbacks) {
            await handleChannelsTooMuch(callback);
          }
        }

        tab.close();
      } catch(err) {
        console.error('changePrivacy error', err);
        unsetLoader();
      }
    }, {listenerSetter: tab.listenerSetter});

    tab.scrollable.append(section.container, privateSection.container, publicContainer);

    let joinRequestSection: SettingSection, joinToSendRow: Row, joinRequestRow: Row, originalJoinToSend: boolean, originalJoinRequest: boolean;
    // a channel gets the same approval switch: it gates its invite links, and it is the only place
    // where the guard bot behind those approvals can be seen and taken off again
    {
      const section = joinRequestSection = new SettingSection({
        name: isBroadcast ? undefined : 'ChannelSettingsJoinTitle',
        caption: true
      });

      if(!isBroadcast) {
        joinToSendRow = new Row({
          titleLangKey: 'ChannelSettingsJoinToSend',
          checkboxField: new CheckboxField({
            toggle: true
          })
        });
      }

      joinRequestRow = new Row({
        titleLangKey: isBroadcast ? 'ChannelSettingsJoinRequestChannel' : 'ChannelSettingsJoinRequest',
        checkboxField: new CheckboxField({
          toggle: true
        })
      });

      const canToggleJoinRequest = () => {
        if(isBroadcast) return true;
        return linkedChatId ? joinToSendRow.checkboxField.checked : !publicContainer.classList.contains('hide');
      };

      const toggleJoinRequestVisibility = () => {
        const can = canToggleJoinRequest();
        joinRequestRow.container.classList.toggle('hide', !can);
        if(!can && joinRequestRow.checkboxField.checked) {
          joinRequestRow.checkboxField.checked = false;
        }
      };

      const onChatUpdate = () => {
        originalJoinToSend = !!(chat as Chat.channel).pFlags.join_to_send;
        originalJoinRequest = !!(chat as Chat.channel).pFlags.join_request;
        joinToSendRow?.checkboxField.setValueSilently(originalJoinToSend);
        joinRequestRow.checkboxField.setValueSilently(originalJoinRequest);
        toggleJoinRequestVisibility();
        onChange();
      };

      [joinToSendRow, joinRequestRow].filter(Boolean).forEach((row) => {
        tab.listenerSetter.add(row.checkboxField.input)('change', () => {
          if(joinToSendRow === row) {
            toggleJoinRequestVisibility();
          }

          onChange();
        });
      });

      if(!linkedChatId) {
        joinToSendRow?.container.classList.add('hide');
      }

      addChatUpdateListener(onChatUpdate);
      onChatUpdate();

      // a guard bot (channelFull.guard_bot_id) greets new members through its own mini app instead of
      // the admins approving them by hand — surface which bot it is, and let the admin open its rights
      const updateCaption = async() => {
        const guardBotId = (await tab.managers.appProfileManager.getCachedFullChat(chatId) as ChatFull.channelFull)?.guard_bot_id;
        const nodes: (Node | string)[] = [
          i18n(linkedChatId && !isBroadcast ? 'ChannelSettingsJoinToSendInfo' : 'ChannelSettingsJoinRequestInfo')
        ];

        // the bot is named by its @username, like on iOS — a display title says much less about
        // which bot this actually is, and a bot without one gets no mention at all
        const guardBotUsername = guardBotId &&
          getPeerActiveUsernames(await tab.managers.appUsersManager.getUser(guardBotId.toUserId()))[0];
        if(guardBotUsername) {
          const peerId = guardBotId.toPeerId(false);
          const anchor = anchorCallback(async() => {
            const participant = await tab.managers.appProfileManager.getParticipant(chatId, peerId);
            if(participant) {
              openUserPermissionsTab(tab.slider, chatId, participant, true);
            }
          });
          anchor.append('@' + guardBotUsername);
          nodes.push(' ', i18n('GuardBotManagedBy', [anchor]));
        }

        section.caption.replaceChildren(...nodes);
      };

      await updateCaption();
      tab.listenerSetter.add(rootScope)('chat_full_update', (updatedChatId) => {
        if(chatId === updatedChatId) {
          updateCaption();
        }
      });

      section.content.append(...[joinToSendRow?.container, joinRequestRow.container].filter(Boolean));
      tab.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({
        name: 'SavingContentTitle',
        caption: isBroadcast ? 'RestrictSavingContentInfoChannel' : 'RestrictSavingContentInfoGroup'
      });

      const checkboxField = new CheckboxField({toggle: true});
      const row = new Row({
        titleLangKey: 'RestrictSavingContent',
        checkboxField
      });

      tab.listenerSetter.add(checkboxField.input)('change', () => {
        const toggle = row.toggleDisability(true);
        tab.managers.appProfileManager.toggleNoForwards(chatId.toPeerId(true), checkboxField.checked).then(() => {
          toggle();
        });
      });

      const onChatUpdate = () => {
        checkboxField.setValueSilently(!!(chat as Chat.channel).pFlags.noforwards);
      };

      addChatUpdateListener(onChatUpdate);
      onChatUpdate();

      section.content.append(row.container);

      tab.scrollable.append(section.container);
    }

    (originalValue !== placeholder || getPeerActiveUsernames(chat as Chat.channel).length ? publicRow : privateRow).radioField.checked = true;
    linkInputField.setOriginalValue(originalValue, true);
  })());

  return null;
};

export default ChatType;
