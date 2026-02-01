/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SliderSuperTab, {SliderSuperTabEventable} from '@components/sliderTab';
import Row from '@components/row';
import {AccountPassword, GlobalPrivacySettings, InputPrivacyKey, Passkey, WebAuthorization} from '@layer';
import AppPrivacyPhoneNumberTab from '@components/sidebarLeft/tabs/privacy/phoneNumber';
import AppTwoStepVerificationTab from '@components/sidebarLeft/tabs/2fa';
import AppTwoStepVerificationEnterPasswordTab from '@components/sidebarLeft/tabs/2fa/enterPassword';
import AppTwoStepVerificationEmailConfirmationTab from '@components/sidebarLeft/tabs/2fa/emailConfirmation';
import AppPrivacyLastSeenTab from '@components/sidebarLeft/tabs/privacy/lastSeen';
import AppPrivacyProfilePhotoTab from '@components/sidebarLeft/tabs/privacy/profilePhoto';
import AppPrivacyForwardMessagesTab from '@components/sidebarLeft/tabs/privacy/forwardMessages';
import AppPrivacyAddToGroupsTab from '@components/sidebarLeft/tabs/privacy/addToGroups';
import AppPrivacyCallsTab from '@components/sidebarLeft/tabs/privacy/calls';
import AppBlockedUsersTab from '@components/sidebarLeft/tabs/blockedUsers';
import rootScope from '@lib/rootScope';
import {i18n, LangPackKey, _i18n} from '@lib/langPack';
import replaceContent from '@helpers/dom/replaceContent';
import CheckboxField from '@components/checkboxField';
import PopupPeer from '@components/popups/peer';
import Button from '@components/button';
import toggleDisability from '@helpers/dom/toggleDisability';
import convertKeyToInputKey from '@helpers/string/convertKeyToInputKey';
import getPrivacyRulesDetails from '@appManagers/utils/privacy/getPrivacyRulesDetails';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import confirmationPopup, {PopupConfirmationOptions} from '@components/confirmationPopup';
import noop from '@helpers/noop';
import {toastNew} from '@components/toast';
import AppPrivacyVoicesTab from '@components/sidebarLeft/tabs/privacy/voices';
import SettingSection from '@components/settingSection';
import AppActiveWebSessionsTab from '@components/sidebarLeft/tabs/activeWebSessions';
import PopupElement from '@components/popups';
import AppPrivacyAboutTab from '@components/sidebarLeft/tabs/privacy/about';
import apiManagerProxy from '@lib/apiManagerProxy';
import Icon from '@components/icon';
import {AppPrivacyMessagesTab} from '@components/solidJsTabs';
import {AppPasscodeEnterPasswordTab, AppPasscodeLockTab, AppPasskeysTab, providedTabs} from '@components/solidJsTabs';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {AgeVerificationPopup} from '@components/popups/ageVerification';
import {clearSensitiveSpoilers} from '@components/wrappers/mediaSpoiler';
import useContentSettings from '@stores/contentSettings';
import AppPrivacyBirthdayTab from '@components/sidebarLeft/tabs/privacy/birthday';
import ChangeLoginEmailTab from '@components/sidebarLeft/tabs/changeLoginEmail';
import {wrapEmailPattern} from '@components/popups/emailSetup';
import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';
import {createStore, SetStoreFunction} from 'solid-js/store';
import {createEffect, createRoot} from 'solid-js';
import showPasskeyPopup from '@components/popups/passkey';
import {AppMessagesAutoDeleteTab} from '@components/solidJsTabs/tabs';
import {findExistingOrCreateCustomOption} from '@components/sidebarLeft/tabs/autoDeleteMessages/options';

export default class AppPrivacyAndSecurityTab extends SliderSuperTabEventable {
  private websitesRow: Row;
  private websites: WebAuthorization[];

  private passkeyRow: Row;
  private passkeys: Passkey[];
  private setPasskeys: SetStoreFunction<Passkey[]>;

  public static getInitArgs(fromTab: SliderSuperTab) {
    return {
      appConfig: fromTab.managers.apiManager.getAppConfig(),
      globalPrivacy: fromTab.managers.appPrivacyManager.getGlobalPrivacySettings(),
      webAuthorizations: fromTab.managers.appSeamlessLoginManager.getWebAuthorizations()
    };
  }

