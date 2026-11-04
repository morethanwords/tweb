import {InputPrivacyKey, InputPrivacyRule, PrivacyRule, PrivacyKey, GlobalPrivacySettings, AccountSetContentSettings, AccountContentSettings} from '@layer';
import convertInputKeyToKey from '@helpers/string/convertInputKeyToKey';
import {AppManager} from '@appManagers/manager';
import App from '@config/app';
import Schema from '@lib/mtproto/schema';
import noop from '@helpers/noop';
import {IgnoredRestrictionReasons, makeIgnoredRestrictionReasons, SENSITIVE_RESTRICTION_REASON} from '@helpers/restrictions';
import forgetFailedRequest from '@helpers/forgetFailedRequest';

/**
 * The answer to a request kept for whoever asks next takes its place only while the place still keeps that request:
 * what an update or a save put there while it was on its way is newer than the answer - it stays, and is what the
 * caller gets.
 */
function keepAnswer<T>(request: Promise<T>, kept: T | Promise<T>, answer: T, keep: (answer: T) => void): T | Promise<T> {
  if(kept && kept !== request) {
    return kept;
  }

  keep(answer);
  return answer;
}

export class AppPrivacyManager extends AppManager {
  private privacy: Partial<{
    [key in PrivacyKey['_']]: PrivacyRule[] | Promise<PrivacyRule[]>
  }> = {};

