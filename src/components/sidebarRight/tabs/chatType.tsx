import {Component, createSignal} from 'solid-js';
import {copyTextToClipboard} from '@helpers/clipboard';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import {Chat, ChatFull, ExportedChatInvite} from '@layer';
import Button from '@components/button';
import {setButtonLoader} from '@components/putPreloader';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RadioFormTsx, {type RadioFormTsxValue} from '@components/radioFormTsx';
import Row from '@components/rowTsx';
import {toastNew} from '@components/toast';
import {UsernameInputField} from '@components/usernameInputField';
import {i18n} from '@lib/langPack';
import showPeerPopup from '@components/popups/peer';
import ButtonCorner from '@components/buttonCorner';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import rootScope from '@lib/rootScope';
import Section from '@components/section';
import UsernamesSection from '@components/usernamesSection';
import getPeerEditableUsername from '@appManagers/utils/peers/getPeerEditableUsername';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {purchaseUsernameCaption} from '@components/sidebarLeft/tabs/purchaseUsernameCaption';
import confirmationPopup from '@components/confirmationPopup';
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
    const privacySignal = createSignal<'private' | 'public'>();
    const joinToSendSignal = createSignal(false);
    const joinRequestSignal = createSignal(false);
    const noForwardsSignal = createSignal(false);
    const noForwardsBusySignal = createSignal(false);
    const privacyValues: RadioFormTsxValue<'private' | 'public'>[] = [{
      langPackKey: isBroadcast ? 'ChannelPrivate' : 'MegaPrivate',
      subtitle: i18n(isBroadcast ? 'ChannelPrivateInfo' : 'MegaPrivateInfo'),
      value: 'private'
    }, {
      langPackKey: isBroadcast ? 'ChannelPublic' : 'MegaPublic',
      subtitle: i18n(isBroadcast ? 'ChannelPublicInfo' : 'MegaPublicInfo'),
      value: 'public'
    }];

    tab.title.replaceChildren(i18n(isBroadcast ? 'ChannelType' : 'GroupType'));

    const publicContainer = document.createElement('div');
    let joinRequestSection: HTMLElement;
    let onChange = () => {};
    const onPrivacyChange = (value: 'private' | 'public') => {
      privacySignal[1](value);
      const a: HTMLElement[][] = [[privateSection], [publicContainer]];
      if(value === 'public') a.reverse();

      a[0].forEach((container) => container.classList.remove('hide'));
      a[1].forEach((container) => container.classList.add('hide'));

      onChange();

      if(joinRequestSection && !linkedChatId && !isBroadcast) {
        joinRequestSection.classList.toggle('hide', value !== 'public');
      }
    };

    const section = wrapSolidComponent(() => (
      <Section name={isBroadcast ? 'ChannelType' : 'GroupType'}>
        <RadioFormTsx
          selected={privacySignal[0]()}
          values={privacyValues}
          onChange={onPrivacyChange}
        />
      </Section>
    ), tab.middlewareHelper.get());

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

    const inviteLinkSignal = createSignal((chatFull.exported_invite as ExportedChatInvite.chatInviteExported).link);

    const btnRevoke = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'RevokeLink'});

    attachClickEvent(btnRevoke, () => {
      showPeerPopup('revoke-link', {
        buttons: [{
          langKey: 'RevokeButton',
          callback: () => {
            const toggle = toggleDisability([btnRevoke], true);

            tab.managers.appProfileManager.getChatInviteLink(chatId, true).then((link) => {
              toggle();
              inviteLinkSignal[1](link);
            });
          }
        }],
        titleLangKey: 'RevokeLink',
        descriptionLangKey: 'RevokeAlert'
      });
    }, {listenerSetter: tab.listenerSetter});

    const privateSection = wrapSolidComponent(() => (
      <Section>
        <Row
          clickable={() => {
            copyTextToClipboard(inviteLinkSignal[0]());
            toastNew({langPackKey: 'LinkCopied'});
          }}
        >
          <Row.Title>{inviteLinkSignal[0]()}</Row.Title>
          <Row.Subtitle>{i18n(isBroadcast ? 'ChannelPrivateLinkHelp' : 'MegaPrivateLinkHelp')}</Row.Subtitle>
        </Row>
        {btnRevoke}
      </Section>
    ), tab.middlewareHelper.get());

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const placeholder = 't.me/';

    let changedPrivacy: boolean, changedJoinToSend: boolean, changedJoinRequest: boolean;
    onChange = () => {
      changedPrivacy = (privacySignal[0]() === 'private' && (originalValue !== placeholder)) ||
        (linkInputField.isValidToChange() && linkInputField.input.classList.contains('valid'));
      changedJoinToSend = !isBroadcast && joinToSendSignal[0]() !== originalJoinToSend;
      changedJoinRequest = joinRequestSignal[0]() !== originalJoinRequest;
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

    const originalValue = placeholder + (getPeerEditableUsername(chat as Chat.channel) || '');

    inputWrapper.append(linkInputField.container);

    const publicSection = wrapSolidComponent(() => (
      <Section
        noDelimiter
        caption={<>
          {p}
          {i18n(isBroadcast ? 'Channel.UsernameAboutChannel' : 'Channel.UsernameAboutGroup')}
        </>}
      >
        {inputWrapper}
      </Section>
    ), tab.middlewareHelper.get());

    const usernamesSection = wrapSolidComponent(
      () => (
        <UsernamesSection
          peerId={chatId.toPeerId(true)}
          peer={chat as Chat.channel}
          usernameInputField={linkInputField}
        />
      ),
      tab.middlewareHelper.get()
    );
    publicContainer.append(publicSection, usernamesSection);

    const applyBtn = ButtonCorner({icon: 'check', className: 'is-visible', ariaLabel: 'Save'});
    tab.content.append(applyBtn);

    const getUsername = () => privacySignal[0]() === 'public' ? linkInputField.getValue() : '';

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
          const joinToSendValue = joinToSendSignal[0]();
          const joinRequestValue = joinRequestSignal[0]();
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

    tab.scrollable.append(section, privateSection, publicContainer);

    let originalJoinToSend: boolean, originalJoinRequest: boolean;
    // a channel gets the same approval switch: it gates its invite links, and it is the only place
    // where the guard bot behind those approvals can be seen and taken off again
    {
      const canToggleJoinRequest = () => {
        if(isBroadcast) return true;
        return linkedChatId ? joinToSendSignal[0]() : privacySignal[0]() === 'public';
      };

      const toggleJoinRequestVisibility = () => {
        if(!canToggleJoinRequest() && joinRequestSignal[0]()) {
          joinRequestSignal[1](false);
        }
      };

      const onChatUpdate = () => {
        originalJoinToSend = !!(chat as Chat.channel).pFlags.join_to_send;
        originalJoinRequest = !!(chat as Chat.channel).pFlags.join_request;
        joinToSendSignal[1](originalJoinToSend);
        joinRequestSignal[1](originalJoinRequest);
        toggleJoinRequestVisibility();
        onChange();
      };

      let sectionCaption!: HTMLElement;
      const section = joinRequestSection = wrapSolidComponent(() => (
        <Section
          name={isBroadcast ? undefined : 'ChannelSettingsJoinTitle'}
          // filled in by updateCaption below (it names the guard bot)
          caption={true}
          captionRef={(element) => sectionCaption = element}
        >
          <>
            {!isBroadcast && (
              <Row classList={{hide: !linkedChatId}}>
                <Row.CheckboxFieldToggle>
                  <CheckboxFieldTsx
                    signal={joinToSendSignal}
                    toggle
                    onChange={() => {
                      toggleJoinRequestVisibility();
                      onChange();
                    }}
                  />
                </Row.CheckboxFieldToggle>
                <Row.Title>{i18n('ChannelSettingsJoinToSend')}</Row.Title>
              </Row>
            )}
            <Row classList={{hide: !canToggleJoinRequest()}}>
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx
                  signal={joinRequestSignal}
                  toggle
                  onChange={onChange}
                />
              </Row.CheckboxFieldToggle>
              <Row.Title>{i18n(
                isBroadcast ? 'ChannelSettingsJoinRequestChannel' : 'ChannelSettingsJoinRequest'
              )}</Row.Title>
            </Row>
          </>
        </Section>
      ), tab.middlewareHelper.get());

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

        sectionCaption.replaceChildren(...nodes);
      };

      await updateCaption();
      tab.listenerSetter.add(rootScope)('chat_full_update', (updatedChatId) => {
        if(chatId === updatedChatId) {
          updateCaption();
        }
      });

      tab.scrollable.append(section);
    }

    {
      const section = wrapSolidComponent(() => (
        <Section
          name="SavingContentTitle"
          caption={isBroadcast ? 'RestrictSavingContentInfoChannel' : 'RestrictSavingContentInfoGroup'}
        >
          <Row disabled={noForwardsBusySignal[0]()}>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                signal={noForwardsSignal}
                toggle
                disabled={noForwardsBusySignal[0]()}
                onChange={(checked) => {
                  noForwardsBusySignal[1](true);
                  tab.managers.appProfileManager.toggleNoForwards(chatId.toPeerId(true), checked).finally(() => {
                    noForwardsBusySignal[1](false);
                  });
                }}
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n('RestrictSavingContent')}</Row.Title>
          </Row>
        </Section>
      ), tab.middlewareHelper.get());

      const onChatUpdate = () => {
        noForwardsSignal[1](!!(chat as Chat.channel).pFlags.noforwards);
      };

      addChatUpdateListener(onChatUpdate);
      onChatUpdate();

      tab.scrollable.append(section);
    }

    onPrivacyChange(originalValue !== placeholder || getPeerActiveUsernames(chat as Chat.channel).length ? 'public' : 'private');
    linkInputField.setOriginalValue(originalValue, true);
  })());

  return null;
};

export default ChatType;
