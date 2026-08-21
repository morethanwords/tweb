import {createEffect, createMemo, createResource, createSignal, JSX, on, onCleanup, onMount, Show} from 'solid-js';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {AppChatAutomationTab, type AppEditProfileTab} from '@components/solidJsTabs/tabs';
import Section from '@components/section';
import Row from '@components/rowTsx';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import getPeerEditableUsername from '@appManagers/utils/peers/getPeerEditableUsername';
import EditPeer from '@components/editPeer';
import InputField from '@components/inputField';
import {UsernameInputField} from '@components/usernameInputField';
import UsernamesSection from '@components/usernamesSection';
import showBirthdayPopup, {saveMyBirthday} from '@components/popups/birthday';
import showPickUserPopup from '@components/popups/pickUser';
import PopupElement from '@components/popups/indexTsx';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {toastNew} from '@components/toast';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {getHeavyAnimationPromise} from '@hooks/useHeavyAnimationCheck';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import shake from '@helpers/dom/shake';
import {purchaseUsernameCaption} from '@components/sidebarLeft/tabs/purchaseUsernameCaption';
import {ConnectedBot, User, UserFull} from '@layer';
import {trackAvatarUpload} from '@stores/avatarUpload';

type AppEditProfileTabType = typeof AppEditProfileTab;

export type EditProfileTabPayload = {
  bioMaxLength: MaybePromise<number>,
  user: MaybePromise<User.user>,
  userFull: MaybePromise<UserFull.userFull>,
  connectedBot: MaybePromise<ConnectedBot.connectedBot | undefined>,
  focusOn?: string
};

const FOCUS_KEYS = ['first-name', 'last-name', 'username', 'bio'] as const;
type FocusKey = typeof FOCUS_KEYS[number];

const EditProfileTab = () => {
  const [tab] = useSuperTab<AppEditProfileTabType>();
  const promiseCollector = usePromiseCollector();
  const {appSidebarLeft} = useHotReloadGuard();

  const payload = tab.payload;
  const loadPromise = Promise.all([
    Promise.resolve(payload.bioMaxLength),
    Promise.resolve(payload.user),
    Promise.resolve(payload.userFull)
  ]);
  promiseCollector.collect(loadPromise);

  const [data] = createResource(() => loadPromise.then(([bioMaxLength, user, userFull]) => ({bioMaxLength, user, userFull})));

  return (
    <Show when={data()}>
      <EditProfileForm data={data()} connectedBot={payload.connectedBot} focusOn={payload.focusOn} />
    </Show>
  );
};

export default EditProfileTab;

type FormData = {
  bioMaxLength: number,
  user: User.user,
  userFull: UserFull.userFull
};