  private appConfigIgnoredReasons: string[];
  // * the last known: cached until the server answers
  private contentSettings: AccountContentSettings;
  private ignoredRestrictionReasons: IgnoredRestrictionReasons = new Set();
  private needAgeVerification: boolean;
  // * bumped by every switch the server accepts: an answer to a request sent before it is older than what we know
  private contentSettingsVersion = 0;
  // * requests numbered as sent: an answer overtaken by a later one's is older than what we know too
  private contentSettingsRequest = 0;
  private contentSettingsAnswered = 0;

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updatePrivacy: (update) => {
        const key = update.key._;
        this.privacy[key] = update.rules;
        this.rootScope.dispatchEvent('privacy_update', update);
      }
    });

    // * preload content settings and global privacy so the chat-open
    // * gift-button visibility check can resolve synchronously via the
    // * acknowledged pattern (avoids a render flicker). Content settings are
    // * asked for once a session anyway, as tdesktop and Android do: they decide
    // * what is blurred, and may have been changed on another device.
    this.rootScope.addEventListener('user_auth', () => {
      this.getContentSettings(true);
      this.getGlobalPrivacySettings();
    });

    this.rootScope.addEventListener('app_config', (appConfig) => {
      this.appConfigIgnoredReasons = appConfig.ignore_restriction_reasons;
      this.needAgeVerification = !!appConfig.need_age_video_verification;
      this.refreshIgnoredRestrictionReasons();

      // * a fresh app config that disagrees with the known switch: one of the two is stale, ask the server
      const sensitiveIgnored = !!appConfig.ignore_restriction_reasons?.includes(SENSITIVE_RESTRICTION_REASON);
      if(this.contentSettings && !!this.contentSettings.pFlags.sensitive_enabled !== sensitiveIgnored) {
        this.getContentSettings(true);
      }
    });

    this.appStateManager.getState().then((state) => {
      this.contentSettings ??= state.accountContentSettings?.value;
      this.refreshIgnoredRestrictionReasons();
    });
  }

  public setPrivacy(inputKey: InputPrivacyKey['_'], rules: InputPrivacyRule[]) {
    return this.apiManager.invokeApi('account.setPrivacy', {
      key: {
        _: inputKey
      },
      rules
    }).then((privacyRules) => {
      this.appUsersManager.saveApiUsers(privacyRules.users);
      this.appChatsManager.saveApiChats(privacyRules.chats);

      // * the rules as the server keeps them: the input ones carry input users, which a screen opened next cannot read
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updatePrivacy',
        key: {
          _: convertInputKeyToKey(inputKey)
        },
        rules: privacyRules.rules
      });

      // console.log('privacy rules', inputKey, privacyRules, privacyRules.rules);

      return privacyRules.rules;
    });
  }

  public getPrivacy(inputKey: InputPrivacyKey['_']) {
    const privacyKey: PrivacyKey['_'] = convertInputKeyToKey(inputKey) as any;
    const rules = this.privacy[privacyKey];
    if(rules) {
      return Promise.resolve(rules);
    }

    const promise: Promise<PrivacyRule[]> = this.privacy[privacyKey] = forgetFailedRequest(this.apiManager.invokeApi('account.getPrivacy', {
      key: {
        _: inputKey
      }
    }).then((privacyRules) => {
      this.appUsersManager.saveApiUsers(privacyRules.users);
      this.appChatsManager.saveApiChats(privacyRules.chats);

      // console.log('privacy rules', inputKey, privacyRules, privacyRules.rules);

      // * an update may bring newer rules meanwhile: a change on another device, or a save of this one
      return keepAnswer(promise, this.privacy[privacyKey], privacyRules.rules, (rules) => this.privacy[privacyKey] = rules);
    }), () => this.privacy[privacyKey], () => delete this.privacy[privacyKey]);

    return promise;
  }

  private globalPrivacy: GlobalPrivacySettings | Promise<GlobalPrivacySettings>;

  public getGlobalPrivacySettings() {
    // Return the resolved value SYNCHRONOUSLY when cached, so that
    // managers.acknowledged.appPrivacyManager.getGlobalPrivacySettings()
    // reports cached:true and `result` is a value (not a Promise). The
    // chat-input gift-button visibility check relies on this to apply
    // during the render closure without flicker.
    if(this.globalPrivacy && !(this.globalPrivacy instanceof Promise)) {
      return this.globalPrivacy;
    }
    if(this.globalPrivacy) return this.globalPrivacy;
    const promise: Promise<GlobalPrivacySettings> = this.globalPrivacy = forgetFailedRequest(this.apiManager.invokeApi('account.getGlobalPrivacySettings').then((settings) => {
      // * a save may bring newer settings meanwhile (tdesktop's GlobalPrivacy::update calls off the request on its way)
      return keepAnswer(promise, this.globalPrivacy, settings, (answer) => this.globalPrivacy = answer);
    }), () => this.globalPrivacy, () => this.globalPrivacy = undefined);

    return promise;
  }

  public setGlobalPrivacySettings(settings: GlobalPrivacySettings) {
    return this.apiManager.invokeApi('account.setGlobalPrivacySettings', {settings}).then((updated) => {
      this.globalPrivacy = updated;
      this.rootScope.dispatchEvent('global_privacy_update', updated);
      return updated;
    });
  }

  public getContentSettings(overwrite?: boolean) {
    return this.appStateManager.getSomethingCached({
      key: 'accountContentSettings',
      defaultValue: {
        _: 'account.contentSettings',
        pFlags: {}
      },
      getValue: () => {
        const version = this.contentSettingsVersion;
        const request = ++this.contentSettingsRequest;
        return this.apiManager.invokeApi('account.getContentSettings').then((settings): undefined => {
          if(version !== this.contentSettingsVersion || request < this.contentSettingsAnswered) {
            return;
          }

          // * cached here, in the same turn as the check: a write deferred to later could land over an accepted switch
          this.contentSettingsAnswered = request;
          this.setLocalContentSettings(settings);
          this.appStateManager.pushToState('accountContentSettings', {value: settings, timestamp: Date.now()});
        });
      },
      overwrite
    });
  }

  public async setContentSettings(settings: AccountSetContentSettings) {
    // * nothing changes before the server accepts it: it may refuse, or want the age verified first
    await this.apiManager.invokeApi('account.setContentSettings', settings);

    const pFlags = {...this.contentSettings?.pFlags};
    if(settings.sensitive_enabled) pFlags.sensitive_enabled = true;
    else delete pFlags.sensitive_enabled;

    // * accepted, so it takes effect at once - the app config only catches up with it
    ++this.contentSettingsVersion;
    this.setLocalContentSettings({_: 'account.contentSettings', ...this.contentSettings, pFlags});
    this.appStateManager.pushToState('accountContentSettings', {value: this.contentSettings, timestamp: Date.now()});
    Promise.all([this.apiManager.getAppConfig(true), this.getContentSettings(true)]).catch(noop);
  }

  private setLocalContentSettings(settings: AccountContentSettings) {
    this.contentSettings = settings;
    this.refreshIgnoredRestrictionReasons();
  }

  private refreshIgnoredRestrictionReasons() {
    this.ignoredRestrictionReasons = makeIgnoredRestrictionReasons(this.appConfigIgnoredReasons, this.contentSettings);
  }

  /**
   * Whether a sensitive mark closes the whole chat: only for an account that may not turn the filter off while the
   * server asks for its age. Any other one opens the chat with its media blurred, to be shown one by one. Only the
   * server's word counts here, as in tdesktop and Android: a mark kept on this device could be set by anyone.
   */
  public isSensitiveBlocked(settings: AccountContentSettings) {
    return !settings.pFlags.sensitive_can_change && this.needAgeVerification;
  }

  /** This account's: the worker serves every account, so the page's own copy would mix them up. */
  public getIgnoredRestrictionReasons() {
    return this.ignoredRestrictionReasons;
  }

  public async notifyAgeVerified() {
    await this.appStateManager.pushToState('ageVerification', {
      date: new Date().toISOString(),
      layer: Schema.layer,
      clientVersion: App.versionFull
    });
    await this.setContentSettings({sensitive_enabled: true});
  }

  public async getDefaultAutoDeletePeriod() {
    const result = await this.apiManager.invokeApi('messages.getDefaultHistoryTTL');
    return result.period;
  }

  public async setDefaultAutoDeletePeriod(period: number) {
    return this.apiManager.invokeApi('messages.setDefaultHistoryTTL', {period});
  }

  public async setAutoDeletePeriodFor(peerId: PeerId, period: number) {
    const updates = await this.apiManager.invokeApi('messages.setHistoryTTL', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      period
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }
}
