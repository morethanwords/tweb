import {onCleanup, onMount} from 'solid-js';
import InputField from '@components/inputField';
import {InputFieldTsx} from '@components/inputFieldTsx';
import AvatarEdit, {AvatarEditPayload} from '@components/avatarEdit';
import ButtonCorner from '@components/buttonCorner';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import Section from '@components/section';
import addChatUsers from '@components/addChatUsers';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import type {AppChatsManager} from '@lib/appManagers/appChatsManager';
import toggleDisability from '@helpers/dom/toggleDisability';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

const NewChannel = () => {
  const [tab] = useSuperTab();
  const {appImManager, appSidebarLeft} = useHotReloadGuard();

  let uploadAvatar: AvatarEditPayload | null = null;
  let nameField!: InputField;
  let descField!: InputField;
  let nextBtn: HTMLButtonElement;

  const avatarEdit = new AvatarEdit((_upload) => {
    uploadAvatar = _upload;
  });

  const onLengthChange = () => {
    nextBtn.classList.toggle('is-visible', !!nameField.value.length &&
      !nameField.input.classList.contains('error') &&
      !descField.input.classList.contains('error'));
  };

  onMount(() => {
    tab.container.classList.add('new-channel-container');

    nextBtn = ButtonCorner({icon: 'arrow_next'});
    tab.content.append(nextBtn);

    attachClickEvent(nextBtn, () => {
      const title = nameField.value;
      const about = descField.value;

      const toggle = toggleDisability(nextBtn, true);
      const options: Parameters<AppChatsManager['createChannel']>[0] = {
        title,
        about,
        broadcast: true
      };
      handleChannelsTooMuch(() => tab.managers.appChatsManager.createChannel(options))
      .then((channelId) => {
        if(uploadAvatar) {
          uploadAvatar.file().then((inputFile) => {
            tab.managers.appChatsManager.editPhoto(channelId, inputFile);
          });
        }

        appImManager.setInnerPeer({peerId: channelId.toPeerId(true)});

        appSidebarLeft.removeTabFromHistory(tab);
        addChatUsers({
          peerId: channelId.toPeerId(true),
          slider: tab.slider,
          skippable: true
        });
      }, (err) => {
        console.error('createChannel error', err);
        toggle();
      });
    }, {listenerSetter: tab.listenerSetter});

    nameField.input.addEventListener('input', onLengthChange);
    descField.input.addEventListener('input', onLengthChange);
  });

  onCleanup(() => {
    avatarEdit.clear();
    uploadAvatar = null;
  });

  return (
    <Section caption="Channel.DescriptionHolderDescrpiton">
      {avatarEdit.container}
      <div class="input-wrapper">
        <InputFieldTsx
          label="EnterChannelName"
          maxLength={128}
          instanceRef={(ref) => nameField = ref}
        />
        <InputFieldTsx
          label="DescriptionOptionalPlaceholder"
          maxLength={255}
          withLinebreaks
          instanceRef={(ref) => descField = ref}
        />
      </div>
    </Section>
  );
};

export default NewChannel;
