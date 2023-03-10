/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SliderSuperTab, {SliderSuperTabEventable} from '../../sliderTab';
import Row from '../../row';
import {AccountPassword, Authorization, InputPrivacyKey, Updates, WebAuthorization} from '../../../layer';
import AppPrivacyPhoneNumberTab from './privacy/phoneNumber';
import AppTwoStepVerificationTab from './2fa';
import AppTwoStepVerificationEnterPasswordTab from './2fa/enterPassword';
import AppTwoStepVerificationEmailConfirmationTab from './2fa/emailConfirmation';
import AppPrivacyLastSeenTab from './privacy/lastSeen';
import AppPrivacyProfilePhotoTab from './privacy/profilePhoto';
import AppPrivacyForwardMessagesTab from './privacy/forwardMessages';
import AppPrivacyAddToGroupsTab from './privacy/addToGroups';
import AppPrivacyCallsTab from './privacy/calls';
import AppActiveSessionsTab from './activeSessions';
import AppBlockedUsersTab from './blockedUsers';
import rootScope from '../../../lib/rootScope';
import {i18n, LangPackKey, _i18n} from '../../../lib/langPack';
import replaceContent from '../../../helpers/dom/replaceContent';
import CheckboxField from '../../checkboxField';
import PopupPeer from '../../popups/peer';
import Button from '../../button';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import convertKeyToInputKey from '../../../helpers/string/convertKeyToInputKey';
import getPrivacyRulesDetails from '../../../lib/appManagers/utils/privacy/getPrivacyRulesDetails';
import PrivacyType from '../../../lib/appManagers/utils/privacy/privacyType';
import confirmationPopup, {PopupConfirmationOptions} from '../../confirmationPopup';
import noop from '../../../helpers/noop';
import {toastNew} from '../../toast';
import AppPrivacyVoicesTab from './privacy/voices';
import SettingSection from '../../settingSection';
import AppActiveWebSessionsTab from './activeWebSessions';
import PopupElement from '../../popups';

export default class AppPrivacyAndSecurityTab extends SliderSuperTabEventable {
  private activeSessionsRow: Row;
  private authorizations: Authorization.authorization[];

  private websitesRow: Row;
  private websites: WebAuthorization[];

  public static getInitArgs(fromTab: SliderSuperTab) {
    return {
      appConfig: fromTab.managers.apiManager.getAppConfig(),
      globalPrivacy: fromTab.managers.appPrivacyManager.getGlobalPrivacySettings(),
      contentSettings: fromTab.managers.apiManager.invokeApi('account.getContentSettings'),
      webAuthorizations: fromTab.managers.appSeamlessLoginManager.getWebAuthorizations()
    };
  }

  public init(p: ReturnType<typeof AppPrivacyAndSecurityTab['getInitArgs']>) {
    this.container.classList.add('dont-u-dare-block-me');
    this.setTitle('PrivacySettings');

    const SUBTITLE: LangPackKey = 'Loading';
    const promises: Promise<any>[] = [];

    {
      const section = new SettingSection({noDelimiter: true, caption: 'SessionsInfo'});

      let blockedPeerIds: PeerId[];
      const blockedUsersRow = new Row({
        icon: 'deleteuser',
        titleLangKey: 'BlockedUsers',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          const tab = this.slider.createTab(AppBlockedUsersTab);
          tab.peerIds = blockedPeerIds;
          tab.open();
        },
        listenerSetter: this.listenerSetter
      });
      blockedUsersRow.freezed = true;

      let passwordState: AccountPassword;
      const twoFactorRowOptions = {
        icon: 'lock',
        titleLangKey: 'TwoStepVerification' as LangPackKey,
        subtitleLangKey: SUBTITLE,
        clickable: (e: Event) => {
          let tab: AppTwoStepVerificationTab | AppTwoStepVerificationEnterPasswordTab | AppTwoStepVerificationEmailConfirmationTab;
          if(passwordState.pFlags.has_password) {
            tab = this.slider.createTab(AppTwoStepVerificationEnterPasswordTab);
          } else if(passwordState.email_unconfirmed_pattern) {
            tab = this.slider.createTab(AppTwoStepVerificationEmailConfirmationTab);
            tab.email = passwordState.email_unconfirmed_pattern;
            tab.length = 6;
            tab.isFirst = true;
            this.managers.passwordManager.resendPasswordEmail();
          } else {
            tab = this.slider.createTab(AppTwoStepVerificationTab);
          }

          tab.state = passwordState;
          tab.open();
        },
        listenerSetter: this.listenerSetter
      };

      const twoFactorRow = new Row(twoFactorRowOptions);
      twoFactorRow.freezed = true;

      const activeSessionsRow = this.activeSessionsRow = new Row({
        icon: 'activesessions',
        titleLangKey: 'SessionsTitle',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          const tab = this.slider.createTab(AppActiveSessionsTab);
          tab.authorizations = this.authorizations;
          tab.eventListener.addEventListener('destroy', () => {
            this.updateActiveSessions();
          }, {once: true});
          tab.open();
        },
        listenerSetter: this.listenerSetter
      });
      activeSessionsRow.freezed = true;

