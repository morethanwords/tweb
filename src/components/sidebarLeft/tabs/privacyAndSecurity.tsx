import {Component, createEffect, createRoot, createSignal, For, JSX, onMount, Show} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
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
import {i18n, LangPackKey} from '@lib/langPack';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
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
import Row from '@components/rowTsx';
import {renderComponent} from '@helpers/solid/renderComponent';

const PrivacyAndSecurity: Component = () => {
  const [tab] = useSuperTab<typeof AppPrivacyAndSecurityTab>();
  const promiseCollector = usePromiseCollector();
  const p = tab.payload;

  const contentSettings = useContentSettings();

  let sessionsContent!: HTMLElement;
  let privacyContent!: HTMLElement;
  let newChatsContent!: HTMLElement;
  let sensitiveContent!: HTMLElement;
  let clearButton!: HTMLElement;
  let deleteButton!: HTMLElement;

  const [privacyCaption, setPrivacyCaption] = createSignal<LangPackKey>();
  const [newChatsHidden, setNewChatsHidden] = createSignal(false);
  const [sensitiveHidden, setSensitiveHidden] = createSignal(true);

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
        let passwordState: AccountPassword;
        let passcodeEnabled: boolean;
        let websites: WebAuthorization[];
        let passkeys: Passkey[];
        let setPasskeys: SetStoreFunction<Passkey[]>;
        let autoDeletePeriod: number;

        const [blockedSubtitle, setBlockedSubtitle] = createSignal<JSX.Element>(i18n(SUBTITLE));
        const [blockedFrozen, setBlockedFrozen] = createSignal(true);
        const [websitesSubtitle, setWebsitesSubtitle] = createSignal<JSX.Element>(i18n(SUBTITLE));
        const [websitesFrozen, setWebsitesFrozen] = createSignal(true);
        const [websitesHidden, setWebsitesHidden] = createSignal(false);
        const [autoDeleteSubtitle, setAutoDeleteSubtitle] = createSignal<JSX.Element>(i18n(SUBTITLE));
        const [autoDeleteFrozen, setAutoDeleteFrozen] = createSignal(true);
        const [passcodeSubtitle, setPasscodeSubtitle] = createSignal<JSX.Element>(i18n(SUBTITLE));
        const [passcodeFrozen, setPasscodeFrozen] = createSignal(true);
        const [twoFactorSubtitle, setTwoFactorSubtitle] = createSignal<JSX.Element>(i18n(SUBTITLE));
        const [twoFactorFrozen, setTwoFactorFrozen] = createSignal(true);
        const [emailSubtitle, setEmailSubtitle] = createSignal<JSX.Element>(i18n(SUBTITLE));
        const [emailFrozen, setEmailFrozen] = createSignal(true);
        const [emailHidden, setEmailHidden] = createSignal(true);
        const [passkeysSubtitle, setPasskeysSubtitle] = createSignal<JSX.Element>(i18n(SUBTITLE));
        const [passkeysFrozen, setPasskeysFrozen] = createSignal(true);
        const [passkeysHidden, setPasskeysHidden] = createSignal(false);

        const openPasskeysTab = () => {
          tab.slider.createTab(AppPasskeysTab).open({
            passkeys,
            setPasskeys
          });
        };

        const updateActiveWebsites = (promise = tab.managers.appSeamlessLoginManager.getWebAuthorizations()) => {
          return promise.then((authorizations) => {
            websites = authorizations;
            setWebsitesSubtitle(i18n('Privacy.Websites', [websites.length]));
            setWebsitesHidden(!websites.length);
            setWebsitesFrozen(false);
          });
        };

        const updatePasskeys = () => {
          setPasskeysFrozen(true);
          return Promise.all([
            tab.managers.apiManager.getAppConfig(),
            tab.managers.appAccountManager.getPasskeys()
          ]).then(([appConfig, passkeysResult]) => {
            setPasskeysFrozen(false);
            [passkeys, setPasskeys] = createStore(passkeysResult.passkeys);

            createRoot((dispose) => {
              tab.middlewareHelper.onDestroy(dispose);
              createEffect(() => {
                setPasskeysSubtitle(i18n('Passkeys', [passkeys.length]));
                setPasskeysHidden(
                  !passkeys.length && (!appConfig.settings_display_passkeys || !IS_WEB_AUTHN_SUPPORTED)
                );
              });
            });
          });
        };

        const openPasscodeLock = () => {
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
        };

        renderComponent({
          element: sessionsContent,
          Component: () => (
            <>
              <Row clickable={() => {
                if(!blockedFrozen()) tab.slider.createTab(AppBlockedUsersTab).open({peerIds: blockedPeerIds});
              }}>
                <Row.Icon icon="person_crossed_filled" />
                <Row.Title>{i18n('BlockedUsers')}</Row.Title>
                <Row.Subtitle>{blockedSubtitle()}</Row.Subtitle>
              </Row>
              <Row
                classList={{hide: websitesHidden()}}
                clickable={() => {
                  if(websitesFrozen()) return;
                  const webTab = tab.slider.createTab(AppActiveWebSessionsTab);
                  webTab.eventListener.addEventListener('destroy', () => {
                    updateActiveWebsites();
                  });
                  webTab.open(websites);
                }}
              >
                <Row.Icon icon="mention_filled" />
                <Row.Title>{i18n('OtherWebSessions')}</Row.Title>
                <Row.Subtitle>{websitesSubtitle()}</Row.Subtitle>
              </Row>
              <Row clickable={() => {
                if(autoDeleteFrozen() || isNaN(autoDeletePeriod)) return;
                tab.slider.createTab(AppMessagesAutoDeleteTab).open({
                  period: autoDeletePeriod,
                  onSaved: (period) => {
                    autoDeletePeriod = period;
                    updateAutoDeleteRow();
                  }
                });
              }}>
                <Row.Icon icon="auto_delete_filled" />
                <Row.Title>{i18n('AutoDeleteMessages')}</Row.Title>
                <Row.Subtitle>{autoDeleteSubtitle()}</Row.Subtitle>
              </Row>
              <Row clickable={() => !passcodeFrozen() && openPasscodeLock()}>
                <Row.Icon icon="key_filled" />
                <Row.Title>{i18n('PasscodeLock.Item.Title')}</Row.Title>
                <Row.Subtitle>{passcodeSubtitle()}</Row.Subtitle>
              </Row>
              <Row clickable={() => {
                if(twoFactorFrozen()) return;
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
              }}>
                <Row.Icon icon="two_factor_auth_filled" />
                <Row.Title>{i18n('TwoStepVerification')}</Row.Title>
                <Row.Subtitle>{twoFactorSubtitle()}</Row.Subtitle>
              </Row>
              <Show when={!emailHidden()}>
                <Row clickable={() => {
                  if(emailFrozen()) return;
                  tab.slider.createTab(ChangeLoginEmailTab).open({
                    isInitialSetup: passwordState.login_email_pattern.includes(' ')
                  });
                }}>
                  <Row.Icon icon="email_filled" />
                  <Row.Title>{i18n('LoginEmail')}</Row.Title>
                  <Row.Subtitle>{emailSubtitle()}</Row.Subtitle>
                </Row>
              </Show>
              <Row
                classList={{hide: passkeysHidden()}}
                clickable={() => {
                  if(passkeysFrozen()) return;
                  if(passkeys.length) {
                    openPasskeysTab();
                    return;
                  }

                  showPasskeyPopup((passkey) => {
                    setPasskeys([passkey]);
                    openPasskeysTab();
                  });
                }}
              >
                <Row.Icon icon="faceid_filled" />
                <Row.Title>{i18n('Privacy.Passkeys')}</Row.Title>
                <Row.Subtitle>{passkeysSubtitle()}</Row.Subtitle>
              </Row>
            </>
          ),
          middleware: tab.middlewareHelper.get()
        });

        const setBlockedCount = (count: number) => {
          setBlockedSubtitle(i18n(
            count ? 'PrivacySettingsController.UserCount' : 'BlockedEmpty',
            [count]
          ));
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
            setBlockedCount(res.count);
            blockedPeerIds = res.peerIds;
            setBlockedFrozen(false);
          });
        };

        updateBlocked();

        tab.managers.passwordManager.getState().then((state) => {
          passwordState = state;
          setTwoFactorSubtitle(i18n(state.pFlags.has_password ? 'PrivacyAndSecurity.Item.On' : 'PrivacyAndSecurity.Item.Off'));
          setTwoFactorFrozen(false);

          if(state.login_email_pattern) {
            setEmailSubtitle(wrapEmailPattern(state.login_email_pattern));
            setEmailFrozen(false);
            setEmailHidden(false);
          }

          // console.log('password state', state);
        });

        const setPasscodeEnabledState = (enabled?: boolean) => {
          passcodeEnabled = enabled;
          setPasscodeSubtitle(i18n(enabled ? 'PrivacyAndSecurity.Item.On' : 'PrivacyAndSecurity.Item.Off'));
        };
        tab.managers.appStateManager.getState().then((state) => {
          setPasscodeEnabledState(state.settings?.passcode?.enabled || false);
          setPasscodeFrozen(false);
        });
        tab.listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
          if(key === joinDeepPath('settings', 'passcode', 'enabled'))
            setPasscodeEnabledState(value);
        });

        promises.push(updateActiveWebsites(p.webAuthorizations));
        updatePasskeys();


        function updateAutoDeleteRow() {
          setAutoDeleteSubtitle(
            !autoDeletePeriod ?
              i18n('Off') :
              findExistingOrCreateCustomOption(autoDeletePeriod).label()
          );
        }

        (async() => {
          autoDeletePeriod = await tab.managers.appPrivacyManager.getDefaultAutoDeletePeriod();
          updateAutoDeleteRow();
          setAutoDeleteFrozen(false);
        })();
      }

      {
        const isPremiumFeaturesHidden = await apiManagerProxy.isPremiumFeaturesHidden();
        setPrivacyCaption(isPremiumFeaturesHidden ? 'GroupsAndChannelsHelp' : 'Privacy.MessagesCaption');

        type RowKey = InputPrivacyKey['_'] | (keyof GlobalPrivacySettings['pFlags']);
        type PrivacyRow = {
          key: RowKey,
          title: JSX.Element,
          clickable: () => void
        };

        const rowsByKeys: Partial<Record<RowKey, ReturnType<typeof createSignal<JSX.Element>>>> = {};
        const rows: PrivacyRow[] = [];
        const addRow = (key: RowKey, title: JSX.Element, clickable: () => void) => {
          rowsByKeys[key] = createSignal<JSX.Element>(i18n(SUBTITLE));
          rows.push({key, title, clickable});
        };

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

        addRow('inputPrivacyKeyPhoneNumber', i18n('PrivacyPhoneTitle'), () => {
          tab.slider.createTab(AppPrivacyPhoneNumberTab).open();
        });
        addRow('inputPrivacyKeyStatusTimestamp', i18n('LastSeenTitle'), () => {
          openTabWithGlobalPrivacy(AppPrivacyLastSeenTab, 'inputPrivacyKeyStatusTimestamp');
        });
        addRow('inputPrivacyKeyProfilePhoto', i18n('PrivacyProfilePhotoTitle'), () => {
          tab.slider.createTab(AppPrivacyProfilePhotoTab).open();
        });
        addRow('inputPrivacyKeyAbout', i18n('Privacy.BioRow'), () => {
          tab.slider.createTab(AppPrivacyAboutTab).open();
        });
        addRow('inputPrivacyKeyPhoneCall', i18n('WhoCanCallMe'), () => {
          tab.slider.createTab(AppPrivacyCallsTab).open();
        });
        addRow('inputPrivacyKeyForwards', i18n('PrivacyForwardsTitle'), () => {
          tab.slider.createTab(AppPrivacyForwardMessagesTab).open();
        });
        addRow('inputPrivacyKeyChatInvite', i18n('WhoCanAddMe'), () => {
          tab.slider.createTab(AppPrivacyAddToGroupsTab).open();
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

        if(!isPremiumFeaturesHidden) {
          addRow('inputPrivacyKeyVoiceMessages', createPremiumTitle('PrivacyVoiceMessagesTitle'), () => {
            tab.slider.createTab(AppPrivacyVoicesTab).open();
          });
          addRow('new_noncontact_peers_require_premium', createPremiumTitle('PrivacyMessagesTitle'), () => {
            tab.slider.createTab(AppPrivacyMessagesTab).open({
              onSaved: (updatedPrivacy) => {
                p.globalPrivacy = updatedPrivacy;
                updatePrivacyRow('new_noncontact_peers_require_premium');
              }
            });
          });
        }

        addRow('inputPrivacyKeyBirthday', i18n('Privacy.BirthdayRow'), () => {
          tab.slider.createTab(AppPrivacyBirthdayTab).open();
        });
        addRow('inputPrivacyKeyStarGiftsAutoSave', i18n('Privacy.GiftsRow'), () => {
          openTabWithGlobalPrivacy(AppPrivacyGiftsTab, 'inputPrivacyKeyStarGiftsAutoSave');
        });
        addRow('inputPrivacyKeySavedMusic', i18n('Privacy.SavedMusicRow'), () => {
          tab.slider.createTab(AppPrivacySavedMusicTab).open();
        });

        renderComponent({
          element: privacyContent,
          Component: () => (
            <For each={rows}>{(row) => (
              <Row clickable={row.clickable}>
                <Row.Title>{row.title}</Row.Title>
                <Row.Subtitle>{rowsByKeys[row.key][0]()}</Row.Subtitle>
              </Row>
            )}</For>
          ),
          middleware: tab.middlewareHelper.get()
        });

        const updatePrivacyRow = (key: RowKey) => {
          const subtitleSignal = rowsByKeys[key];
          if(!subtitleSignal) {
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
              subtitleSignal[1](i18n(langKey));
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

            const subtitle: JSX.Element[] = [i18n(langKey)];
            if(disallowLength || allowLength) {
              subtitle.push(` (${[-disallowLength, allowLength ? '+' + allowLength : 0].filter(Boolean).join(', ')})`);
            }
            subtitleSignal[1](subtitle);
          });
        };

        for(const key in rowsByKeys) {
          updatePrivacyRow(key as keyof typeof rowsByKeys);
        }

        tab.listenerSetter.add(rootScope)('privacy_update', (update) => {
          updatePrivacyRow(convertKeyToInputKey(update.key._) as any);
        });
      }

      {
        const archiveAndMuteSignal = createSignal(false);
        renderComponent({
          element: newChatsContent,
          Component: () => (
            <Row>
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx signal={archiveAndMuteSignal} toggle />
              </Row.CheckboxFieldToggle>
              <Row.Title>{i18n('ArchiveAndMute')}</Row.Title>
            </Row>
          ),
          middleware: tab.middlewareHelper.get()
        });

        let enabled: boolean, destroyed: boolean;
        tab.eventListener.addEventListener('destroy', async() => {
          destroyed = true;
          if(enabled === undefined || enabled === archiveAndMuteSignal[0]()) return;
          return tab.managers.appPrivacyManager.setGlobalPrivacySettings({
            _: 'globalPrivacySettings',
            pFlags: {
              ...(await p.globalPrivacy).pFlags,
              archive_and_mute_new_noncontact_peers: archiveAndMuteSignal[0]() || undefined
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
          archiveAndMuteSignal[1](enabled);
        });

        promises.push(promise);
      }

      {
        const sensitiveSignal = createSignal(false);
        let pendingChange = false;
        const onSensitiveChange = (newEnabled: boolean) => {
          if(pendingChange) {
            sensitiveSignal[1](!newEnabled);
            return;
          }

          if(newEnabled && contentSettings.needAgeVerification() && !contentSettings.ageVerified()) {
            sensitiveSignal[1](false);
            AgeVerificationPopup.create().then((verified) => {
              if(verified) {
                sensitiveSignal[1](true);
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
            sensitiveSignal[1](!newEnabled);
          }).finally(() => {
            pendingChange = false;
          });
        };

        renderComponent({
          element: sensitiveContent,
          Component: () => (
            <Row>
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx signal={sensitiveSignal} toggle onChange={onSensitiveChange} />
              </Row.CheckboxFieldToggle>
              <Row.Title>{i18n('PrivacyAndSecurity.SensitiveText')}</Row.Title>
            </Row>
          ),
          middleware: tab.middlewareHelper.get()
        });

        if(contentSettings.sensitiveCanChange()) {
          sensitiveSignal[1](contentSettings.sensitiveEnabled());
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
