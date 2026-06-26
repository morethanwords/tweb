import {Component, onCleanup, onMount} from 'solid-js';
import {MissingInvitee} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import InputField from '@components/inputField';
import AvatarEdit, {AvatarEditPayload} from '@components/avatarEdit';
import I18n, {i18n} from '@lib/langPack';
import ButtonCorner from '@components/buttonCorner';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import SettingSection from '@components/settingSection';
import {handleMissingInvitees} from '@components/addChatUsers';
import type {AppChatsManager} from '@lib/appManagers/appChatsManager';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import toggleDisability from '@helpers/dom/toggleDisability';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppNewGroupTab} from '@components/solidJsTabs/tabs';

interface OpenStreetMapInterface {
  place_id?: number;
  license?: string;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  display_name: string;
  address?: object;
  boundingbox?: object;
}

const NewGroup: Component = () => {
  const [tab] = useSuperTab<typeof AppNewGroupTab>();
  const {appImManager} = useHotReloadGuard();
  const promiseCollector = usePromiseCollector();

  const {peerIds, isGeoChat = false, onCreate, openAfter = true, title, asChannel = false} = tab.payload;

  let uploadAvatar: AvatarEditPayload | null = null;
  let userLocationCoords: {lat: number, long: number};
  let userLocationAddress: string;
  let nextBtn: HTMLButtonElement;

  const avatarEdit = new AvatarEdit((_upload) => {
    uploadAvatar = _upload;
  });

  const groupNameInputField = new InputField({
    label: 'CreateGroup.NameHolder',
    maxLength: 128
  });

  const groupLocationInputField = new InputField({
    label: 'ChatLocation',
    name: 'location',
    canBeEdited: false
  });

  const list = appDialogsManager.createChatList({
    new: true
  });

  const startLocating = () => {
    navigator.geolocation.getCurrentPosition((location) => {
      userLocationCoords = {
        lat: location.coords.latitude,
        long: location.coords.longitude
      };

      let uri = 'https://nominatim.openstreetmap.org/reverse';
      uri += '?lat=' + location.coords.latitude;
      uri += '&lon=' + location.coords.longitude;
      uri += '&format=json';
      uri += '&addressdetails=1';
      uri += '&accept-language=en';
      fetch(uri)
      .then((response) => response.json())
      .then((response: OpenStreetMapInterface) => {
        userLocationAddress = response.display_name;
        groupLocationInputField.setValueSilently(response.display_name);
      });
    }, (error) => {
      if(error instanceof GeolocationPositionError) {
        groupLocationInputField.setValueSilently('Location permission denied. Please retry later.');
      } else {
        groupLocationInputField.setValueSilently('An error has occurred. Please retry later.');
      }
    });
  };

  onMount(() => {
    tab.container.classList.add('new-group-container');

    const section = new SettingSection({});

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    inputWrapper.append(
      groupNameInputField.container,
      groupLocationInputField.container
    );

    tab.listenerSetter.add(groupNameInputField.input)('input', () => {
      const value = groupNameInputField.value;
      let valueCheck = !!value.length && !groupNameInputField.input.classList.contains('error');
      if(isGeoChat) valueCheck = valueCheck && !!userLocationCoords && !!userLocationAddress;
      nextBtn.classList.toggle('is-visible', !!valueCheck);
    });

    nextBtn = ButtonCorner({icon: 'arrow_next'});

    attachClickEvent(nextBtn, () => {
      const groupTitle = groupNameInputField.value;
      const userIds = peerIds.map((peerId) => peerId.toUserId());
      const toggle = toggleDisability(nextBtn, true);

      let promise: Promise<{chatId: ChatId, missingInvitees: MissingInvitee[]}>;
      if(isGeoChat) {
        if(!userLocationAddress || !userLocationCoords) {
          toggle();
          return;
        }

        const options: Parameters<AppChatsManager['createChannel']>[0] = {
          title: groupTitle,
          about: '',
          geo_point: {
            _: 'inputGeoPoint',
            ...userLocationCoords
          },
          address: userLocationAddress,
          megagroup: true
        };
        promise = handleChannelsTooMuch(() => tab.managers.appChatsManager.createChannel(options))
        .then(async(chatId) => {
          if(uploadAvatar) {
            uploadAvatar.file().then((inputFile) => {
              tab.managers.appChatsManager.editPhoto(chatId, inputFile);
            });
          }

          const missingInvitees = peerIds.length ?
            await tab.managers.appChatsManager.inviteToChannel(chatId, peerIds) :
            [];
          return {chatId, missingInvitees};
        });
      } else {
        if(asChannel) {
          const options: Parameters<AppChatsManager['createChannel']>[0] = {
            megagroup: true,
            title: groupTitle,
            about: ''
          };
          promise = handleChannelsTooMuch(() => tab.managers.appChatsManager.createChannel(options))
          .then((chatId) => ({chatId, missingInvitees: [] as MissingInvitee[]}));

          if(peerIds.length) {
            promise = promise.then(({chatId}) => {
              return tab.managers.appChatsManager.inviteToChannel(chatId, userIds)
              .then((missingInvitees) => ({chatId, missingInvitees}));
            });
          }
        } else {
          promise = tab.managers.appChatsManager.createChat(
            groupTitle,
            userIds
          );
        }

        promise = promise.then((result) => {
          if(uploadAvatar) {
            uploadAvatar.file().then((inputFile) => {
              tab.managers.appChatsManager.editPhoto(result.chatId, inputFile);
            });
          }

          return result;
        });
      }

      if(!promise) {
        toggle();
        return;
      }

      promise.then(({chatId, missingInvitees}) => {
        onCreate?.(chatId);
        tab.close();
        if(openAfter) appImManager.setInnerPeer({peerId: chatId.toPeerId(true)});
        handleMissingInvitees(chatId, missingInvitees);
      }, (err) => {
        console.error('createGroup error', err);
        toggle();
      });
    }, {listenerSetter: tab.listenerSetter});

    const chatsSection = new SettingSection({
      name: 'Members',
      nameArgs: [peerIds.length]
    });

    if(!peerIds.length) {
      chatsSection.container.classList.add('hide');
    }

    chatsSection.content.append(list);

    section.content.append(avatarEdit.container, inputWrapper);

    tab.content.append(nextBtn);
    tab.scrollable.append(section.container, chatsSection.container);

    if(isGeoChat) {
      tab.title.replaceChildren(i18n('NearbyCreateGroup'));
      groupLocationInputField.container.classList.remove('hide');
      groupLocationInputField.setValueSilently(I18n.format('Loading', true));
      startLocating();
    } else {
      groupLocationInputField.container.classList.add('hide');
    }

    const usersPromise = Promise.all(peerIds.map((peerId) => tab.managers.appUsersManager.getUser(peerId.toUserId())));
    const myUserPromise = tab.managers.appUsersManager.getSelf();

    const a = usersPromise.then((users) => {
      users.forEach((user) => {
        const {dom} = appDialogsManager.addDialogNew({
          peerId: user.id.toPeerId(false),
          container: list,
          rippleEnabled: false,
          avatarSize: 'abitbigger',
          wrapOptions: {
            middleware: tab.middlewareHelper.get()
          }
        });

        dom.lastMessageSpan.append(getUserStatusString(user));
      });
    });

    let setTitlePromise: Promise<void>;

    if(!title) {
      setTitlePromise = peerIds.length > 0 && peerIds.length < 5 ? Promise.all([usersPromise, myUserPromise]).then(([users, myUser]) => {
        const names = users.map((user) => [user.first_name, user.last_name, user.username].find(Boolean));
        names.unshift(myUser.first_name);

        names[0] = names[0] + ' & ' + names.splice(1, 1)[0];
        groupNameInputField.setDraftValue(names.join(', '));
      }) : Promise.resolve();
    } else {
      groupNameInputField.setDraftValue(title);
    }

    promiseCollector.collect(Promise.all([a, setTitlePromise]));
  });

  onCleanup(() => {
    avatarEdit.clear();
    uploadAvatar = null;
  });

  return null;
};

export default NewGroup;
