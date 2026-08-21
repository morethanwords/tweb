import {
  Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
  Show
} from 'solid-js';
import {Portal} from 'solid-js/web';
import {ChatRights} from '@appManagers/appChatsManager';
import hasRights from '@appManagers/utils/chats/hasRights';
import getParticipantsCount from '@appManagers/utils/chats/getParticipantsCount';
import {isParticipantAdmin} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import AvatarEdit, {AvatarEditPayload} from '@components/avatarEdit';
import Button from '@components/buttonTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {InputFieldTsx} from '@components/inputFieldTsx';
import Badge from '@components/badge';
import {IconTsx} from '@components/iconTsx';
import openBoosts from '@components/openBoosts';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {AppDirectMessagesTab} from '@components/solidJsTabs';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {
  AppAddGroupToCommunityTab,
  AppAdminRecentActionsTab,
  AppChatAdministratorsTab,
  AppChatDiscussionTab,
  AppChatInviteLinksTab,
  AppChatMembersTab,
  AppChatReactionsTab,
  AppChatRequestsTab,
  AppChatTypeTab,
  AppEditChatTab,
  AppGroupPermissionsTab,
  AppGroupStickersTab,
  AppRemovedUsersTab
} from '@components/solidJsTabs/tabs';
import cancelEvent from '@helpers/dom/cancelEvent';
import anchorCallback from '@helpers/dom/anchorCallback';
import numberThousandSplitter, {
  numberThousandSplitterForStars
} from '@helpers/number/numberThousandSplitter';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {Chat, ChatFull, ChatParticipants} from '@layer';
import type {LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {appSettings} from '@stores/appSettings';

const PERMISSION_FLAGS = [
  'send_stickers',
  'send_polls',
  'send_photos',
  'send_videos',
  'send_roundvideos',
  'send_audios',
  'send_voices',
  'send_docs',
  'send_plain',
  'embed_links',
  'invite_users',
  'pin_messages',
  'change_info'
] as const satisfies readonly ChatRights[];

type EditChat = Chat.chat | Chat.channel;
type EditChatFull = ChatFull.chatFull | ChatFull.channelFull;

async function loadEditChatData(
  tab: InstanceType<typeof AppEditChatTab>,
  chatId: ChatId
) {
  const [chatFull, chat, appConfig, availableReactions, joinedCommunities] = await Promise.all([
    tab.managers.appProfileManager.getChatFull(chatId, true),
    tab.managers.appChatsManager.getChat(chatId) as Promise<EditChat>,
    tab.managers.apiManager.getAppConfig(),
    tab.managers.appReactionsManager.getAvailableReactions(),
    tab.managers.appCommunitiesManager.getJoinedCommunities()
  ]);

  return {
    chatId,
    chatFull: chatFull as EditChatFull,
    chat,
    appConfig,
    availableReactions,
    joinedCommunities
  };
}

type EditChatData = Awaited<ReturnType<typeof loadEditChatData>>;

const EditChatTab: Component = () => {
  const [tab] = useSuperTab<typeof AppEditChatTab>();
  const promiseCollector = usePromiseCollector();
  const [chatId, setChatId] = createSignal(tab.payload.chatId);
  const initialPromise = loadEditChatData(tab, tab.payload.chatId);
  let isInitialLoad = true;

  tab.container.classList.add('edit-peer-container', 'edit-group-container');
  promiseCollector.collect(initialPromise);

  const [data] = createResource(chatId, (currentChatId) => {
    if(isInitialLoad) {
      isInitialLoad = false;
      return initialPromise;
    }

    return loadEditChatData(tab, currentChatId);
  });

  return (
    <Show when={data()} keyed>
      {(loaded) => (
        <EditChatForm
          data={loaded}
          onMigrate={setChatId}
        />
      )}
    </Show>
  );
};

export default EditChatTab;

function EditChatForm(props: {
  data: EditChatData,
  onMigrate: (chatId: ChatId) => void
}) {
  const [tab] = useSuperTab<typeof AppEditChatTab>();
  const {
    AvatarNewTsx,
    ChatType,
    CommunityLinkSection,
    I18n,
    PeerTitleTsx,
    PopupElement,
    apiManagerProxy,
    appDialogsManager,
    appImManager,
    confirmationPopup,
    hideToast,
    i18n,
    join,
    toastNew,
    wrapEmojiText
  } = useHotReloadGuard();
  const [chat, setChat] = createSignal<EditChat>(props.data.chat);
  const [chatFull, setChatFull] = createSignal<EditChatFull>(props.data.chatFull);
  const [title, setTitle] = createSignal(props.data.chat.title);
  const [about, setAbout] = createSignal(props.data.chatFull.about || '');
  const [saving, setSaving] = createSignal(false);
  const [hasAvatarPreview, setHasAvatarPreview] = createSignal(false);
  const [topicsBusy, setTopicsBusy] = createSignal(false);
  const [autotranslationBusy, setAutotranslationBusy] = createSignal(false);
  const [signaturesBusy, setSignaturesBusy] = createSignal(false);
  const [historyBusy, setHistoryBusy] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  let uploadAvatar: AvatarEditPayload;
  let alive = true;

  const chatId = () => props.data.chatId;
  const peerId = () => chatId().toPeerId(true);
  const isChannel = () => chat()._ === 'channel';
  const channel = () => chat()._ === 'channel' ? chat() as Chat.channel : undefined;
  const channelFull = () => chatFull()._ === 'channelFull' ? chatFull() as ChatFull.channelFull : undefined;
  const isBroadcast = () => !!channel()?.pFlags.broadcast;
  const isBroadcastGroup = () => !!channel()?.pFlags.gigagroup;
  const isForum = () => !!channel()?.pFlags.forum;
  const isAdmin = () => hasRights(chat(), 'just_admin');
  const canChangeType = () => hasRights(chat(), 'change_type');
  const canChangePermissions = () => hasRights(chat(), 'change_permissions');
  const canToggleForum = () => hasRights(chat(), 'toggle_forum');
  const canChangeInfo = () => hasRights(chat(), 'change_info');
  const canDeleteChat = () => hasRights(chat(), 'delete_chat');
  const canPostMessages = () => hasRights(chat(), 'post_messages');
  const canManageInviteLinks = () => hasRights(chat(), 'invite_links');
  const canInviteUsers = () => hasRights(chat(), 'invite_users');
  const linkedChatId = () => channelFull()?.linked_chat_id;
  const linkedCommunityId = () => channel()?.linked_community_id?.toChatId();
  const availableReactionsLength = props.data.availableReactions.filter((reaction) => {
    return !reaction.pFlags.inactive;
  }).length;

  const avatarEdit = new AvatarEdit((payload) => {
    uploadAvatar = payload;
    setHasAvatarPreview(true);
  }, {isForum: isForum()});

  const isDirty = createMemo(() => {
    return title() !== props.data.chat.title ||
      about() !== (props.data.chatFull.about || '') ||
      hasAvatarPreview();
  });
  const canSave = createMemo(() => {
    return isDirty() && !!title().trim() && !saving();
  });
  const showTopics = createMemo(() => {
    return canToggleForum() &&
      ((channel()?.participants_count || 0) >= props.data.appConfig.forum_upgrade_participants_min || isForum()) &&
      !isBroadcast();
  });
  const showDiscussion = createMemo(() => {
    return isAdmin() && (isBroadcast() || !!linkedChatId());
  });
  const isMegagroup = () => !!channel()?.pFlags.megagroup;
  // the server decides when a group is big enough to own a sticker set
  const showGroupStickers = createMemo(() => {
    return isMegagroup() && !!channelFull()?.pFlags?.can_set_stickers;
  });
  const showGroupEmojiPack = createMemo(() => {
    return isMegagroup() && canChangeInfo() && isAdmin();
  });
  // the entry stays visible below the required level, badged and gated on apply
  const emojiPackRequiredLevel = () => props.data.appConfig.group_emoji_stickers_level_min ?? 0;
  const emojiPackLevelMissing = createMemo(() => {
    return (channel()?.level ?? 0) < emojiPackRequiredLevel();
  });
  const hasGroupStickersSection = createMemo(() => {
    return showGroupStickers() || showGroupEmojiPack();
  });
  const hasMainSettings = createMemo(() => {
    return canChangeType() ||
      canManageInviteLinks() ||
      (canInviteUsers() && isAdmin()) ||
      (canChangeInfo() && isAdmin()) ||
      (canChangePermissions() && !isBroadcast() && !isBroadcastGroup()) ||
      showDiscussion() ||
      (isAdmin() && isChannel()) ||
      showTopics();
  });
  const mainCaption = createMemo<LangPackKey>(() => {
    if(showTopics()) {
      return 'ForumToggleDescription';
    }

    if(isAdmin()) {
      return 'DiscussionInfo';
    }
  });
  const canManageCommunity = createMemo(() => {
    const value = channel();
    if(
      !value ||
      !value.pFlags.creator ||
      value.pFlags.monoforum ||
      (!value.pFlags.broadcast && !value.pFlags.megagroup)
    ) {
      return false;
    }

    const communityId = linkedCommunityId();
    return !communityId || props.data.joinedCommunities.some((community) => {
      return community.id.toChatId() === communityId;
    });
  });

  const reactionsSubtitle = createMemo(() => {
    const reactions = chatFull().available_reactions ?? {_: 'chatReactionsNone'} as const;
    if(reactions._ === 'chatReactionsSome') {
      const length = reactions.reactions.length;
      return length === availableReactionsLength ?
        i18n('ReactionsAll') :
        `${length}/${availableReactionsLength}`;
    }

    return i18n(reactions._ === 'chatReactionsAll' ? 'ReactionsAll' : 'Checkbox.Disabled');
  });
  const directMessagesSubtitle = createMemo(() => {
    const monoforumId = channel()?.linked_monoforum_id;
    const monoforum = monoforumId ? apiManagerProxy.getChat(monoforumId) : undefined;
    if(monoforum?._ !== 'channel') {
      return i18n('ChannelDirectMessages.Settings.Off');
    }

    const stars = monoforum.send_paid_messages_stars || 0;
    return stars ?
      i18n('Stars', [numberThousandSplitterForStars(stars)]) :
      i18n('ChannelDirectMessages.Settings.Free');
  });
  const groupStickerSetSubtitle = (isEmoji: boolean) => {
    const set = isEmoji ? channelFull()?.emojiset : channelFull()?.stickerset;
    return set ? wrapEmojiText(set.title) : i18n('Checkbox.Disabled');
  };
  const permissionsSubtitle = createMemo(() => {
    const permissions = PERMISSION_FLAGS.reduce((count, flag) => {
      return count + +hasRights(chat(), flag, chat().default_banned_rights);
    }, 0) + '/' + PERMISSION_FLAGS.length;
    const paid = channel()?.send_paid_messages_stars ?
      I18n.format('PrivacySettingsController.Paid', true) :
      undefined;

    return join([permissions, paid].filter(Boolean));
  });
  const administratorsCount = createMemo(() => {
    const participants = (chatFull() as ChatFull.chatFull).participants as ChatParticipants.chatParticipants;
    let count: number;
    if(participants?._ === 'chatParticipants') {
      count = participants.participants.filter(isParticipantAdmin).length;
    } else {
      count = channelFull()?.admins_count;
    }

    return count || 1;
  });
  const membersCount = createMemo(() => {
    return numberThousandSplitter(getParticipantsCount(chatFull()));
  });
  const removedUsersSubtitle = createMemo(() => {
    const count = channelFull()?.kicked_count || 0;
    return count ? numberThousandSplitter(count) : i18n('NoBlockedUsers');
  });

  const [topics, setTopics] = createSignal(isForum());
  const [autotranslation, setAutotranslation] = createSignal(!!channel()?.pFlags.autotranslation);
  const [signMessages, setSignMessages] = createSignal(!!channel()?.pFlags.signatures);
  const [showProfiles, setShowProfiles] = createSignal(
    !!channel()?.pFlags.signatures && !!channel()?.pFlags.signature_profiles
  );
  const [showChatHistory, setShowChatHistory] = createSignal(
    isChannel() && !channelFull()?.pFlags.hidden_prehistory
  );

  createEffect(() => {
    avatarEdit.container.classList.toggle('is-forum', isForum());
  });
  createEffect(() => {
    setTopics(isForum());
    setAutotranslation(!!channel()?.pFlags.autotranslation);
    setSignMessages(!!channel()?.pFlags.signatures);
    setShowProfiles(!!channel()?.pFlags.signatures && !!channel()?.pFlags.signature_profiles);
  });
  createEffect(() => {
    setShowChatHistory(isChannel() && !channelFull()?.pFlags.hidden_prehistory);
  });
  createEffect(on(linkedCommunityId, (communityId) => {
    if(communityId) {
      void Promise.resolve(tab.managers.appProfileManager
      .getChatFull(communityId))
      .catch((): undefined => undefined);
    }
  }));

  subscribeOn(rootScope)('chat_update', async(updatedChatId) => {
    if(updatedChatId !== chatId()) {
      return;
    }

    const updatedChat = await tab.managers.appChatsManager.getChat(updatedChatId) as EditChat;
    if(alive) {
      setChat(updatedChat);
    }
  });
  subscribeOn(rootScope)('chat_full_update', async(updatedChatId) => {
    if(updatedChatId !== chatId()) {
      return;
    }

    const updatedFull = await tab.managers.appProfileManager.getChatFull(updatedChatId) as EditChatFull;
    if(alive) {
      setChatFull(updatedFull);
    }
  });
  subscribeOn(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
    if(peerId() === migrateFrom) {
      props.onMigrate(migrateTo.toChatId());
    }
  });

  const save = async() => {
    if(!canSave()) {
      return;
    }

    const promises: Promise<unknown>[] = [];
    if(title() !== props.data.chat.title) {
      promises.push(tab.managers.appChatsManager.editTitle(chatId(), title()));
    }
    if(about() !== (props.data.chatFull.about || '')) {
      promises.push(tab.managers.appChatsManager.editAbout(chatId(), about()));
    }
    if(uploadAvatar) {
      promises.push(uploadAvatar.file().then((file) => {
        return tab.managers.appChatsManager.editPhoto(chatId(), file);
      }));
    }

    setSaving(true);
    try {
      await Promise.all(promises);
      tab.close();
    } catch(error) {
      console.error('edit chat error', error);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setSaving(false);
    }
  };

  const toggleTopics = async(value: boolean) => {
    if(linkedChatId()) {
      setTopics(!value);
      toastNew({langPackKey: 'ChannelTopicsDiscussionForbidden'});
      return;
    }

    setTopicsBusy(true);
    try {
      await handleChannelsTooMuch(() => {
        return tab.managers.appChatsManager.toggleForum(chatId(), value);
      });
    } catch(error) {
      setTopics(!value);
      console.error('toggleForum error', error);
    } finally {
      setTopicsBusy(false);
    }
  };

  const showAutotranslationLevelToast = () => {
    toastNew({
      langPackKey: 'ChannelAutotranslationLevelMin',
      langPackArguments: [
        props.data.appConfig.channel_autotranslation_level_min,
        anchorCallback(() => {
          hideToast();
          openBoosts({
            peerId: peerId(),
            slider: tab.slider,
            reason: {
              titleLangKey: 'ChannelAutotranslation.BoostTitle',
              descriptionLangKey: 'ChannelAutotranslation.BoostDescription',
              descriptionArgs: [props.data.appConfig.channel_autotranslation_level_min]
            }
          });
        })
      ]
    });
  };
  const canToggleAutotranslation = () => {
    return (channel()?.level ?? 0) >= props.data.appConfig.channel_autotranslation_level_min;
  };
  const toggleAutotranslation = async(value: boolean) => {
    if(!canToggleAutotranslation()) {
      setAutotranslation(!value);
      showAutotranslationLevelToast();
      return;
    }

    setAutotranslationBusy(true);
    try {
      await tab.managers.appChatsManager.toggleAutotranslation(chatId(), value);
    } catch(error) {
      setAutotranslation(!value);
      console.error('toggleAutotranslation error', error);
    } finally {
      setAutotranslationBusy(false);
    }
  };

  const toggleSignMessages = async(value: boolean) => {
    const profiles = value && showProfiles();
    setSignaturesBusy(true);
    try {
      await tab.managers.appChatsManager.toggleSignatures(chatId(), value, profiles);
    } catch(error) {
      setSignMessages(!value);
      console.error('toggleSignatures error', error);
    } finally {
      setSignaturesBusy(false);
    }
  };
  const toggleShowProfiles = async(value: boolean) => {
    setSignaturesBusy(true);
    try {
      await tab.managers.appChatsManager.toggleSignatures(chatId(), signMessages(), value);
    } catch(error) {
      setShowProfiles(!value);
      console.error('toggle signature profiles error', error);
    } finally {
      setSignaturesBusy(false);
    }
  };
  const toggleChatHistory = async(value: boolean) => {
    setHistoryBusy(true);
    try {
      await handleChannelsTooMuch(() => {
        return tab.managers.appChatsManager.togglePreHistoryHidden(chatId(), !value);
      });
    } catch(error) {
      setShowChatHistory(!value);
      console.error('togglePreHistoryHidden error:', error);
    } finally {
      setHistoryBusy(false);
    }
  };

  const removeFromCommunity = async(communityId: ChatId) => {
    try {
      await confirmationPopup({
        titleLangKey: isBroadcast() ?
          'Community.RemoveChannel' :
          'Community.RemoveGroup',
        descriptionLangKey: 'Community.RemoveConfirm',
        descriptionLangArgs: [chat().title],
        button: {
          langKey: 'Remove',
          isDanger: true
        }
      });
    } catch{
      return;
    }

    try {
      await tab.managers.appCommunitiesManager.togglePeerLink({
        communityId,
        peerId: peerId(),
        action: 'deleted'
      });
      toastNew({
        langPackKey: isBroadcast() ?
          'Community.ChannelRemoved' :
          'Community.Removed'
      });
    } catch(error) {
      console.error('remove group from community error', error);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  const deleteChat = async() => {
    if(deleting()) {
      return;
    }

    setDeleting(true);
    try {
      const {default: PopupDeleteDialog} = await import('@components/popups/deleteDialog');
      setDeleting(false);
      PopupElement.createPopup(PopupDeleteDialog, peerId(), undefined, (promise) => {
        setDeleting(true);
        promise.then(() => {
          tab.close();
        }, () => {
          setDeleting(false);
        });
      });
    } catch(error) {
      setDeleting(false);
      console.error('open delete chat popup error', error);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  onCleanup(() => {
    alive = false;
    avatarEdit.clear();
    uploadAvatar = undefined;
  });

  return (
    <>
      <Portal mount={tab.content}>
        <Show when={isDirty()}>
          <Button.Corner
            class="is-visible"
            icon="check"
            aria-label={i18n('Save').textContent}
            disabled={!canSave()}
            tabIndex={0}
            onClick={save}
          />
        </Show>
      </Portal>

      <Show
        when={canChangeInfo()}
        fallback={(
          <div
            class="avatar-edit disable-hover"
            classList={{'is-forum': isForum()}}
          >
            <AvatarNewTsx
              class="avatar-placeholder"
              peerId={peerId()}
              size={120}
            />
          </div>
        )}
      >
        {avatarEdit.container}
        <Portal mount={avatarEdit.container}>
          <Show when={!hasAvatarPreview()}>
            <AvatarNewTsx
              class="avatar-placeholder"
              peerId={peerId()}
              size={120}
            />
          </Show>
        </Portal>
      </Show>

      <Section noDelimiter caption="PeerInfo.SetAboutDescription">
        <div class="input-wrapper">
          <InputFieldTsx
            label={isBroadcast() ? 'EnterChannelName' : 'CreateGroup.NameHolder'}
            name="chat-name"
            maxLength={255}
            required
            value={title()}
            onRawInput={setTitle}
            disabled={!canChangeInfo()}
          />
          <InputFieldTsx
            label="DescriptionPlaceholder"
            name="chat-description"
            maxLength={255}
            withLinebreaks
            value={about()}
            onRawInput={setAbout}
            disabled={!canChangeInfo()}
          />
        </div>
      </Section>

      <Show when={hasMainSettings()}>
        <Section caption={mainCaption()}>
          <Show when={canChangeType()}>
            <Row clickable={() => {
              tab.slider.createTab(AppChatTypeTab).open({
                chatId: chatId(),
                chatFull: chatFull()
              });
            }}>
              <Row.Icon icon="lock" />
              <Row.Title>{i18n(isBroadcast() ? 'ChannelType' : 'GroupType')}</Row.Title>
              <Row.Subtitle>{i18n((() => {
                const isPublic = !!getPeerActiveUsernames(channel())[0];
                if(isBroadcast()) {
                  return isPublic ? 'TypePublic' : 'TypePrivate';
                }

                return isPublic ? 'TypePublicGroup' : 'TypePrivateGroup';
              })())}</Row.Subtitle>
            </Row>
          </Show>

          <Show when={canManageInviteLinks()}>
            <Row clickable={() => {
              tab.slider.createTab(AppChatInviteLinksTab).open({
                chatId: chatId(),
                p: AppChatInviteLinksTab.getInitArgs(chatId())
              });
            }}>
              <Row.Icon icon="link_filled" />
              <Row.Title>{i18n('InviteLinks')}</Row.Title>
              <Row.Subtitle>1</Row.Subtitle>
            </Row>
          </Show>

          <Show when={canInviteUsers() && isAdmin() && !!chatFull().requests_pending}>
            <Row clickable={() => {
              tab.slider.createTab(AppChatRequestsTab).open(chatId());
            }}>
              <Row.Icon icon="adduser" />
              <Row.Title>{i18n(isBroadcast() ? 'SubscribeRequests' : 'MemberRequests')}</Row.Title>
              <Row.Subtitle>{chatFull().requests_pending}</Row.Subtitle>
            </Row>
          </Show>

          <Show when={canChangeInfo() && isAdmin()}>
            <Row clickable={() => {
              tab.slider.createTab(AppChatReactionsTab).open({chatId: chatId()});
            }}>
              <Row.Icon icon="reactions_filled" />
              <Row.Title>{i18n('Reactions')}</Row.Title>
              <Row.Subtitle>{reactionsSubtitle()}</Row.Subtitle>
            </Row>
          </Show>

          <Show when={canChangeInfo() && isBroadcast() && isAdmin()}>
            <Row clickable={() => {
              const value = channel();
              if(value) {
                tab.slider.createTab(AppDirectMessagesTab).open({chat: value});
              }
            }}>
              <Row.Icon icon="messageunread" />
              <Row.Title>{i18n('ChannelDirectMessages.Settings.Title')}</Row.Title>
              <Row.Subtitle>{directMessagesSubtitle()}</Row.Subtitle>
            </Row>
          </Show>

          <Show when={canChangePermissions() && !isBroadcast() && !isBroadcastGroup()}>
            <Row clickable={() => {
              tab.slider.createTab(AppGroupPermissionsTab).open({chatId: chatId()});
            }}>
              <Row.Icon icon="permissions" />
              <Row.Title>{i18n('ChannelPermissions')}</Row.Title>
              <Row.Subtitle>{permissionsSubtitle()}</Row.Subtitle>
            </Row>
          </Show>

          <Show when={showDiscussion()}>
            <Row clickable={() => {
              tab.slider.createTab(AppChatDiscussionTab).open({
                chatId: chatId(),
                linkedChatId: linkedChatId()
              });
            }}>
              <Row.Icon icon="comments" />
              <Row.Title>{i18n(isBroadcast() ? 'PeerInfo.Discussion' : 'LinkedChannel')}</Row.Title>
              <Row.Subtitle>
                <Show when={linkedChatId()} fallback={i18n('PeerInfo.Discussion.Add')}>
                  {(id) => <PeerTitleTsx peerId={id().toPeerId(true)} />}
                </Show>
              </Row.Subtitle>
            </Row>
          </Show>

          <Show when={isAdmin() && isChannel()}>
            <Row clickable={() => {
              if(appSettings.logsDiffView) {
                tab.slider.createTab(AppAdminRecentActionsTab).open({
                  channelId: chatId(),
                  isBroadcast: isBroadcast()
                });
              } else {
                appImManager.setInnerPeer({
                  peerId: peerId(),
                  type: ChatType.Logs
                });
              }
            }}>
              <Row.Icon icon="clipboard" />
              <Row.Title>{i18n('RecentActions')}</Row.Title>
            </Row>
          </Show>

          <Show when={showTopics()}>
            <Row clickable={(event) => {
              if(linkedChatId()) {
                toastNew({langPackKey: 'ChannelTopicsDiscussionForbidden'});
                cancelEvent(event);
              }
            }}>
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx
                  toggle
                  signal={[topics, setTopics]}
                  disabled={topicsBusy()}
                  onChange={(value) => void toggleTopics(value)}
                />
              </Row.CheckboxFieldToggle>
              <Row.Icon icon="topics_filled" />
              <Row.Title>{i18n('Topics')}</Row.Title>
            </Row>
          </Show>
        </Section>
      </Show>

      <Show when={hasGroupStickersSection()}>
        <Section name="GroupStickers" caption="GroupStickers.SectionInfo">
          <Show when={showGroupStickers()}>
            <Row clickable={() => {
              tab.slider.createTab(AppGroupStickersTab).open({chatId: chatId()});
            }}>
              <Row.Icon icon="stickers_face" />
              <Row.Title>{i18n('GroupStickers')}</Row.Title>
              <Row.Subtitle>{groupStickerSetSubtitle(false)}</Row.Subtitle>
            </Row>
          </Show>

          <Show when={showGroupEmojiPack()}>
            <Row clickable={() => {
              tab.slider.createTab(AppGroupStickersTab).open({chatId: chatId(), isEmoji: true});
            }}>
              <Row.Icon icon="smile" />
              <Row.Title titleRight={emojiPackLevelMissing() ? (
                <Badge tag="span" rectangle class="badge-rectangle-with-icon">
                  <IconTsx icon="premium_lock" />
                  {i18n('BoostsLevel', [emojiPackRequiredLevel()])}
                </Badge>
              ) : undefined}>
                {i18n('GroupEmojiPack')}
              </Row.Title>
              <Row.Subtitle>{groupStickerSetSubtitle(true)}</Row.Subtitle>
            </Row>
          </Show>
        </Section>
      </Show>

      <Section>
        <Row clickable={() => {
          tab.slider.createTab(AppChatAdministratorsTab).open({chatId: chatId()});
        }}>
          <Row.Icon icon="admin_filled" />
          <Row.Title>{i18n('PeerInfo.Administrators')}</Row.Title>
          <Row.Subtitle>{administratorsCount()}</Row.Subtitle>
        </Row>
        <Row clickable={() => {
          tab.slider.createTab(AppChatMembersTab).open(chatId());
        }}>
          <Row.Icon icon="newgroup_filled" />
          <Row.Title>{i18n(isBroadcast() ? 'PeerInfo.Subscribers' : 'GroupMembers')}</Row.Title>
          <Row.Subtitle>{membersCount()}</Row.Subtitle>
        </Row>
        <Show when={isChannel()}>
          <Row clickable={() => {
            tab.slider.createTab(AppRemovedUsersTab).open({chatId: chatId()});
          }}>
            <Row.Icon icon="deleteuser" />
            <Row.Title>{i18n('ChannelBlockedUsers')}</Row.Title>
            <Row.Subtitle>{removedUsersSubtitle()}</Row.Subtitle>
          </Row>
        </Show>
      </Section>

      <Show when={isBroadcast() && canChangeInfo()}>
        <Section>
          <Row clickable={(event) => {
            if(!canToggleAutotranslation()) {
              showAutotranslationLevelToast();
              cancelEvent(event);
            }
          }}>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                toggle
                signal={[autotranslation, setAutotranslation]}
                disabled={autotranslationBusy()}
                onChange={(value) => void toggleAutotranslation(value)}
              />
            </Row.CheckboxFieldToggle>
            <Row.Icon icon="premium_translate" />
            <Row.Title>{i18n('ChannelAutotranslation')}</Row.Title>
          </Row>
        </Section>
      </Show>

      <Show when={isBroadcast() && canPostMessages()}>
        <Section caption={showProfiles() ? 'ChannelSignProfilesInfo' : 'ChannelSignMessagesInfo'}>
          <Row disabled={signaturesBusy()}>
            <Row.CheckboxField>
              <CheckboxFieldTsx
                signal={[signMessages, setSignMessages]}
                disabled={signaturesBusy()}
                onChange={(value) => void toggleSignMessages(value)}
              />
            </Row.CheckboxField>
            <Row.Title>{i18n('ChannelSignMessages')}</Row.Title>
          </Row>
          <Show when={signMessages()}>
            <Row disabled={signaturesBusy()}>
              <Row.CheckboxField>
                <CheckboxFieldTsx
                  signal={[showProfiles, setShowProfiles]}
                  disabled={signaturesBusy()}
                  onChange={(value) => void toggleShowProfiles(value)}
                />
              </Row.CheckboxField>
              <Row.Title>{i18n('ChannelSignMessagesWithProfile')}</Row.Title>
            </Row>
          </Show>
        </Section>
      </Show>

      <Show when={!isBroadcast() && canChangeType()}>
        <Section>
          <Row disabled={historyBusy()}>
            <Row.CheckboxField>
              <CheckboxFieldTsx
                signal={[showChatHistory, setShowChatHistory]}
                disabled={historyBusy()}
                onChange={(value) => void toggleChatHistory(value)}
              />
            </Row.CheckboxField>
            <Row.Title>{i18n('ChatHistory')}</Row.Title>
          </Row>
        </Section>
      </Show>

      <Show when={canManageCommunity()}>
        <CommunityLinkSection
          linkedCommunityId={linkedCommunityId()}
          communities={props.data.joinedCommunities}
          middleware={tab.middlewareHelper.get()}
          caption="Community.Description"
          addIcon="newgroup_filled"
          addText={isBroadcast() ?
            'Community.AddChannel' :
            'Community.AddGroup'}
          removeText={isBroadcast() ?
            'Community.RemoveChannel' :
            'Community.RemoveGroup'}
          onAdd={() => {
            tab.slider.createTab(AppAddGroupToCommunityTab).open({peerId: peerId()});
          }}
          onOpenCommunity={(communityId) => {
            void appDialogsManager.toggleForumTabByPeerId(
              communityId.toPeerId(true),
              true,
              false
            );
          }}
          onRemove={removeFromCommunity}
        />
      </Show>

      <Show when={canDeleteChat()}>
        <Section>
          <Button
            class="btn-primary btn-transparent danger"
            disabled={deleting()}
            icon="delete"
            text={isBroadcast() ? 'PeerInfo.DeleteChannel' : 'DeleteAndExitButton'}
            onClick={deleteChat}
          />
        </Section>
      </Show>
    </>
  );
}
