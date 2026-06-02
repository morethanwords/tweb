import {Component, createEffect, createRoot, createSignal, onMount} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
import Row from '@components/row';
import {AccountPassword, GlobalPrivacySettings, InputPrivacyKey, Passkey, WebAuthorization} from '@layer';
import {AppTwoStepVerificationTab, AppTwoStepVerificationEnterPasswordTab, AppTwoStepVerificationEmailConfirmationTab} from '@components/solidJsTabs/tabs';
import {
  AppActiveWebSessionsTab,
  AppBlockedUsersTab,
  AppMessagesAutoDeleteTab,
  AppPasscodeEnterPasswordTab,
  AppPasscodeLockTab,
  AppPasskeysTab,
  AppPrivacyAboutTab,
  AppPrivacyAddToGroupsTab,
  AppPrivacyBirthdayTab,
  AppPrivacyCallsTab,
  AppPrivacyForwardMessagesTab,
  AppPrivacyGiftsTab,
  AppPrivacyLastSeenTab,
  AppPrivacyMessagesTab,
  AppPrivacyPhoneNumberTab,
  AppPrivacyProfilePhotoTab,
  AppPrivacySavedMusicTab,
  AppPrivacyVoicesTab
} from '@components/solidJsTabs/tabs';
import rootScope from '@lib/rootScope';
import {i18n, LangPackKey, _i18n} from '@lib/langPack';
import replaceContent from '@helpers/dom/replaceContent';
import CheckboxField from '@components/checkboxField';
import PopupPeer from '@components/popups/peer';
import Button from '@components/buttonTsx';
import Section from '@components/section';
import toggleDisability from '@helpers/dom/toggleDisability';
import convertKeyToInputKey from '@helpers/string/convertKeyToInputKey';
import getPrivacyRulesDetails from '@appManagers/utils/privacy/getPrivacyRulesDetails';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import confirmationPopup, {PopupConfirmationOptions} from '@components/confirmationPopup';
import noop from '@helpers/noop';
import {toastNew} from '@components/toast';
import PopupElement from '@components/popups';
import apiManagerProxy from '@lib/apiManagerProxy';
import Icon from '@components/icon';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {AgeVerificationPopup} from '@components/popups/ageVerification';
import {clearSensitiveSpoilers} from '@components/wrappers/mediaSpoiler';
import useContentSettings from '@stores/contentSettings';
import ChangeLoginEmailTab from '@components/sidebarLeft/tabs/changeLoginEmail';
import {wrapEmailPattern} from '@components/popups/emailSetup';
import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';
import showPasskeyPopup from '@components/popups/passkey';
import {findExistingOrCreateCustomOption} from '@components/sidebarLeft/tabs/autoDeleteMessages/options';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppPrivacyAndSecurityTab} from '@components/solidJsTabs/tabs';

