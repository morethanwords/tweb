import {Component} from 'solid-js';
import InputField from '@components/inputField';
import EditPeer from '@components/editPeer';
import Row, {CreateRowFromCheckboxField} from '@components/row';
import CheckboxField from '@components/checkboxField';
import Button from '@components/button';
import PeerTitle from '@components/peerTitle';
import rootScope from '@lib/rootScope';
import PopupPeer from '@components/popups/peer';
import PopupElement, {addCancelButton} from '@components/popups';
import {i18n} from '@lib/langPack';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import formatUserPhone from '@components/wrappers/formatUserPhone';
import SettingSection from '@components/settingSection';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {InputFieldEmoji} from '@components/inputFieldEmoji';
import {toastNew} from '@components/toast';
import showBirthdayPopup, {suggestUserBirthday} from '@components/popups/birthday';
import {pickAvatarAndUpload} from '@components/avatarEdit';
import confirmationPopup from '@components/confirmationPopup';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppEditContactTab} from '@components/solidJsTabs/tabs';

const EditContact: Component = () => {
  const [tab] = useSuperTab<typeof AppEditContactTab>();
  const promiseCollector = usePromiseCollector();
  const peerId = tab.payload;

  promiseCollector.collect((async() => {
    const userId = peerId.toUserId();
    tab.container.classList.add('edit-peer-container', 'edit-contact-container');
    const [isContact, privacy] = await Promise.all([
      tab.managers.appUsersManager.isContact(userId),
      tab.managers.appPrivacyManager.getPrivacy('inputPrivacyKeyPhoneNumber')
    ]);
    const isNew = !isContact;
    tab.title.replaceChildren(i18n(isNew ? 'AddContactTitle' : 'Edit'));

    let nameInputField: InputField;
    let lastNameInputField: InputField;
    let noteInputField: InputFieldEmoji;
    let editPeer: EditPeer;
    let sharePhoneCheckboxField: CheckboxField;

    let suggestBirthdayRow: Row | undefined;

    // Tracks the personal/suggest photo section so it can be re-rendered in place
    // after the personal photo is set/suggested/reset.
    let photoSectionContainer: HTMLElement | undefined;

    // Built as a function (not inline) so it can be re-rendered in place after the
    // personal photo is set/reset — e.g. dropping the "Reset" button + flipping
    // "Update Photo" back to "Set Photo" once the custom photo is removed.
    async function buildPhotoSection(): Promise<HTMLElement> {
      const [user, fullUser] = await Promise.all([
        tab.managers.appUsersManager.getUser(userId),
        tab.managers.appProfileManager.getProfile(userId)
      ]);
      const hasPersonal = !!fullUser?.personal_photo;
      const firstName = user.first_name || '';

      const photoSection = new SettingSection({caption: 'UserInfo.CustomPhotoHelp'});

      const btnSetPhoto = Button('btn-primary btn-transparent', {
        icon: 'cameraadd',
        text: hasPersonal ? 'UserInfo.UpdatePhotoFor' : 'UserInfo.SetPhotoFor',
        textArgs: [firstName]
      });
      attachClickEvent(btnSetPhoto, () => {
        pickAvatarAndUpload({
          managers: tab.managers,
          mode: {userId},
          onUploaded: () => {
            toastNew({langPackKey: 'UserInfo.PhotoSetToast', langPackArguments: [firstName]});
            refreshPhotoSection();
          }
        });
      }, {listenerSetter: tab.listenerSetter});

      const btnSuggestPhoto = Button('btn-primary btn-transparent', {
        icon: 'edit',
        text: 'UserInfo.SuggestPhotoFor',
        textArgs: [firstName]
      });
      attachClickEvent(btnSuggestPhoto, () => {
        pickAvatarAndUpload({
          managers: tab.managers,
          mode: {userId, suggest: true},
          onUploaded: () => {
            toastNew({langPackKey: 'UserInfo.PhotoSuggestedToast', langPackArguments: [firstName]});
            refreshPhotoSection();
          }
        });
      }, {listenerSetter: tab.listenerSetter});

      photoSection.content.append(btnSetPhoto, btnSuggestPhoto);

      if(hasPersonal) {
        const btnResetPhoto = Button('btn-primary btn-transparent danger', {
          icon: 'delete',
          text: 'UserInfo.RemovePersonalPhoto'
        });
        attachClickEvent(btnResetPhoto, async() => {
          try {
            await confirmationPopup({
              titleLangKey: 'UserInfo.ResetCustomPhoto',
              descriptionLangKey: 'UserInfo.ResetCustomPhotoDescription',
              button: {langKey: 'Reset', isDanger: true}
            });
          } catch{ return; }
          await tab.managers.appProfileManager.uploadContactProfilePhoto({userId, save: true});
          toastNew({langPackKey: 'UserInfo.PhotoResetToast'});
          refreshPhotoSection();
        }, {listenerSetter: tab.listenerSetter});
        photoSection.content.append(btnResetPhoto);
      }

      return photoSection.container;
    }

    async function refreshPhotoSection() {
      const old = photoSectionContainer;
      if(!old?.isConnected) return;
      // Force-refetch the full user before rebuilding: right after a set/suggest/reset
      // the cached full user is stale (re-populated by the updateUser local update with
      // the old personal_photo), so getProfile() alone would keep the wrong Set/Update
      // label + Reset-button visibility. refreshFullPeer drops the cache + refetches.
      await tab.managers.appProfileManager.refreshFullPeer(peerId);
      if(!old.isConnected) return; // tab closed while the fresh profile loaded
      const fresh = await buildPhotoSection();
      if(!old.isConnected) return;
      old.replaceWith(fresh);
      photoSectionContainer = fresh;
    }

    {
      const section = new SettingSection({noDelimiter: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      nameInputField = new InputField({
        label: 'FirstName',
        name: 'contact-name',
        maxLength: 70,
        required: true
      });
      lastNameInputField = new InputField({
        label: 'LastName',
        name: 'contact-lastname',
        maxLength: 70
      });

      if(userId) {
        const user = await tab.managers.appUsersManager.getUser(userId);

        if(isNew) {
          nameInputField.setDraftValue(user.first_name);
          lastNameInputField.setDraftValue(user.last_name);
        } else {
          nameInputField.setOriginalValue(user.first_name);
          lastNameInputField.setOriginalValue(user.last_name);
        }
      }

      inputWrapper.append(nameInputField.container, lastNameInputField.container);
      inputFields.push(nameInputField, lastNameInputField);

      if(userId) {
        // getProfile (not getCachedFullUser): resetting a personal photo deletes
        // the cached full user, so a cached lookup here returns undefined and
        // crashes on reopen ("Cannot read properties of undefined (reading 'note')").
        const fullUser = await tab.managers.appProfileManager.getProfile(userId);
        noteInputField = new InputFieldEmoji({
          label: 'ContactNoteRow',
          name: 'contact-note',
          maxLength: 128,
          withLinebreaks: true
        });
        if(fullUser?.note) {
          noteInputField.setRichOriginalValue(fullUser.note);
        }
        inputFields.push(noteInputField);
        inputWrapper.append(noteInputField.container);

        if(!fullUser?.birthday) {
          suggestBirthdayRow = new Row({
            title: i18n('SuggestBirthdayRow'),
            icon: 'gift',
            clickable: () => {
              showBirthdayPopup({
                suggestForPeer: peerId,
                onSave: (it) => suggestUserBirthday(userId, it)
              });
            }
          });
        }
      }

      editPeer = new EditPeer({
        peerId: peerId,
        inputFields,
        listenerSetter: tab.listenerSetter,
        doNotEditAvatar: true,
        middleware: tab.middlewareHelper.get()
      });
      tab.content.append(editPeer.nextBtn);

      if(peerId) {
        const div = document.createElement('div');
        div.classList.add('avatar-edit');
        div.append(editPeer.avatarElem.node);

        const notificationsCheckboxField = new CheckboxField({
          text: 'Notifications'
        });

        notificationsCheckboxField.input.addEventListener('change', (e) => {
          if(!e.isTrusted) {
            return;
          }

          tab.managers.appMessagesManager.togglePeerMute({peerId});
        });

        tab.listenerSetter.add(rootScope)('notify_settings', async(update) => {
          if(update.peer._ !== 'notifyPeer') return;
          const peerId = getPeerId(update.peer.peer);
          if(peerId === peerId) {
            const enabled = !(await tab.managers.appNotificationsManager.isMuted(update.notify_settings));
            if(enabled !== notificationsCheckboxField.checked) {
              notificationsCheckboxField.checked = enabled;
            }
          }
        });

        const profileNameDiv = document.createElement('div');
        profileNameDiv.classList.add('profile-name');
        profileNameDiv.append(new PeerTitle({
          peerId
        }).element);

        const profileSubtitleDiv = document.createElement('div');
        profileSubtitleDiv.classList.add('profile-subtitle');
        profileSubtitleDiv.append(i18n('EditContact.OriginalName'));

        tab.scrollable.append(div, profileNameDiv, profileSubtitleDiv);
        section.content.append(inputWrapper);

        if(!isNew) {
          const notificationsRow = new Row({
            checkboxField: notificationsCheckboxField,
            withCheckboxSubtitle: true,
            listenerSetter: tab.listenerSetter
          });

          const enabled = !(await tab.managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: false}));
          notificationsCheckboxField.checked = enabled;

          section.content.append(notificationsRow.container);

          if(suggestBirthdayRow) {
            section.content.append(suggestBirthdayRow.container);
          }
        } else {
          const user = await tab.managers.appUsersManager.getUser(userId);

          const phoneRow = new Row({
            icon: 'phone',
            titleLangKey: user.phone ? undefined : 'MobileHidden',
            title: user.phone ? formatUserPhone(user.phone) : undefined,
            subtitleLangKey: user.phone ? 'Phone' : 'MobileHiddenExceptionInfo',
            subtitleLangArgs: user.phone ? undefined : [new PeerTitle({peerId: peerId}).element]
          });

          section.content.append(phoneRow.container);
        }
      } else {
        section.content.append(inputWrapper);
      }

      tab.scrollable.append(section.container);
    }

    if(!isNew) {
      photoSectionContainer = await buildPhotoSection();
      tab.scrollable.append(photoSectionContainer);

      const section = new SettingSection();

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'PeerInfo.DeleteContact'});

      attachClickEvent(btnDelete, () => {
        PopupElement.createPopup(PopupPeer, 'popup-delete-contact', {
          peerId: peerId,
          titleLangKey: 'DeleteContact',
          descriptionLangKey: 'AreYouSureDeleteContact',
          buttons: addCancelButton([{
            langKey: 'Delete',
            callback: () => {
              const toggle = toggleDisability([btnDelete], true);

              tab.managers.appUsersManager.deleteContacts([userId]).then(() => {
                tab.close();
              }, () => {
                toggle();
              });
            },
            isDanger: true
          }])
        }).show();
      }, {listenerSetter: tab.listenerSetter});

      section.content.append(btnDelete);

      tab.scrollable.append(section.container);
    } else if(
      privacy.some((privacyRule) => privacyRule._ === 'privacyValueDisallowAll') &&
      !privacy.some((privacyRule) => privacyRule._ === 'privacyValueAllowUsers' && privacyRule.users.includes(userId))
    ) {
      const section = new SettingSection({
        caption: 'NewContact.Exception.ShareMyPhoneNumber.Desc',
        captionArgs: [await wrapPeerTitle({peerId})]
      });
      const checkboxField = sharePhoneCheckboxField = new CheckboxField({
        text: 'NewContact.Exception.ShareMyPhoneNumber',
        checked: true
      });
      const row = CreateRowFromCheckboxField(checkboxField);

      section.content.append(row.container);

      tab.scrollable.append(section.container);
    }

    attachClickEvent(editPeer.nextBtn, async() => {
      editPeer.nextBtn.disabled = true;

      try {
        await tab.managers.appUsersManager.addContact(
          userId,
          nameInputField.value,
          lastNameInputField.value,
          (await tab.managers.appUsersManager.getUser(userId)).phone,
          sharePhoneCheckboxField?.checked
        );

        if(noteInputField.isChanged()) {
          await tab.managers.appProfileManager.updateUserNote(userId, noteInputField.richValue);
        }
      } catch(error) {
        console.error(error);
        toastNew({langPackKey: 'Error.AnError'});
        return;
      }

      editPeer.nextBtn.removeAttribute('disabled');
      tab.close();
    }, {listenerSetter: tab.listenerSetter});
  })());

  return null;
};

export default EditContact;