const EditProfileForm = (props: {
  data: FormData,
  connectedBot: MaybePromise<ConnectedBot.connectedBot | undefined>,
  focusOn?: string
}) => {
  const [tab] = useSuperTab<AppEditProfileTabType>();
  const {user, userFull, bioMaxLength} = props.data;

  tab.container.classList.add('edit-profile-container');

  const inputFields: InputField[] = [];

  const editPeer = new EditPeer({
    peerId: rootScope.myId,
    inputFields,
    listenerSetter: tab.listenerSetter,
    middleware: tab.middlewareHelper.get()
  });

  tab.content.append(editPeer.nextBtn);

  let firstNameInputField: InputField;
  let lastNameInputField: InputField;
  let bioInputField: InputField;
  let usernameInputField: UsernameInputField;

  const trackInputField = (field: InputField) => {
    inputFields.push(field);
    tab.listenerSetter.add(field.input)('input', editPeer.handleChange);
  };

  const initialPersonalChannelId: ChatId = userFull.personal_channel_id ?
    userFull.personal_channel_id.toChatId() :
    0;
  const [personalChannelId, setPersonalChannelId] = createSignal<ChatId>(initialPersonalChannelId);
  const [personalChannelTitle, setPersonalChannelTitle] = createSignal<JSX.Element>(i18n('EditProfile.PersonalChannel.Add'));
  const [hasBirthday, setHasBirthday] = createSignal(!!userFull.birthday);
  const [connectedBot, setConnectedBot] = createSignal<ConnectedBot.connectedBot>();
  const [connectedBotLoaded, setConnectedBotLoaded] = createSignal(false);
  const [connectedBotLoadFailed, setConnectedBotLoadFailed] = createSignal(false);
  const [chatAutomationTitle, setChatAutomationTitle] = createSignal<JSX.Element>(i18n('Loading'));

  let cleanedUp = false;
  let connectedBotVersion = 0;
  onCleanup(() => cleanedUp = true);
  const setConnectedBotFromUpdate = (bot?: ConnectedBot.connectedBot) => {
    ++connectedBotVersion;
    setConnectedBot(bot);
    setConnectedBotLoadFailed(false);
    setConnectedBotLoaded(true);
  };

  const loadConnectedBot = async(promise: MaybePromise<ConnectedBot.connectedBot | undefined>) => {
    const requestVersion = ++connectedBotVersion;
    setConnectedBotLoadFailed(false);
    setConnectedBotLoaded(false);

    try {
      const bot = await Promise.resolve(promise);
      if(cleanedUp || requestVersion !== connectedBotVersion) {
        return false;
      }

      setConnectedBot(bot);
      setConnectedBotLoaded(true);
      return true;
    } catch{
      if(!cleanedUp && requestVersion === connectedBotVersion) {
        setConnectedBotLoadFailed(true);
      }

      return false;
    }
  };

  loadConnectedBot(props.connectedBot);

  const isPersonalChannelChanged = createMemo(() => personalChannelId() !== initialPersonalChannelId);
  const origIsChanged = editPeer.isChanged;
  editPeer.isChanged = () => origIsChanged() || isPersonalChannelChanged();

  const {setUsername: setPurchaseUsername, element: purchaseEl} = purchaseUsernameCaption();

  let personalChannelTitleVersion = 0;
  createEffect(on(personalChannelId, async(channelId) => {
    const version = ++personalChannelTitleVersion;
    if(channelId) {
      const title = await wrapPeerTitle({peerId: channelId.toPeerId(true)});
      if(!cleanedUp && version === personalChannelTitleVersion) {
        setPersonalChannelTitle(title);
      }
    } else {
      setPersonalChannelTitle(i18n('EditProfile.PersonalChannel.Add'));
    }
  }));

  let chatAutomationTitleVersion = 0;
  createEffect(() => {
    const loaded = connectedBotLoaded();
    const failed = connectedBotLoadFailed();
    const bot = connectedBot();
    const version = ++chatAutomationTitleVersion;
    if(failed) {
      setChatAutomationTitle(i18n('ChatAutomation.LoadFailed'));
    } else if(!loaded) {
      setChatAutomationTitle(i18n('Loading'));
    } else if(!bot) {
      setChatAutomationTitle(i18n('ChatAutomation.Off'));
    } else {
      wrapPeerTitle({peerId: (bot.bot_id as UserId).toPeerId(false)}).then((title) => {
        if(version === chatAutomationTitleVersion) setChatAutomationTitle(title);
      });
    }
  });

  tab.listenerSetter.add(rootScope)('chat_automation_update', setConnectedBotFromUpdate);

  const openChatAutomation = async() => {
    if(connectedBotLoadFailed()) {
      await loadConnectedBot(tab.managers.appBusinessManager.getConnectedBot(true));
      if(!connectedBotLoaded()) {
        toastNew({langPackKey: 'Error.AnError'});
        return;
      }
    }

    if(!connectedBotLoaded()) {
      return;
    }

    tab.slider.createTab(AppChatAutomationTab).open({connectedBot: connectedBot()});
  };

  const openPersonalChannelPicker = async() => {
    let channelIds: ChatId[];
    try {
      channelIds = await tab.managers.appProfileManager.getAdminedPersonalChannels();
    } catch(err) {
      console.error('getAdminedPersonalChannels error:', err);
      toastNew({langPackKey: 'Error.AnError'});
      return;
    }

    if(!channelIds.length && !personalChannelId()) {
      toastNew({langPackKey: 'EditProfile.PersonalChannel.NoChannels'});
      return;
    }

    const peerIds = channelIds.map((id) => id.toPeerId(true));

    showPickUserPopup({
      titleLangKey: 'EditProfile.PersonalChannel.PickerTitle',
      peerType: ['custom'],
      getMoreCustom: async() => ({result: peerIds, isEnd: true}),
      noSearch: true,
      onSelect: (chosen) => {
        const newChatId = chosen[0].peerId.toChatId();
        if(newChatId === personalChannelId()) return;
        setPersonalChannelId(newChatId);
        editPeer.handleChange();
      },
      footer: () => (
        <Show when={personalChannelId()}>
          <PopupElement.FooterButton
            color="danger"
            langKey="EditProfile.PersonalChannel.Remove"
            callback={() => {
              setPersonalChannelId(0);
              editPeer.handleChange();
            }}
          />
        </Show>
      )
    });
  };

  const onSave = () => {
    editPeer.nextBtn.disabled = true;

    const promises: Promise<any>[] = [];

    promises.push(tab.managers.appProfileManager.updateProfile(
      firstNameInputField.value,
      lastNameInputField.value,
      bioInputField.value
    ).then(() => {
      tab.close();
    }, (err) => {
      console.error('updateProfile error:', err);
    }));

    if(editPeer.uploadAvatar) {
      const {file: fileFn, video: videoFn, videoStartTs} = editPeer.uploadAvatar;
      const filePromise = fileFn();
      const videoPromise = videoFn?.();
      // Surface the upload to the profile's big avatar (progress ring + cancel +
      // collapse lock) for the duration of the upload.
      trackAvatarUpload(rootScope.myId, {file: filePromise, video: videoPromise});
      promises.push(Promise.all([filePromise, videoPromise]).then(([file, video]) => {
        return tab.managers.appProfileManager.uploadProfilePhoto({file, video, videoStartTs});
      }, () => {
        // swallow cancellation/upload errors so Promise.race below doesn't reject the whole save
      }));
    }

    if(usernameInputField.isValidToChange()) {
      promises.push(tab.managers.appUsersManager.updateUsername(usernameInputField.value));
    }

    if(isPersonalChannelChanged()) {
      promises.push(tab.managers.appProfileManager.updatePersonalChannel(personalChannelId() || undefined));
    }

    Promise.race(promises).finally(() => {
      editPeer.nextBtn.removeAttribute('disabled');
    });
  };

  attachClickEvent(editPeer.nextBtn, onSave, {listenerSetter: tab.listenerSetter});

  onMount(() => {
    firstNameInputField.setOriginalValue(user.first_name, true);
    lastNameInputField.setOriginalValue(user.last_name, true);
    bioInputField.setOriginalValue(userFull.about, true);
    usernameInputField.setOriginalValue(getPeerEditableUsername(user), true);
    editPeer.handleChange();

    const focusOn = props.focusOn as FocusKey | 'set-photo' | undefined;
    if(!focusOn) return;

    getHeavyAnimationPromise().then(() => {
      const focusMap: Record<FocusKey, InputField | undefined> = {
        'first-name': firstNameInputField,
        'last-name': lastNameInputField,
        'username': usernameInputField,
        'bio': bioInputField
      };

      const target = focusMap[focusOn as FocusKey];
      if(target) {
        placeCaretAtEnd(target.input);
      } else if(focusOn === 'set-photo') {
        shake(editPeer.avatarElem.node);
      }
    });
  });

  return (
    <>
      {editPeer.avatarEdit.container}

      <Section caption="Bio.Description">
        <div class="input-wrapper">
          <InputFieldTsx
            label="EditProfile.FirstNameLabel"
            name="first-name"
            maxLength={70}
            instanceRef={(ref) => {
              firstNameInputField = ref;
              trackInputField(ref);
            }}
          />
          <InputFieldTsx
            label="Login.Register.LastName.Placeholder"
            name="last-name"
            maxLength={64}
            instanceRef={(ref) => {
              lastNameInputField = ref;
              trackInputField(ref);
            }}
          />
          <InputFieldTsx
            label="EditProfile.BioLabel"
            name="bio"
            maxLength={bioMaxLength}
            instanceRef={(ref) => {
              bioInputField = ref;
              trackInputField(ref);
            }}
          />
        </div>
        <Show when={!hasBirthday()}>
          <Row clickable={() => {
            showBirthdayPopup({
              onSave: async(date) => {
                if(await saveMyBirthday(date)) {
                  setHasBirthday(true);
                  return true;
                }
                return false;
              }
            });
          }}>
            <Row.Icon icon="gift_filled" />
            <Row.Title>{i18n('EditProfile.AddBirthdayRow')}</Row.Title>
          </Row>
        </Show>
      </Section>

      <UsernameSection
        user={user}
        editPeer={editPeer}
        purchaseEl={purchaseEl}
        onPurchaseUsernameChange={setPurchaseUsername}
        usernameInputFieldRef={(ref) => {
          usernameInputField = ref;
          trackInputField(ref);
        }}
      />

      {(() => {
        const section = new UsernamesSection({
          peerId: rootScope.myId,
          peer: user,
          listenerSetter: tab.listenerSetter,
          usernameInputField,
          middleware: tab.middlewareHelper.get()
        });
        return section.container;
      })()}

      <Section
        name="EditProfile.PersonalChannel.Title"
        caption="EditProfile.PersonalChannel.Description"
      >
        <Row clickable={openPersonalChannelPicker}>
          <Row.Icon icon="newchannel_filled" />
          <Row.Title titleRight={!personalChannelId() && <span class="primary">{personalChannelTitle()}</span>}>
            {personalChannelId() ? personalChannelTitle() : i18n('EditProfile.PersonalChannel.Label')}
          </Row.Title>
        </Row>
      </Section>

      <Section
        name="ChatAutomation.Title"
        caption="ChatAutomation.ProfileDescription"
      >
        <Row
          disabled={!connectedBotLoaded() && !connectedBotLoadFailed()}
          clickable={openChatAutomation}
        >
          <Row.Icon icon="bots" />
          <Row.Title titleRight={!connectedBot() && <span class="primary">{chatAutomationTitle()}</span>}>
            {connectedBot() ? chatAutomationTitle() : i18n('ChatAutomation.ProfileLabel')}
          </Row.Title>
        </Row>
      </Section>
    </>
  );
};

