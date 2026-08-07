import {
  Component,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  Show
} from 'solid-js';
import {Portal} from 'solid-js/web';
import getPeerEditableUsername
from '@appManagers/utils/peers/getPeerEditableUsername';
import AvatarEdit, {AvatarEditPayload} from '@components/avatarEdit';
import {AvatarNewTsx} from '@components/avatarNew';
import Button from '@components/buttonTsx';
import EditBotCommunitySection
from '@components/communities/editBotCommunitySection';
import {InputFieldTsx} from '@components/inputFieldTsx';
import Section from '@components/section';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppEditBotTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';
import UsernameInputFieldTsx from '@components/usernameInputFieldTsx';
import type {UsernameInputField} from '@components/usernameInputField';
import UsernamesSectionTsx from '@components/usernamesSectionTsx';
import {purchaseUsernameCaption}
from '@components/sidebarLeft/tabs/purchaseUsernameCaption';
import type {User} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';

async function loadEditBotData(
  tab: InstanceType<typeof AppEditBotTab>,
  peerId: PeerId
) {
  const botId = peerId.toUserId();
  const [bioMaxLength, user, botInfo, joinedCommunities] = await Promise.all([
    tab.managers.apiManager.getLimit('bio'),
    tab.managers.appUsersManager.getUser(botId),
    tab.managers.appProfileManager.getBotInfo(botId),
    tab.managers.appCommunitiesManager
    .getJoinedCommunities()
    .catch((): [] => [])
  ]);

  return {
    botId,
    peerId,
    bioMaxLength,
    user: user as User.user,
    botInfo,
    joinedCommunities
  };
}

type EditBotData = Awaited<ReturnType<typeof loadEditBotData>>;

const EditBot: Component = () => {
  const [tab] = useSuperTab<typeof AppEditBotTab>();
  const promiseCollector = usePromiseCollector();
  const initialPromise = loadEditBotData(tab, tab.payload);
  promiseCollector.collect(initialPromise);
  tab.container.classList.add('edit-profile-container');

  const [data] = createResource(() => initialPromise);

  return (
    <Show when={data()} keyed>
      {(loaded) => <EditBotForm data={loaded} />}
    </Show>
  );
};

export default EditBot;