const PrivacyAndSecurity: Component = () => {
  const [tab] = useSuperTab<typeof AppPrivacyAndSecurityTab>();
  const promiseCollector = usePromiseCollector();
  const p = tab.payload;

  const contentSettings = useContentSettings();

  let websitesRow: Row;
  let websites: WebAuthorization[];

  let passkeyRow: Row;
  let passkeys: Passkey[];
  let setPasskeys: SetStoreFunction<Passkey[]>;

  let sessionsContent!: HTMLElement;
  let privacyContent!: HTMLElement;
  let newChatsContent!: HTMLElement;
  let sensitiveContent!: HTMLElement;
  let clearButton!: HTMLElement;
  let deleteButton!: HTMLElement;

  const [privacyCaption, setPrivacyCaption] = createSignal<LangPackKey>();
  const [newChatsHidden, setNewChatsHidden] = createSignal(false);
  const [sensitiveHidden, setSensitiveHidden] = createSignal(true);

  const updateActiveWebsites = (promise = tab.managers.appSeamlessLoginManager.getWebAuthorizations()) => {
    return promise.then((authorizations) => {
      websitesRow.freezed = false;
      websites = authorizations;
      _i18n(websitesRow.subtitle, 'Privacy.Websites', [websites.length]);
      websitesRow.container.classList.toggle('hide', !websites.length);
    });
  };

  const updatePasskeys = () => {
    passkeyRow.freezed = true;
    return Promise.all([
      tab.managers.apiManager.getAppConfig(),
      tab.managers.appAccountManager.getPasskeys()
    ]).then(([appConfig, passkeysResult]) => {
      passkeyRow.freezed = false;
      [passkeys, setPasskeys] = createStore(passkeysResult.passkeys);

      createRoot((dispose) => {
        tab.middlewareHelper.onDestroy(dispose);
        createEffect(() => {
          _i18n(passkeyRow.subtitle, 'Passkeys', [passkeys.length]);
          passkeyRow.container.classList.toggle(
            'hide',
            !passkeys.length && (!appConfig.settings_display_passkeys || !IS_WEB_AUTHN_SUPPORTED)
          );
        });
      });
    });
  };

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
      tab.managers.appPaymentsManager.clearSavedInfo(info, payment).then(() => {
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

  const onDeleteClick = () => {
    const popup = PopupElement.createPopup(PopupPeer, 'popup-delete-drafts', {
      buttons: [{
        langKey: 'Delete',
        callback: () => {
          const toggle = toggleDisability([deleteButton], true);
          tab.managers.appDraftsManager.clearAllDrafts().then(() => {
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

  onMount(() => {
    tab.container.classList.add('dont-u-dare-block-me');

    const build = async() => {
      const SUBTITLE: LangPackKey = 'Loading';
      const promises: Promise<any>[] = [];

      {
        let blockedPeerIds: PeerId[];
        const blockedUsersRow = new Row({
          icon: 'deleteuser',
          titleLangKey: 'BlockedUsers',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppBlockedUsersTab).open({peerIds: blockedPeerIds});
          },
          listenerSetter: tab.listenerSetter
        });
        blockedUsersRow.freezed = true;

        let passwordState: AccountPassword;
        const twoFactorRowOptions: ConstructorParameters<typeof Row>[0] = {
          icon: 'lock',
          titleLangKey: 'TwoStepVerification' as LangPackKey,
          subtitleLangKey: SUBTITLE,
          clickable: (e: Event) => {
            if(passwordState.pFlags.has_password) {
              tab.slider.createTab(AppTwoStepVerificationEnterPasswordTab).open({state: passwordState});
            } else if(passwordState.email_unconfirmed_pattern) {
              tab.managers.passwordManager.resendPasswordEmail();
              tab.slider.createTab(AppTwoStepVerificationEmailConfirmationTab).open({
                state: passwordState,
                email: wrapEmailPattern(passwordState.email_unconfirmed_pattern),
                length: 6,
                isFirst: true
              });
            } else {
              tab.slider.createTab(AppTwoStepVerificationTab).open({state: passwordState});
            }
          },
          listenerSetter: tab.listenerSetter
        };
        const twoFactorRow = new Row(twoFactorRowOptions);
        twoFactorRow.freezed = true;

        const openPasskeysTab = () => {
          tab.slider.createTab(AppPasskeysTab).open({
            passkeys: passkeys,
            setPasskeys: setPasskeys
          });
        };

        passkeyRow = new Row({
          icon: 'faceid',
          titleLangKey: 'Privacy.Passkeys',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            if(passkeys.length) {
              openPasskeysTab();
              return;
            }

            showPasskeyPopup((passkey) => {
              setPasskeys([passkey]);
              openPasskeysTab();
            });
          },
          listenerSetter: tab.listenerSetter
        });

        updatePasskeys();

        const emailRow = new Row({
          titleLangKey: 'LoginEmail',
          subtitle: SUBTITLE,
          icon: 'email',
          clickable: () => {
            tab.slider.createTab(ChangeLoginEmailTab).open({
              isInitialSetup: passwordState.login_email_pattern.includes(' ')
            });
          },
          listenerSetter: tab.listenerSetter
        });
        emailRow.freezed = true;

        const passcodeLockRowOptions: ConstructorParameters<typeof Row>[0] = {
          icon: 'key',
          titleLangKey: 'PasscodeLock.Item.Title',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            if(passcodeEnabled) {
              tab.slider.createTab(AppPasscodeEnterPasswordTab)
              .open({
                buttonText: 'PasscodeLock.Next',
                inputLabel: 'PasscodeLock.EnterYourPasscode',
                onSubmit: async(passcode, _, {isMyPasscode}) => {
                  const isCorrect = await isMyPasscode(passcode);
                  passcode = '';
                  if(!isCorrect) throw {};

                  tab.slider.createTab(AppPasscodeLockTab).open();
                }
              })
            } else {
              tab.slider.createTab(AppPasscodeLockTab).open();
            }
          },
          listenerSetter: tab.listenerSetter
        };
        const passcodeLockRow = new Row(passcodeLockRowOptions);
        passcodeLockRow.freezed = true;

        websitesRow = new Row({
          icon: 'mention',
          titleLangKey: 'OtherWebSessions',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            const webTab = tab.slider.createTab(AppActiveWebSessionsTab);
            webTab.eventListener.addEventListener('destroy', () => {
              updateActiveWebsites();
            });
            webTab.open(websites);
          },
          listenerSetter: tab.listenerSetter
        });
        websitesRow.freezed = true;

        let autoDeletePeriod: number;

        const autoDeleteMessagesRowOptions: ConstructorParameters<typeof Row>[0] = {
          icon: 'auto_delete_circle_clock',
          titleLangKey: 'AutoDeleteMessages',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            if(isNaN(autoDeletePeriod)) return;
            tab.slider.createTab(AppMessagesAutoDeleteTab).open({
              period: autoDeletePeriod,
              onSaved: (period) => {
                autoDeletePeriod = period;
                updateAutoDeleteRow();
              }
            });
          },
          listenerSetter: tab.listenerSetter
        };

        const autoDeleteMessagesRow = new Row(autoDeleteMessagesRowOptions);
        autoDeleteMessagesRow.freezed = true;

        sessionsContent.append(
          blockedUsersRow.container,
          websitesRow.container,
          autoDeleteMessagesRow.container,
          passcodeLockRow.container,
          twoFactorRow.container,
          passkeyRow.container
        );

        const setBlockedCount = (count: number) => {
          if(count) {
            replaceContent(blockedUsersRow.subtitle, i18n('PrivacySettingsController.UserCount', [count]));
          } else {
            replaceContent(blockedUsersRow.subtitle, i18n('BlockedEmpty', [count]));
          }
        };

        tab.listenerSetter.add(rootScope)('peer_block', () => {
          /* const {blocked, peerId} = update;
          if(!blocked) blockedPeerIds.findAndSplice((p) => p === peerId);
          else blockedPeerIds.unshift(peerId);
          blockedCount += blocked ? 1 : -1;
          setBlockedCount(blockedCount); */
          updateBlocked();
        });

        const updateBlocked = () => {
          tab.managers.appUsersManager.getBlocked().then((res) => {
            blockedUsersRow.freezed = false;
            setBlockedCount(res.count);
            blockedPeerIds = res.peerIds;
          });
        };

        updateBlocked();

        tab.managers.passwordManager.getState().then((state) => {
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
        tab.managers.appStateManager.getState().then((state) => {
          passcodeLockRow.freezed = false;
          setPasscodeEnabledState(state.settings?.passcode?.enabled || false);
        });
        tab.listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
          if(key === joinDeepPath('settings', 'passcode', 'enabled'))
            setPasscodeEnabledState(value);
        });

        promises.push(updateActiveWebsites(p.webAuthorizations));


        function updateAutoDeleteRow() {
          autoDeleteMessagesRow.subtitle.replaceChildren(
            !autoDeletePeriod ?
              i18n('Off') :
              findExistingOrCreateCustomOption(autoDeletePeriod).label()
          );
        }

        (async() => {
          autoDeletePeriod = await tab.managers.appPrivacyManager.getDefaultAutoDeletePeriod();
          updateAutoDeleteRow();
          autoDeleteMessagesRow.freezed = false;
        })();
      }

      {
        const isPremiumFeaturesHidden = await apiManagerProxy.isPremiumFeaturesHidden();
        setPrivacyCaption(isPremiumFeaturesHidden ? 'GroupsAndChannelsHelp' : 'Privacy.MessagesCaption');

        type RowKey = InputPrivacyKey['_'] | (keyof GlobalPrivacySettings['pFlags']);

        const rowsByKeys: Partial<{
          [key in RowKey]: Row
        }> = {};

        const openTabWithGlobalPrivacy = async(
          constructor: typeof AppPrivacyLastSeenTab,
          key: RowKey
        ) => {
          const globalPrivacy = await p.globalPrivacy;
          const subTab = tab.slider.createTab(constructor);
          subTab.open(globalPrivacy);
          subTab.eventListener.addEventListener('privacy', (privacy) => {
            p.globalPrivacy = privacy;
            updatePrivacyRow(key);
          });
        };

        const numberVisibilityRow = rowsByKeys['inputPrivacyKeyPhoneNumber'] = new Row({
          titleLangKey: 'PrivacyPhoneTitle',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyPhoneNumberTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        const lastSeenTimeRow = rowsByKeys['inputPrivacyKeyStatusTimestamp'] = new Row({
          titleLangKey: 'LastSeenTitle',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            openTabWithGlobalPrivacy(AppPrivacyLastSeenTab, 'inputPrivacyKeyStatusTimestamp');
          },
          listenerSetter: tab.listenerSetter
        });

        const photoVisibilityRow = rowsByKeys['inputPrivacyKeyProfilePhoto'] = new Row({
          titleLangKey: 'PrivacyProfilePhotoTitle',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyProfilePhotoTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        const aboutRow = rowsByKeys['inputPrivacyKeyAbout'] = new Row({
          titleLangKey: 'Privacy.BioRow',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyAboutTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        const callRow = rowsByKeys['inputPrivacyKeyPhoneCall'] = new Row({
          titleLangKey: 'WhoCanCallMe',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyCallsTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        const linkAccountRow = rowsByKeys['inputPrivacyKeyForwards'] = new Row({
          titleLangKey: 'PrivacyForwardsTitle',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyForwardMessagesTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        const groupChatsAddRow = rowsByKeys['inputPrivacyKeyChatInvite'] = new Row({
          titleLangKey: 'WhoCanAddMe',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyAddToGroupsTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        const birthdayRow = rowsByKeys['inputPrivacyKeyBirthday'] = new Row({
          titleLangKey: 'Privacy.BirthdayRow',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyBirthdayTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        const savedMusicRow = rowsByKeys['inputPrivacyKeySavedMusic'] = new Row({
          titleLangKey: 'Privacy.SavedMusicRow',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacySavedMusicTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        const giftsRow = rowsByKeys['inputPrivacyKeyStarGiftsAutoSave'] = new Row({
          titleLangKey: 'Privacy.GiftsRow',
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            openTabWithGlobalPrivacy(AppPrivacyGiftsTab, 'inputPrivacyKeyStarGiftsAutoSave');
          },
          listenerSetter: tab.listenerSetter
        });

        const createPremiumTitle = (langKey: LangPackKey) => {
          const fragment = document.createDocumentFragment();
          const icon = Icon('star', 'privacy-premium-icon');
          fragment.append(i18n(langKey), icon);
          const onPremium = () => {
            icon.classList.toggle('hide', !rootScope.premium);
          };
          onPremium();
          tab.listenerSetter.add(rootScope)('premium_toggle', onPremium);
          return fragment;
        };

        let voicesRow: Row;
        if(!isPremiumFeaturesHidden) voicesRow = rowsByKeys['inputPrivacyKeyVoiceMessages'] = new Row({
          title: createPremiumTitle('PrivacyVoiceMessagesTitle'),
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyVoicesTab).open();
          },
          listenerSetter: tab.listenerSetter
        });

        let messagesRow: Row;
        if(!isPremiumFeaturesHidden) messagesRow = rowsByKeys['new_noncontact_peers_require_premium'] = new Row({
          title: createPremiumTitle('PrivacyMessagesTitle'),
          subtitleLangKey: SUBTITLE,
          clickable: () => {
            tab.slider.createTab(AppPrivacyMessagesTab).open({
              onSaved: (updatedPrivacy) => {
                p.globalPrivacy = updatedPrivacy;
                updatePrivacyRow('new_noncontact_peers_require_premium');
              }
            });
          },
          listenerSetter: tab.listenerSetter
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

          tab.managers.appPrivacyManager.getPrivacy(key as InputPrivacyKey['_']).then((rules) => {
            const details = getPrivacyRulesDetails(rules);
            let langKey = map[details.type];
            if(details.type === PrivacyType.Nobody && details.allowMiniApps) {
              langKey = 'PrivacyMiniApps';
            } else if(details.type === PrivacyType.Everybody && details.disallowMiniApps) {
              langKey = 'PrivacyNoMiniApps';
            } else if(details.type === PrivacyType.Contacts && details.allowMiniApps) {
              langKey = 'PrivacyContactsAndMiniApps';
            }
            const disallowLength = details.disallowPeers.users.length + details.disallowPeers.chats.length;
            const allowLength = details.allowPeers.users.length + details.allowPeers.chats.length;

            const s = i18n(langKey);
            row.subtitle.replaceChildren(s);
            if(disallowLength || allowLength) {
              row.subtitle.append(` (${[-disallowLength, allowLength ? '+' + allowLength : 0].filter(Boolean).join(', ')})`);
            }
          });
        };

        privacyContent.append(...[
          numberVisibilityRow,
          lastSeenTimeRow,
          photoVisibilityRow,
          aboutRow,
          callRow,
          linkAccountRow,
          groupChatsAddRow,
          voicesRow,
          messagesRow,
          birthdayRow,
          giftsRow,
          savedMusicRow
        ].filter(Boolean).map((row) => row.container));

        for(const key in rowsByKeys) {
          updatePrivacyRow(key as keyof typeof rowsByKeys);
        }

        tab.listenerSetter.add(rootScope)('privacy_update', (update) => {
          updatePrivacyRow(convertKeyToInputKey(update.key._) as any);
        });
      }

      {
        const checkboxField = new CheckboxField({text: 'ArchiveAndMute'});
        const row = new Row({
          checkboxField
        });

        newChatsContent.append(row.container);

        let enabled: boolean, destroyed: boolean;
        tab.eventListener.addEventListener('destroy', async() => {
          destroyed = true;
          if(enabled === undefined || enabled === checkboxField.checked) return;
          return tab.managers.appPrivacyManager.setGlobalPrivacySettings({
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
            setNewChatsHidden(!isPremium && !appConfig.autoarchive_setting_available);
          };

          tab.listenerSetter.add(rootScope)('premium_toggle', onPremiumToggle);
          onPremiumToggle(rootScope.premium);

          enabled = !!settings.pFlags.archive_and_mute_new_noncontact_peers;

          checkboxField.setValueSilently(enabled);
        });

        promises.push(promise);
      }

      {
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

          tab.managers.appPrivacyManager.setContentSettings({
            sensitive_enabled: newEnabled
          }).catch(() => {
            toastNew({langPackKey: 'Error.AnError'});
            checkboxField.setValueSilently(!newEnabled);
          }).finally(() => {
            pendingChange = false;
          });
        })

        sensitiveContent.append(row.container);

        if(contentSettings.sensitiveCanChange()) {
          checkboxField.setValueSilently(contentSettings.sensitiveEnabled());
          setSensitiveHidden(false);
        }
      }

      await Promise.all(promises);
    };

    promiseCollector.collect(build());
  });

  return (
    <>
      <Section
        caption="SessionsInfo"
        noDelimiter
        contentProps={{ref: (el) => sessionsContent = el}}
      />
      <Section
        name="PrivacyTitle"
        caption={privacyCaption()}
        contentProps={{ref: (el) => privacyContent = el, class: 'privacy-navigation-container'}}
      />
      <Section
        name="NewChatsFromNonContacts"
        caption="ArchiveAndMuteInfo"
        classList={{hide: newChatsHidden()}}
        contentProps={{ref: (el) => newChatsContent = el}}
      />
      <Section
        name="Privacy.SensitiveContent"
        caption="PrivacyAndSecurity.SensitiveDesc"
        classList={{hide: sensitiveHidden()}}
        contentProps={{ref: (el) => sensitiveContent = el}}
      />
      <Section name="PrivacyPayments" caption="PrivacyPaymentsClearInfo">
        <Button
          ref={clearButton}
          class="btn-primary btn-transparent"
          icon="delete"
          text="PrivacyPaymentsClear"
          onClick={onClearClick}
        />
      </Section>
      <Section name="FilterChats">
        <Button
          ref={deleteButton}
          class="btn-primary btn-transparent"
          icon="delete"
          text="PrivacyDeleteCloudDrafts"
          onClick={onDeleteClick}
        />
      </Section>
    </>
  );
};

export default PrivacyAndSecurity;