const UsernameSection = (props: {
  user: User.user,
  editPeer: EditPeer,
  purchaseEl: HTMLElement,
  onPurchaseUsernameChange: (username: string) => void,
  usernameInputFieldRef: (ref: UsernameInputField) => void
}) => {
  const [tab] = useSuperTab<AppEditProfileTabType>();

  const onChange = () => {
    props.editPeer.handleChange();
    const error = inputField.error;
    const isPurchase = error?.type === 'USERNAME_PURCHASE_AVAILABLE';
    props.onPurchaseUsernameChange(isPurchase ? inputField.value : undefined);
  };

  const inputField = new UsernameInputField({
    label: 'EditProfile.Username.Label',
    name: 'username',
    plainText: true,
    listenerSetter: tab.listenerSetter,
    onChange,
    availableText: 'EditProfile.Username.Available',
    takenText: 'EditProfile.Username.Taken',
    invalidText: 'EditProfile.Username.Invalid'
  }, tab.managers);

  props.usernameInputFieldRef(inputField);

  const captionContent = (() => {
    const fragment = document.createDocumentFragment();
    fragment.append(props.purchaseEl, i18n('UsernameHelp'));
    return fragment;
  })();

  return (
    <Section
      name="EditAccount.Username"
      caption={captionContent}
    >
      <div class="input-wrapper">
        {inputField.container}
      </div>
    </Section>
  );
};
