import {createEffect, createMemo, createResource, createSignal, JSX, on, onMount, Show} from 'solid-js';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppEditProfileTab} from '@components/solidJsTabs/tabs';
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
import {User, UserFull} from '@layer';

type AppEditProfileTabType = typeof AppEditProfileTab;

export type EditProfileTabPayload = {
  bioMaxLength: MaybePromise<number>,
  user: MaybePromise<User.user>,
  userFull: MaybePromise<UserFull.userFull>,
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
      <EditProfileForm data={data()} focusOn={payload.focusOn} />
    </Show>
  );
};

export default EditProfileTab;

type FormData = {bioMaxLength: number, user: User.user, userFull: UserFull.userFull};

const EditProfileForm = (props: {data: FormData, focusOn?: string}) => {
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

  const isPersonalChannelChanged = createMemo(() => personalChannelId() !== initialPersonalChannelId);
  const origIsChanged = editPeer.isChanged;
  editPeer.isChanged = () => origIsChanged() || isPersonalChannelChanged();

  const {setUsername: setPurchaseUsername, element: purchaseEl} = purchaseUsernameCaption();

  createEffect(on(personalChannelId, async(channelId) => {
    if(channelId) {
      setPersonalChannelTitle(await wrapPeerTitle({peerId: channelId.toPeerId(true)}));
    } else {
      setPersonalChannelTitle(i18n('EditProfile.PersonalChannel.Add'));
    }
  }));

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
      promises.push(editPeer.uploadAvatar().then((inputFile) => {
        return tab.managers.appProfileManager.uploadProfilePhoto(inputFile);
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
            <Row.Icon icon="gift" />
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
          <Row.Icon icon="newchannel" />
          <Row.Title titleRight={<span class="primary">{personalChannelTitle()}</span>}>
            {i18n('EditProfile.PersonalChannel.Label')}
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