function EditBotForm(props: {data: EditBotData}) {
  const [tab] = useSuperTab<typeof AppEditBotTab>();
  const initialUsername = getPeerEditableUsername(props.data.user);
  const [firstName, setFirstName] = createSignal(props.data.user.first_name);
  const [about, setAbout] = createSignal(props.data.botInfo.about || '');
  const [username, setUsername] = createSignal(initialUsername);
  const [usernameStateVersion, setUsernameStateVersion] = createSignal(0);
  const [usernameField, setUsernameField] =
    createSignal<UsernameInputField>();
  const [hasAvatarPreview, setHasAvatarPreview] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const purchaseCaption = purchaseUsernameCaption();
  let uploadAvatar: AvatarEditPayload;

  const avatarEdit = new AvatarEdit((payload) => {
    uploadAvatar = payload;
    setHasAvatarPreview(true);
  });
  const profileChanged = () => {
    return firstName() !== props.data.user.first_name ||
      about() !== (props.data.botInfo.about || '');
  };
  const isDirty = createMemo(() => {
    usernameStateVersion();
    return profileChanged() ||
      hasAvatarPreview() ||
      !!usernameField()?.isValidToChange();
  });
  const canSave = () => isDirty() && !saving();

  onCleanup(() => {
    avatarEdit.clear();
    uploadAvatar = undefined;
  });

  const save = async() => {
    if(!canSave()) {
      return;
    }

    const promises: Promise<unknown>[] = [
      tab.managers.appProfileManager.setBotInfo(
        props.data.botId,
        firstName(),
        about()
      )
    ];
    if(uploadAvatar) {
      const {file: fileFn, video: videoFn, videoStartTs} = uploadAvatar;
      promises.push(Promise.all([fileFn(), videoFn?.()]).then(
        ([file, video]) => {
          return tab.managers.appProfileManager.uploadProfilePhoto({
            file,
            video,
            videoStartTs,
            botId: props.data.botId
          });
        }
      ));
    }
    if(usernameField()?.isValidToChange()) {
      promises.push(
        tab.managers.appUsersManager.updateUsername(username())
      );
    }

    setSaving(true);
    try {
      await Promise.all(promises);
      tab.close();
    } catch(error) {
      console.error('edit bot error', error);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setSaving(false);
    }
  };

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

      {avatarEdit.container}
      <Portal mount={avatarEdit.container}>
        <Show when={!hasAvatarPreview()}>
          <AvatarNewTsx
            class="avatar-placeholder"
            peerId={props.data.peerId}
            size={120}
          />
        </Show>
      </Portal>

      <Section>
        <div class="input-wrapper">
          <InputFieldTsx
            label="EditProfile.FirstNameLabel"
            name="first-name"
            maxLength={70}
            value={firstName()}
            onRawInput={setFirstName}
          />
          <InputFieldTsx
            label="DescriptionPlaceholder"
            name="bio"
            maxLength={props.data.bioMaxLength}
            value={about()}
            onRawInput={setAbout}
          />
        </div>
      </Section>

      <Section caption="EditBot.Buttons.Caption">
        <BotFatherButton
          username={initialUsername}
          suffix="intro"
          icon="info"
          text="EditBot.Buttons.Intro"
        />
        <BotFatherButton
          username={initialUsername}
          suffix="commands"
          icon="botcom"
          text="EditBot.Buttons.Commands"
        />
        <BotFatherButton
          username={initialUsername}
          icon="bots"
          text="EditBot.Buttons.Settings"
        />
      </Section>

      <Show when={
        props.data.user.pFlags.bot &&
        props.data.user.pFlags.bot_can_edit
      }>
        <EditBotCommunitySection
          tab={tab}
          peerId={props.data.peerId}
          initialUser={props.data.user}
          initialCommunities={props.data.joinedCommunities}
        />
      </Show>

      <Section
        name="EditAccount.Username"
        caption={(
          <>
            {i18n('EditBot.Username.Caption')}
            {purchaseCaption.element}
          </>
        )}
      >
        <div class="input-wrapper">
          <UsernameInputFieldTsx
            managers={tab.managers}
            instanceRef={setUsernameField}
            originalValue={initialUsername}
            label="Username"
            name="username"
            plainText
            listenerSetter={tab.listenerSetter}
            onChange={() => {
              const field = usernameField();
              if(field) {
                setUsername(field.value);
                setUsernameStateVersion((value) => value + 1);
                purchaseCaption.setUsername(
                  field.error?.type === 'USERNAME_PURCHASE_AVAILABLE' ?
                    field.value :
                    undefined
                );
              }
            }}
            availableText="EditProfile.Username.Available"
            takenText="EditProfile.Username.Taken"
            invalidText="EditProfile.Username.Invalid"
          />
        </div>
      </Section>

      <Show when={usernameField()}>
        {(field) => (
          <UsernamesSectionTsx
            peerId={props.data.peerId}
            peer={props.data.user}
            listenerSetter={tab.listenerSetter}
            usernameInputField={field()}
            middleware={tab.middlewareHelper.get()}
          />
        )}
      </Show>
    </>
  );
}

function BotFatherButton(props: {
  username: string,
  suffix?: string,
  icon: Icon,
  text: LangPackKey
}) {
  const url = 't.me/botfather?start=' + props.username +
    (props.suffix ? '-' + props.suffix : '');
  const wrapped = wrapUrl(url);

  return (
    <Button
      as="a"
      class="btn-primary btn-transparent"
      icon={props.icon}
      text={props.text}
      ref={(element) => {
        const anchor = element as HTMLAnchorElement;
        anchor.href = wrapped.url;
        anchor.setAttribute('onclick', wrapped.onclick + '(this)');
      }}
    />
  );
}
