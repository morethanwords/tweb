/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '@components/slider'
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
import {wrapEmojiTextWithEntities} from '@lib/richTextProcessor/wrapEmojiText';
import EditFolderInput from '@components/sidebarLeft/tabs/editFolderInput';
import {InputFieldEmoji} from '@components/inputFieldEmoji';
import {toastNew} from '@components/toast';
import showBirthdayPopup, {suggestUserBirthday} from '@components/popups/birthday';

export default class AppEditContactTab extends SliderSuperTab {
  private nameInputField: InputField;
  private lastNameInputField: InputField;
  private noteInputField: InputFieldEmoji;
  private editPeer: EditPeer;
  private sharePhoneCheckboxField: CheckboxField;
  public peerId: PeerId;

  public async init() {
    const {peerId} = this;
    const userId = peerId.toUserId();
    this.container.classList.add('edit-peer-container', 'edit-contact-container');
    const [isContact, privacy] = await Promise.all([
      this.managers.appUsersManager.isContact(userId),
      this.managers.appPrivacyManager.getPrivacy('inputPrivacyKeyPhoneNumber')
    ]);
    const isNew = !isContact;
    this.setTitle(isNew ? 'AddContactTitle' : 'Edit');

    let suggestBirthdayRow: Row | undefined;

    {
      const section = new SettingSection({noDelimiter: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.nameInputField = new InputField({
        label: 'FirstName',
        name: 'contact-name',
        maxLength: 70,
        required: true
      });
      this.lastNameInputField = new InputField({
        label: 'LastName',
        name: 'contact-lastname',
        maxLength: 70
      });

      if(userId) {
        const user = await this.managers.appUsersManager.getUser(userId);

        if(isNew) {
          this.nameInputField.setDraftValue(user.first_name);
          this.lastNameInputField.setDraftValue(user.last_name);
        } else {
          this.nameInputField.setOriginalValue(user.first_name);
          this.lastNameInputField.setOriginalValue(user.last_name);
        }
      }

      inputWrapper.append(this.nameInputField.container, this.lastNameInputField.container);
      inputFields.push(this.nameInputField, this.lastNameInputField);

      if(userId) {
        const fullUser = await this.managers.appProfileManager.getCachedFullUser(userId);
        this.noteInputField = new InputFieldEmoji({
          label: 'ContactNoteRow',
          name: 'contact-note',
          maxLength: 128,
          withLinebreaks: true
        });
        if(fullUser.note) {
          this.noteInputField.setRichOriginalValue(fullUser.note);
        }
        inputFields.push(this.noteInputField);
        inputWrapper.append(this.noteInputField.container);

        if(!fullUser.birthday) {
          suggestBirthdayRow = new Row({
            title: i18n('SuggestBirthdayRow'),
            icon: 'gift',
            clickable: () => {
              showBirthdayPopup({
                suggestForPeer: peerId,
                onSave: it => suggestUserBirthday(userId, it)
              })
            }
          })
        }
      }

      this.editPeer = new EditPeer({
        peerId: peerId,
        inputFields,
        listenerSetter: this.listenerSetter,
        doNotEditAvatar: true,
        middleware: this.middlewareHelper.get()
      });
      this.content.append(this.editPeer.nextBtn);

      if(peerId) {
        const div = document.createElement('div');
        div.classList.add('avatar-edit');
        div.append(this.editPeer.avatarElem.node);

        const notificationsCheckboxField = new CheckboxField({
          text: 'Notifications'
        });

        notificationsCheckboxField.input.addEventListener('change', (e) => {
          if(!e.isTrusted) {
            return;
          }

          this.managers.appMessagesManager.togglePeerMute({peerId});
        });

        this.listenerSetter.add(rootScope)('notify_settings', async(update) => {
          if(update.peer._ !== 'notifyPeer') return;
          const peerId = getPeerId(update.peer.peer);
          if(peerId === peerId) {
            const enabled = !(await this.managers.appNotificationsManager.isMuted(update.notify_settings));
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

        section.content.append(div, profileNameDiv, profileSubtitleDiv, inputWrapper);

        if(!isNew) {
          const notificationsRow = new Row({
            checkboxField: notificationsCheckboxField,
            withCheckboxSubtitle: true,
            listenerSetter: this.listenerSetter
          });

          const enabled = !(await this.managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: false}));
          notificationsCheckboxField.checked = enabled;

          section.content.append(notificationsRow.container);

          if(suggestBirthdayRow) {
            section.content.append(suggestBirthdayRow.container);
          }
        } else {
          const user = await this.managers.appUsersManager.getUser(userId);

          const phoneRow = new Row({
            icon: 'phone',
            titleLangKey: user.phone ? undefined : 'MobileHidden',
            title: user.phone ? formatUserPhone(user.phone)  : undefined,
            subtitleLangKey: user.phone ? 'Phone' : 'MobileHiddenExceptionInfo',
            subtitleLangArgs: user.phone ? undefined : [new PeerTitle({peerId: peerId}).element]
          });

          section.content.append(phoneRow.container);
        }
      } else {
        section.content.append(inputWrapper);
      }

      this.scrollable.append(section.container);
    }

    if(!isNew) {
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

              this.managers.appUsersManager.deleteContacts([userId]).then(() => {
                this.close();
              }, () => {
                toggle();
              });
            },
            isDanger: true
          }])
        }).show();
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btnDelete);

      this.scrollable.append(section.container);
    } else if(
      privacy.some((privacyRule) => privacyRule._ === 'privacyValueDisallowAll') &&
      !privacy.some((privacyRule) => privacyRule._ === 'privacyValueAllowUsers' && privacyRule.users.includes(userId))
    ) {
      const section = new SettingSection({
        caption: 'NewContact.Exception.ShareMyPhoneNumber.Desc',
        captionArgs: [await wrapPeerTitle({peerId: this.peerId})]
      });
      const checkboxField = this.sharePhoneCheckboxField = new CheckboxField({
        text: 'NewContact.Exception.ShareMyPhoneNumber',
        checked: true
      });
      const row = CreateRowFromCheckboxField(checkboxField);

      section.content.append(row.container);

      this.scrollable.append(section.container);
    }

    attachClickEvent(this.editPeer.nextBtn, async() => {
      this.editPeer.nextBtn.disabled = true;

      try {
        await this.managers.appUsersManager.addContact(
          userId,
          this.nameInputField.value,
          this.lastNameInputField.value,
          (await this.managers.appUsersManager.getUser(userId)).phone,
          this.sharePhoneCheckboxField?.checked
        )

        if(this.noteInputField.isChanged()) {
          await this.managers.appProfileManager.updateUserNote(userId, this.noteInputField.richValue);
        }
      } catch(error) {
        console.error(error)
        toastNew({langPackKey: 'Error.AnError'});
        return
      }

      this.editPeer.nextBtn.removeAttribute('disabled');
      this.close();
    }, {listenerSetter: this.listenerSetter});
  }
}