      const websitesRow = this.websitesRow = new Row({
        icon: 'mention',
        titleLangKey: 'OtherWebSessions',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          const tab = this.slider.createTab(AppActiveWebSessionsTab);
          tab.eventListener.addEventListener('destroy', () => {
            this.updateActiveWebsites();
          });
          tab.open(this.websites);
        },
        listenerSetter: this.listenerSetter
      });
      websitesRow.freezed = true;

      section.content.append(blockedUsersRow.container, twoFactorRow.container, activeSessionsRow.container, websitesRow.container);
      this.scrollable.append(section.container);

      const setBlockedCount = (count: number) => {
        if(count) {
          replaceContent(blockedUsersRow.subtitle, i18n('PrivacySettingsController.UserCount', [count]));
        } else {
          replaceContent(blockedUsersRow.subtitle, i18n('BlockedEmpty', [count]));
        }
      };

      this.listenerSetter.add(rootScope)('peer_block', () => {
        /* const {blocked, peerId} = update;
        if(!blocked) blockedPeerIds.findAndSplice((p) => p === peerId);
        else blockedPeerIds.unshift(peerId);
        blockedCount += blocked ? 1 : -1;
        setBlockedCount(blockedCount); */
        updateBlocked();
      });

      const updateBlocked = () => {
        this.managers.appUsersManager.getBlocked().then((res) => {
          blockedUsersRow.freezed = false;
          setBlockedCount(res.count);
          blockedPeerIds = res.peerIds;
        });
      };

      updateBlocked();

      this.managers.passwordManager.getState().then((state) => {
        passwordState = state;
        replaceContent(twoFactorRow.subtitle, i18n(state.pFlags.has_password ? 'PrivacyAndSecurity.Item.On' : 'PrivacyAndSecurity.Item.Off'));
        twoFactorRow.freezed = false;

        // console.log('password state', state);
      });

      this.updateActiveSessions();
      promises.push(this.updateActiveWebsites(p.webAuthorizations));
    }

    {
      const section = new SettingSection({name: 'PrivacyTitle', caption: 'GroupsAndChannelsHelp'});

      section.content.classList.add('privacy-navigation-container');

      const rowsByKeys: Partial<{
        [key in InputPrivacyKey['_']]: Row
      }> = {};

      const numberVisibilityRow = rowsByKeys['inputPrivacyKeyPhoneNumber'] = new Row({
        titleLangKey: 'PrivacyPhoneTitle',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyPhoneNumberTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const lastSeenTimeRow = rowsByKeys['inputPrivacyKeyStatusTimestamp'] = new Row({
        titleLangKey: 'LastSeenTitle',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyLastSeenTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const photoVisibilityRow = rowsByKeys['inputPrivacyKeyProfilePhoto'] = new Row({
        titleLangKey: 'PrivacyProfilePhotoTitle',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyProfilePhotoTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const callRow = rowsByKeys['inputPrivacyKeyPhoneCall'] = new Row({
        titleLangKey: 'WhoCanCallMe',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyCallsTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const linkAccountRow = rowsByKeys['inputPrivacyKeyForwards'] = new Row({
        titleLangKey: 'PrivacyForwardsTitle',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyForwardMessagesTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const groupChatsAddRow = rowsByKeys['inputPrivacyKeyChatInvite'] = new Row({
        titleLangKey: 'WhoCanAddMe',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyAddToGroupsTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const voicesRow = rowsByKeys['inputPrivacyKeyVoiceMessages'] = new Row({
        titleLangKey: 'PrivacyVoiceMessagesTitle',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          if(!rootScope.premium) {
            toastNew({langPackKey: 'PrivacyVoiceMessagesPremiumOnly'});
          } else {
            this.slider.createTab(AppPrivacyVoicesTab).open();
          }
        },
        listenerSetter: this.listenerSetter
      });

      const updatePrivacyRow = (key: InputPrivacyKey['_']) => {
        const row = rowsByKeys[key];
        if(!row) {
          return;
        }

        this.managers.appPrivacyManager.getPrivacy(key).then((rules) => {
          const details = getPrivacyRulesDetails(rules);
          const langKey = details.type === PrivacyType.Everybody ? 'PrivacySettingsController.Everbody' : (details.type === PrivacyType.Contacts ? 'PrivacySettingsController.MyContacts' : 'PrivacySettingsController.Nobody');
          const disallowLength = details.disallowPeers.users.length + details.disallowPeers.chats.length;
          const allowLength = details.allowPeers.users.length + details.allowPeers.chats.length;

          const s = i18n(langKey);
          row.subtitle.replaceChildren(s);
          if(disallowLength || allowLength) {
            row.subtitle.append(` (${[-disallowLength, allowLength ? '+' + allowLength : 0].filter(Boolean).join(', ')})`);
          }
        });
      };

      section.content.append(
        numberVisibilityRow.container,
        lastSeenTimeRow.container,
        photoVisibilityRow.container,
        callRow.container,
        linkAccountRow.container,
        groupChatsAddRow.container,
        voicesRow.container
      );
      this.scrollable.append(section.container);

      for(const key in rowsByKeys) {
        updatePrivacyRow(key as keyof typeof rowsByKeys);
      }

      rootScope.addEventListener('privacy_update', (update) => {
        updatePrivacyRow(convertKeyToInputKey(update.key._) as any);
      });
    }

    {
      const section = new SettingSection({name: 'NewChatsFromNonContacts', caption: 'ArchiveAndMuteInfo'});

      const checkboxField = new CheckboxField({text: 'ArchiveAndMute'});
      const row = new Row({
        checkboxField
      });

      section.content.append(row.container);

      let enabled: boolean, destroyed: boolean;
      this.eventListener.addEventListener('destroy', () => {
        destroyed = true;
        if(enabled === undefined || enabled === checkboxField.checked) return;
        return this.managers.appPrivacyManager.setGlobalPrivacySettings({
          _: 'globalPrivacySettings',
          archive_and_mute_new_noncontact_peers: checkboxField.checked
        });
      }, {once: true});

      const promise = Promise.all([
        p.appConfig,
        p.globalPrivacy
      ]).then(([appConfig, settings]) => {
        if(destroyed) {
          return;
        }

        const onPremiumToggle = (isPremium: boolean) => {
          section.container.classList.toggle('hide', !isPremium && !appConfig.autoarchive_setting_available);
        };

        this.listenerSetter.add(rootScope)('premium_toggle', onPremiumToggle);
        onPremiumToggle(rootScope.premium);

        enabled = !!settings.archive_and_mute_new_noncontact_peers;

        checkboxField.setValueSilently(enabled);
      });

      promises.push(promise);

      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'Privacy.SensitiveContent', caption: 'PrivacyAndSecurity.SensitiveDesc'});
      section.container.classList.add('hide');

      const checkboxField = new CheckboxField({text: 'PrivacyAndSecurity.SensitiveText'});
      const row = new Row({
        checkboxField
      });

      section.content.append(row.container);

      let enabled: boolean;
      this.eventListener.addEventListener('destroy', () => {
        if(enabled === undefined) return;
        const _enabled = row.checkboxField.checked;
        const isChanged = _enabled !== enabled;
        if(!isChanged) {
          return;
        }

        return this.managers.apiManager.invokeApi('account.setContentSettings', {
          sensitive_enabled: _enabled
        });
      }, {once: true});

      const promise = p.contentSettings.then((settings) => {
        if(!settings.pFlags.sensitive_can_change) {
          return;
        }

        enabled = !!settings.pFlags.sensitive_enabled;
        checkboxField.setValueSilently(enabled);
        section.container.classList.remove('hide');
      });

      promises.push(promise);

      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'PrivacyPayments', caption: 'PrivacyPaymentsClearInfo'});

      const onClearClick = () => {
        const options: PopupConfirmationOptions = {
          titleLangKey: 'PrivacyPaymentsClearAlertTitle',
          descriptionLangKey: 'PrivacyPaymentsClearAlertText',
          button: {
            langKey: 'Clear'
          },
          checkboxes: [{
            text: 'PrivacyClearShipping',
            checked: true
          }, {
            text: 'PrivacyClearPayment',
            checked: true
          }]
        };

        confirmationPopup(options).then(() => {
          const [info, payment] = options.checkboxes.map((c) => c.checkboxField.checked);
          const toggle = toggleDisability([clearButton], true);
          this.managers.appPaymentsManager.clearSavedInfo(info, payment).then(() => {
            if(!info && !payment) {
              return;
            }

            toggle();
            toastNew({
              langPackKey: info && payment ? 'PrivacyPaymentsPaymentShippingCleared' : (info ? 'PrivacyPaymentsShippingInfoCleared' : 'PrivacyPaymentsPaymentInfoCleared')
            });
          });
        }, noop);
      };

      const clearButton = Button('btn-primary btn-transparent', {icon: 'delete', text: 'PrivacyPaymentsClear'});
      this.listenerSetter.add(clearButton)('click', onClearClick);
      section.content.append(clearButton);

      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'FilterChats'});

      const onDeleteClick = () => {
        const popup = PopupElement.createPopup(PopupPeer, 'popup-delete-drafts', {
          buttons: [{
            langKey: 'Delete',
            callback: () => {
              const toggle = toggleDisability([deleteButton], true);
              this.managers.appDraftsManager.clearAllDrafts().then(() => {
                toggle();
              });
            },
            isDanger: true
          }],
          titleLangKey: 'AreYouSureClearDraftsTitle',
          descriptionLangKey: 'AreYouSureClearDrafts'
        });

        popup.show();
      };

      const deleteButton = Button('btn-primary btn-transparent', {icon: 'delete', text: 'PrivacyDeleteCloudDrafts'});
      this.listenerSetter.add(deleteButton)('click', onDeleteClick);
      section.content.append(deleteButton);

      /* promises.push(apiManager.invokeApi('messages.getAllDrafts').then((drafts) => {
        const draftsRow = new Row({
          titleLangKey: 'PrivacyDeleteCloudDrafts',
          subtitleLangKey: 'Drafts',
          subtitleLangArgs: [(drafts as Updates.updates).updates.length],
          icon: 'delete',
          clickable: onDeleteClick
        });

        section.content.append(draftsRow.container);
      })); */

      this.scrollable.append(section.container);
    }

    // {
    //   const section = new SettingSection({
    //     name: 'OtherWebSessions'
    //   });

    //   const row = new Row({

    //   });

    //   this.scrollable.append(section.container);
    // }

    return Promise.all(promises);
  }

  public updateActiveSessions() {
    return this.managers.apiManager.invokeApi('account.getAuthorizations').then((auths) => {
      this.activeSessionsRow.freezed = false;
      this.authorizations = auths.authorizations;
      _i18n(this.activeSessionsRow.subtitle, 'Privacy.Devices', [this.authorizations.length]);
    });
  }

  public updateActiveWebsites(promise = this.managers.appSeamlessLoginManager.getWebAuthorizations()) {
    return promise.then((authorizations) => {
      this.websitesRow.freezed = false;
      this.websites = authorizations;
      _i18n(this.websitesRow.subtitle, 'Privacy.Websites', [this.websites.length]);
      this.websitesRow.container.classList.toggle('hide', !this.websites.length);
    });
  }
}