  public async init(p: ReturnType<typeof AppPrivacyAndSecurityTab['getInitArgs']>) {
    this.container.classList.add('dont-u-dare-block-me');
    this.setTitle('PrivacySettings');
    const contentSettings = useContentSettings();

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
      const twoFactorRowOptions: ConstructorParameters<typeof Row>[0] = {
        icon: 'lock',
        titleLangKey: 'TwoStepVerification' as LangPackKey,
        subtitleLangKey: SUBTITLE,
        clickable: (e: Event) => {
          let tab: AppTwoStepVerificationTab | AppTwoStepVerificationEnterPasswordTab | AppTwoStepVerificationEmailConfirmationTab;
          if(passwordState.pFlags.has_password) {
            tab = this.slider.createTab(AppTwoStepVerificationEnterPasswordTab);
          } else if(passwordState.email_unconfirmed_pattern) {
            tab = this.slider.createTab(AppTwoStepVerificationEmailConfirmationTab);
            tab.email = wrapEmailPattern(passwordState.email_unconfirmed_pattern);
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

      const openPasskeysTab = () => {
        this.slider.createTab(AppPasskeysTab).open({
          passkeys: this.passkeys,
          setPasskeys: this.setPasskeys
        });
      };

      const passkeyRow = this.passkeyRow = new Row({
        icon: 'faceid',
        titleLangKey: 'Privacy.Passkeys',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          if(this.passkeys.length) {
            openPasskeysTab();
            return;
          }

          showPasskeyPopup((passkey) => {
            this.setPasskeys([passkey]);
            openPasskeysTab();
          });
        },
        listenerSetter: this.listenerSetter
      });

      this.updatePasskeys();

      const emailRow = new Row({
        titleLangKey: 'LoginEmail',
        subtitle: SUBTITLE,
        icon: 'email',
        clickable: () => {
          this.slider.createTab(ChangeLoginEmailTab).open({
            isInitialSetup: passwordState.login_email_pattern.includes(' ')
          });
        },
        listenerSetter: this.listenerSetter
      });
      emailRow.freezed = true;

      const passcodeLockRowOptions: ConstructorParameters<typeof Row>[0] = {
        icon: 'key',
        titleLangKey: 'PasscodeLock.Item.Title',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          if(passcodeEnabled) {
            this.slider.createTab(AppPasscodeEnterPasswordTab)
            .open({
              buttonText: 'PasscodeLock.Next',
              inputLabel: 'PasscodeLock.EnterYourPasscode',
              onSubmit: async(passcode, _, {isMyPasscode}) => {
                const isCorrect = await isMyPasscode(passcode);
                passcode = '';
                if(!isCorrect) throw {};

                this.slider.createTab(AppPasscodeLockTab).open();
              }
            })
          } else {
            this.slider.createTab(AppPasscodeLockTab).open();
          }
        },
        listenerSetter: this.listenerSetter
      };
      const passcodeLockRow = new Row(passcodeLockRowOptions);
      passcodeLockRow.freezed = true;

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

      let autoDeletePeriod: number;

      const autoDeleteMessagesRowOptions: ConstructorParameters<typeof Row>[0] = {
        icon: 'auto_delete_circle_clock',
        titleLangKey: 'AutoDeleteMessages',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          if(isNaN(autoDeletePeriod)) return;
          this.slider.createTab(AppMessagesAutoDeleteTab).open({
            period: autoDeletePeriod,
            onSaved: (period) => {
              autoDeletePeriod = period;
              updateAutoDeleteRow();
            }
          });
        },
        listenerSetter: this.listenerSetter
      };

      const autoDeleteMessagesRow = new Row(autoDeleteMessagesRowOptions);
      autoDeleteMessagesRow.freezed = true;

      section.content.append(
        blockedUsersRow.container,
        websitesRow.container,
        autoDeleteMessagesRow.container,
        passcodeLockRow.container,
        twoFactorRow.container,
        passkeyRow.container
      );
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

        if(state.login_email_pattern) {
          replaceContent(emailRow.subtitle, wrapEmailPattern(state.login_email_pattern));
          emailRow.freezed = false;
          twoFactorRow.container.after(emailRow.container);
        }

        // console.log('password state', state);
      });

      let passcodeEnabled: boolean;
      const setPasscodeEnabledState = (enabled?: boolean) => {
        passcodeEnabled = enabled;
        replaceContent(passcodeLockRow.subtitle, i18n(enabled ? 'PrivacyAndSecurity.Item.On' : 'PrivacyAndSecurity.Item.Off'));
      };
      this.managers.appStateManager.getState().then((state) => {
        passcodeLockRow.freezed = false;
        setPasscodeEnabledState(state.settings?.passcode?.enabled || false);
      });
      this.listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
        if(key === joinDeepPath('settings', 'passcode', 'enabled'))
          setPasscodeEnabledState(value);
      });

      promises.push(this.updateActiveWebsites(p.webAuthorizations));


      function updateAutoDeleteRow() {
        autoDeleteMessagesRow.subtitle.replaceChildren(
          !autoDeletePeriod ?
            i18n('Off') :
            findExistingOrCreateCustomOption(autoDeletePeriod).label()
        );
      }

      (async() => {
        autoDeletePeriod = await this.managers.appPrivacyManager.getDefaultAutoDeletePeriod();
        updateAutoDeleteRow();
        autoDeleteMessagesRow.freezed = false;
      })();
    }

    {
      const isPremiumFeaturesHidden = await apiManagerProxy.isPremiumFeaturesHidden();
      const section = new SettingSection({name: 'PrivacyTitle', caption: isPremiumFeaturesHidden ? 'GroupsAndChannelsHelp' : 'Privacy.MessagesCaption'});

      section.content.classList.add('privacy-navigation-container');

      type RowKey = InputPrivacyKey['_'] | (keyof GlobalPrivacySettings['pFlags']);

      const rowsByKeys: Partial<{
        [key in RowKey]: Row
      }> = {};

      const openTabWithGlobalPrivacy = async(
        constructor: typeof AppPrivacyLastSeenTab,
        key: RowKey
      ) => {
        const globalPrivacy = await p.globalPrivacy;
        const tab = this.slider.createTab(constructor);
        tab.open(globalPrivacy);
        tab.eventListener.addEventListener('privacy', (privacy) => {
          p.globalPrivacy = privacy;
          updatePrivacyRow(key);
        });
      };

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
          openTabWithGlobalPrivacy(AppPrivacyLastSeenTab, 'inputPrivacyKeyStatusTimestamp');
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

      const aboutRow = rowsByKeys['inputPrivacyKeyAbout'] = new Row({
        titleLangKey: 'Privacy.BioRow',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyAboutTab).open();
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

      const birthdayRow = rowsByKeys['inputPrivacyKeyBirthday'] = new Row({
        titleLangKey: 'Privacy.BirthdayRow',
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyBirthdayTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const createPremiumTitle = (langKey: LangPackKey) => {
        const fragment = document.createDocumentFragment();
        const icon = Icon('star', 'privacy-premium-icon');
        fragment.append(i18n(langKey), icon);
        const onPremium = () => {
          icon.classList.toggle('hide', !rootScope.premium);
        };
        onPremium();
        this.listenerSetter.add(rootScope)('premium_toggle', onPremium);
        return fragment;
      };

      let voicesRow: Row;
      if(!isPremiumFeaturesHidden) voicesRow = rowsByKeys['inputPrivacyKeyVoiceMessages'] = new Row({
        title: createPremiumTitle('PrivacyVoiceMessagesTitle'),
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyVoicesTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      let messagesRow: Row;
      if(!isPremiumFeaturesHidden) messagesRow = rowsByKeys['new_noncontact_peers_require_premium'] = new Row({
        title: createPremiumTitle('PrivacyMessagesTitle'),
        subtitleLangKey: SUBTITLE,
        clickable: () => {
          this.slider.createTab(AppPrivacyMessagesTab).open({
            onSaved: (updatedPrivacy) => {
              p.globalPrivacy = updatedPrivacy;
              updatePrivacyRow('new_noncontact_peers_require_premium');
            }
          });
        },
        listenerSetter: this.listenerSetter
      });

      const updatePrivacyRow = (key: RowKey) => {
        const row = rowsByKeys[key];
        if(!row) {
          return;
        }

        const map: {[key in PrivacyType]: LangPackKey} = {
          [PrivacyType.Everybody]: 'PrivacySettingsController.Everbody',
          [PrivacyType.Contacts]: 'PrivacySettingsController.MyContacts',
          [PrivacyType.Nobody]: 'PrivacySettingsController.Nobody'
        };

        const getLangKeyForMessagesPrivacy = (globalPrivacy: GlobalPrivacySettings.globalPrivacySettings): LangPackKey => {
          if(!rootScope.premium) return map[PrivacyType.Everybody];

          if(+globalPrivacy.noncontact_peers_paid_stars) return 'PrivacySettingsController.Paid';

          if(globalPrivacy.pFlags.new_noncontact_peers_require_premium) return 'Privacy.ContactsAndPremium';

          return map[PrivacyType.Everybody];
        };

        if(!key.startsWith('inputPrivacy')) {
          p.globalPrivacy.then((globalPrivacy) => {
            const langKey = getLangKeyForMessagesPrivacy(globalPrivacy);
            row.subtitle.replaceChildren(i18n(langKey));
          });
          return;
        }

        this.managers.appPrivacyManager.getPrivacy(key as InputPrivacyKey['_']).then((rules) => {
          const details = getPrivacyRulesDetails(rules);
          const langKey = map[details.type];
          const disallowLength = details.disallowPeers.users.length + details.disallowPeers.chats.length;
          const allowLength = details.allowPeers.users.length + details.allowPeers.chats.length;

          const s = i18n(langKey);
          row.subtitle.replaceChildren(s);
          if(disallowLength || allowLength) {
            row.subtitle.append(` (${[-disallowLength, allowLength ? '+' + allowLength : 0].filter(Boolean).join(', ')})`);
          }
        });
      };

      section.content.append(...[
        numberVisibilityRow,
        lastSeenTimeRow,
        photoVisibilityRow,
        aboutRow,
        callRow,
        linkAccountRow,
        groupChatsAddRow,
        voicesRow,
        messagesRow,
        birthdayRow
      ].filter(Boolean).map((row) => row.container));
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
      this.eventListener.addEventListener('destroy', async() => {
        destroyed = true;
        if(enabled === undefined || enabled === checkboxField.checked) return;
        return this.managers.appPrivacyManager.setGlobalPrivacySettings({
          _: 'globalPrivacySettings',
          pFlags: {
            ...(await p.globalPrivacy).pFlags,
            archive_and_mute_new_noncontact_peers: checkboxField.checked || undefined
          }
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

        enabled = !!settings.pFlags.archive_and_mute_new_noncontact_peers;

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

      let pendingChange = false;
      checkboxField.input.addEventListener('change', (evt) => {
        const newEnabled = checkboxField.checked;
        if(pendingChange) {
          checkboxField.input.checked = !newEnabled;
          return;
        }

        if(newEnabled && contentSettings.needAgeVerification() && !contentSettings.ageVerified()) {
          checkboxField.input.checked = false;
          AgeVerificationPopup.create().then((verified) => {
            if(verified) {
              checkboxField.setValueSilently(true);
              clearSensitiveSpoilers();
            }
          })
          return;
        }

        pendingChange = true;

        this.managers.appPrivacyManager.setContentSettings({
          sensitive_enabled: newEnabled
        }).catch(() => {
          toastNew({langPackKey: 'Error.AnError'});
          checkboxField.setValueSilently(!newEnabled);
        }).finally(() => {
          pendingChange = false;
        });
      })

      section.content.append(row.container);

      if(contentSettings.sensitiveCanChange()) {
        checkboxField.setValueSilently(contentSettings.sensitiveEnabled());
        section.container.classList.remove('hide');
      }

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

  public updateActiveWebsites(promise = this.managers.appSeamlessLoginManager.getWebAuthorizations()) {
    return promise.then((authorizations) => {
      this.websitesRow.freezed = false;
      this.websites = authorizations;
      _i18n(this.websitesRow.subtitle, 'Privacy.Websites', [this.websites.length]);
      this.websitesRow.container.classList.toggle('hide', !this.websites.length);
    });
  }

  public updatePasskeys() {
    this.passkeyRow.freezed = true;
    return Promise.all([
      this.managers.apiManager.getAppConfig(),
      this.managers.appAccountManager.getPasskeys()
    ]).then(([appConfig, passkeys]) => {
      this.passkeyRow.freezed = false;
      [this.passkeys, this.setPasskeys] = createStore(passkeys.passkeys);

      createRoot((dispose) => {
        this.middlewareHelper.onDestroy(dispose);
        createEffect(() => {
          _i18n(this.passkeyRow.subtitle, 'Passkeys', [this.passkeys.length]);
          this.passkeyRow.container.classList.toggle(
            'hide',
            !this.passkeys.length && (!appConfig.settings_display_passkeys || !IS_WEB_AUTHN_SUPPORTED)
          );
        });
      });
    });
  }
}

providedTabs.AppPrivacyAndSecurityTab = AppPrivacyAndSecurityTab;
