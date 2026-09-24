import App from '@config/app';
import ctx from '@environment/ctx';
import longFromBytes from '@helpers/long/longFromBytes';
import tsNow from '@helpers/tsNow';
import {AccountAuthorizations, Authorization, EmailVerification, EmailVerifyPurpose, InputCheckPasswordSRP, InputPasskeyCredential, Update} from '@layer';
import {DcId, TrueDcId} from '@types';
import AccountController from '@lib/accounts/accountController';
import {AppManager} from '@appManagers/manager';
import {
  DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD,
  normalizeAuthorizationAutoconfirmPeriod
} from '@appManagers/utils/authorizationAutoconfirmPeriod';

export {DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD} from '@appManagers/utils/authorizationAutoconfirmPeriod';

export type UnconfirmedAuthorization = {
  hash: string | number,
  date: number,
  device: string,
  location: string
};

type UnconfirmedAuthorizationMutation = {
  version: number,
  authorization?: UnconfirmedAuthorization
};

const isSameAuthorization = (a: UnconfirmedAuthorization, b: UnconfirmedAuthorization) => {
  return '' + a.hash === '' + b.hash &&
    a.date === b.date &&
    a.device === b.device &&
    a.location === b.location;
};

const areSameAuthorizations = (a: UnconfirmedAuthorization[], b: UnconfirmedAuthorization[]) => {
  return a.length === b.length && a.every((authorization, index) => {
    return isSameAuthorization(authorization, b[index]);
  });
};

export function applyUnconfirmedAuthorizationUpdate(
  authorizations: UnconfirmedAuthorization[],
  update: Update.updateNewAuthorization
) {
  const updated = authorizations.filter((authorization) => {
    return '' + authorization.hash !== '' + update.hash;
  });

  if(update.pFlags.unconfirmed) {
    updated.unshift({
      hash: update.hash,
      date: update.date ?? 0,
      device: update.device ?? '',
      location: update.location ?? ''
    });
  }

  return updated;
}

export function filterExpiredUnconfirmedAuthorizations(
  authorizations: UnconfirmedAuthorization[],
  period: number,
  now = tsNow(true)
) {
  return authorizations.filter((authorization) => {
    return authorization.date + period > now;
  });
}

/**
 * The server locks a session out of reviewing other ones for its first day:
 * both account.resetAuthorization and account.changeAuthorizationSettings answer
 * FRESH_*_FORBIDDEN until then. A prompt raised inside that window can only
 * dead-end, so it waits — Web A holds its own bar back for the same reason.
 */
export const FRESH_AUTHORIZATION_PERIOD = 24 * 60 * 60;

export default class AppAccountManager extends AppManager {
  private unconfirmedAuthorizations: UnconfirmedAuthorization[] = [];
  private publishedUnconfirmedAuthorizations: UnconfirmedAuthorization[] = [];
  private currentAuthorizationDate = 0;
  private authorizationsPromise: Promise<AccountAuthorizations>;
  private unconfirmedAuthorizationMutationVersion = 0;
  private unconfirmedAuthorizationClearVersion = 0;
  private unconfirmedAuthorizationMutations = new Map<string, UnconfirmedAuthorizationMutation>();
  private unconfirmedAuthorizationsLoaded: Promise<void>;
  private authorizationAutoconfirmPeriod = DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD;
  private authorizationAutoconfirmPeriodVersion = 0;
  private authorizationExpirationTimeout: number;

  protected after() {
    const pendingUpdates: Update.updateNewAuthorization[] = [];
    let loaded = false;

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateNewAuthorization: (update) => {
        if(!loaded) {
          pendingUpdates.push(update);
          return;
        }

        this.processNewAuthorizationUpdate(update);
      }
    });

    this.rootScope.addEventListener('app_config', (appConfig) => {
      ++this.authorizationAutoconfirmPeriodVersion;
      this.setAuthorizationAutoconfirmPeriod(appConfig.authorization_autoconfirm_period, loaded);
    });

    // `user_auth` also fires on every start of an already signed-in account
    // (createManagers -> setUserAuth), and the payload it carries then is
    // stamped with the current time rather than the login's — so the session's
    // own age is only ever taken from the server, below.
    this.rootScope.addEventListener('user_auth', () => {
      this.unconfirmedAuthorizationsLoaded.then(() => {
        this.getAuthorizations().catch(() => {});
      });
    });

    const periodVersion = this.authorizationAutoconfirmPeriodVersion;
    const loadedPromise = this.appStateManager.getState().then((state) => {
      if(periodVersion === this.authorizationAutoconfirmPeriodVersion) {
        this.setAuthorizationAutoconfirmPeriod(state.appConfig?.authorization_autoconfirm_period, false);
      }

      this.currentAuthorizationDate = state.currentAuthorizationDate || 0;

      const saved = state.unconfirmedAuthorizations ?? [];
      const restored = filterExpiredUnconfirmedAuthorizations(
        saved,
        this.authorizationAutoconfirmPeriod
      );

      this.unconfirmedAuthorizations = restored;
      if(!areSameAuthorizations(saved, restored)) {
        this.appStateManager.pushToState('unconfirmedAuthorizations', restored);
      }

      loaded = true;
      // a restored prompt is news to everyone who asked before the state was read
      this.publishUnconfirmedAuthorizations();
      pendingUpdates.forEach((update) => this.processNewAuthorizationUpdate(update));
      this.scheduleAuthorizationExpiration();
    });

    this.unconfirmedAuthorizationsLoaded = loadedPromise;
    return loadedPromise;
  }

  private setAuthorizationAutoconfirmPeriod(period?: number, updateAuthorizations = true) {
    const normalizedPeriod = normalizeAuthorizationAutoconfirmPeriod(period);
    if(this.authorizationAutoconfirmPeriod === normalizedPeriod) return;

    this.authorizationAutoconfirmPeriod = normalizedPeriod;
    if(updateAuthorizations) {
      this.setUnconfirmedAuthorizations(this.unconfirmedAuthorizations);
    }
  }

  private scheduleAuthorizationExpiration() {
    if(this.authorizationExpirationTimeout !== undefined) {
      ctx.clearTimeout(this.authorizationExpirationTimeout);
      this.authorizationExpirationTimeout = undefined;
    }

    if(!this.unconfirmedAuthorizations.length) return;

    const wakeUpAt = this.unconfirmedAuthorizations.map((authorization) => {
      return authorization.date + this.authorizationAutoconfirmPeriod;
    });

    if(this.isCurrentAuthorizationFresh()) {
      wakeUpAt.push(this.currentAuthorizationDate + FRESH_AUTHORIZATION_PERIOD);
    }

    const delay = Math.max(0, Math.min(...wakeUpAt) - tsNow(true)) * 1000;

    this.authorizationExpirationTimeout = ctx.setTimeout(() => {
      this.authorizationExpirationTimeout = undefined;
      this.setUnconfirmedAuthorizations(this.unconfirmedAuthorizations);
    }, delay);
  }

  private setUnconfirmedAuthorizations(authorizations: UnconfirmedAuthorization[]) {
    const updated = filterExpiredUnconfirmedAuthorizations(
      authorizations,
      this.authorizationAutoconfirmPeriod
    );

    if(!areSameAuthorizations(this.unconfirmedAuthorizations, updated)) {
      this.unconfirmedAuthorizations = updated;
      this.appStateManager.pushToState('unconfirmedAuthorizations', updated);
    }

    this.publishUnconfirmedAuthorizations();
    this.scheduleAuthorizationExpiration();
  }

  // Kept apart from the stored list: a session that is still too fresh to review
  // anything holds every prompt back without forgetting it.
  private publishUnconfirmedAuthorizations() {
    const visible = this.getUnconfirmedAuthorizations();
    if(areSameAuthorizations(this.publishedUnconfirmedAuthorizations, visible)) return;

    this.publishedUnconfirmedAuthorizations = visible;
    this.rootScope.dispatchEvent('unconfirmed_authorizations_update', visible);
  }

  private setCurrentAuthorizationDate(date?: number) {
    if(!(date > 0) || this.currentAuthorizationDate === date) return;

    this.currentAuthorizationDate = date;
    this.appStateManager.pushToState('currentAuthorizationDate', date);
    this.publishUnconfirmedAuthorizations();
    this.scheduleAuthorizationExpiration();
  }

  private isCurrentAuthorizationFresh(now = tsNow(true)) {
    return this.currentAuthorizationDate > 0 &&
      this.currentAuthorizationDate + FRESH_AUTHORIZATION_PERIOD > now;
  }

  private processNewAuthorizationUpdate(update: Update.updateNewAuthorization) {
    const updated = applyUnconfirmedAuthorizationUpdate(
      this.unconfirmedAuthorizations,
      update
    );
    this.recordUnconfirmedAuthorizationMutation(
      update.hash,
      updated.find((authorization) => '' + authorization.hash === '' + update.hash)
    );
    this.setUnconfirmedAuthorizations(updated);
  }

  private removeUnconfirmedAuthorization(hash: string | number) {
    this.recordUnconfirmedAuthorizationMutation(hash);
    this.setUnconfirmedAuthorizations(this.unconfirmedAuthorizations.filter((authorization) => {
      return '' + authorization.hash !== '' + hash;
    }));
  }

  private recordUnconfirmedAuthorizationMutation(
    hash: string | number,
    authorization?: UnconfirmedAuthorization
  ) {
    this.unconfirmedAuthorizationMutations.set('' + hash, {
      version: ++this.unconfirmedAuthorizationMutationVersion,
      authorization
    });
  }

  private applyUnconfirmedAuthorizationMutations(
    authorizations: UnconfirmedAuthorization[],
    afterVersion: number
  ) {
    if(this.unconfirmedAuthorizationClearVersion > afterVersion) {
      authorizations = [];
      afterVersion = this.unconfirmedAuthorizationClearVersion;
    }

    const mutations = Array.from(this.unconfirmedAuthorizationMutations.entries())
    .filter(([, mutation]) => mutation.version > afterVersion)
    .sort((a, b) => a[1].version - b[1].version);

    return mutations.reduce((updated, [hash, mutation]) => {
      updated = updated.filter((authorization) => '' + authorization.hash !== hash);
      if(mutation.authorization) {
        updated.unshift(mutation.authorization);
      }

      return updated;
    }, authorizations);
  }

  // `unconfirmed` sits on the session row itself — it is what makes the user's
  // OTHER devices ask about a login, not a per-viewer flag — so the session we
  // are running on can come back carrying it. Asking a device about itself is
  // both pointless and unanswerable (the server refuses to let a session review
  // itself), so `current` never becomes a prompt; tdesktop and Android sidestep
  // this by never reading the flag from the session list at all.
  private getUnconfirmedAuthorizationsFromSessions(authorizations: Authorization.authorization[]) {
    return authorizations
    .filter((authorization) => authorization.pFlags.unconfirmed && !authorization.pFlags.current)
    .map((authorization): UnconfirmedAuthorization => ({
      hash: authorization.hash,
      date: authorization.date_created,
      device: [authorization.device_model, authorization.platform].filter(Boolean).join(', ') ||
        [authorization.app_name, authorization.app_version].filter(Boolean).join(' '),
      location: [authorization.region, authorization.country].filter(Boolean).join(', ')
    }))
    .sort((a, b) => b.date - a.date);
  }

  public getUnconfirmedAuthorizations() {
    if(this.isCurrentAuthorizationFresh()) return [];

    return this.unconfirmedAuthorizations.slice();
  }

  public initPasskeyRegistration() {
    return this.apiManager.invokeApi('account.initPasskeyRegistration');
  }

  public registerPasskey(credential: InputPasskeyCredential) {
    return this.apiManager.invokeApi('account.registerPasskey', {credential});
  }

  public getPasskeys() {
    return this.apiManager.invokeApi('account.getPasskeys');
  }

  public deletePasskey(id: string) {
    return this.apiManager.invokeApiSingle('account.deletePasskey', {id});
  }

  public initPasskeyLogin() {
    return this.apiManager.invokeApi('auth.initPasskeyLogin', {
      api_hash: App.hash,
      api_id: App.id
    });
  }

  public async finishPasskeyLogin(credential: InputPasskeyCredential, fromDcId?: TrueDcId) {
    const fromAuthKey = fromDcId ? await this.apiManager.getAuthKeyFromHex((await AccountController.get(this.getAccountNumber()))[`dc${fromDcId as TrueDcId}_auth_key`]) : undefined;
    return this.apiManager.invokeApi('auth.finishPasskeyLogin', {
      credential,
      ...(fromDcId ? {
        from_dc_id: fromDcId,
        from_auth_key_id: longFromBytes(fromAuthKey.id)
      } : {})
    }, {ignoreErrors: true}).then((authorization) => {
      if(authorization._ === 'auth.authorization') {
        this.apiManager.setUser(authorization.user);
      }

      return authorization;
    });
  }

  /**
   * A `tgWebAuthToken` handed to us in the URL by a Telegram website. The
   * account it belongs to lives on its own DC, so the base moves there before
   * we ask — the same way a migrated login would.
   */
  public async importWebTokenAuthorization(token: string, dcId: DcId) {
    this.apiManager.setBaseDcId(dcId);

    const authorization = await this.apiManager.invokeApi('auth.importWebTokenAuthorization', {
      api_id: App.id,
      api_hash: App.hash,
      web_auth_token: token
    }, {dcId, ignoreErrors: true});

    if(authorization._ === 'auth.authorization') {
      await this.apiManager.setUser(authorization.user);
    }

    return authorization;
  }

  /**
   * A token we are not going to import stays a usable login on the server, and
   * the URL it arrived in outlives the tab (history, a shared link) — so drop
   * it. Fire-and-forget: nobody waits on the answer, and a token the server
   * already forgot is not worth reporting either.
   */
  public cancelWebTokenAuthorization(token: string, dcId: DcId) {
    this.apiManager.invokeApi('auth.cancelWebTokenAuthorization', {
      web_auth_token: token
    }, {dcId, ignoreErrors: true}).catch((err) => {
      this.log.error('web token cancellation error:', err);
    });
  }

  public sendVerifyEmailCode(purpose: EmailVerifyPurpose, email: string) {
    return this.apiManager.invokeApi('account.sendVerifyEmailCode', {purpose, email});
  }

  public verifyEmail(purpose: EmailVerifyPurpose, verification: EmailVerification) {
    return this.apiManager.invokeApi('account.verifyEmail', {purpose, verification});
  }

  public getAuthorizations() {
    if(this.authorizationsPromise) return this.authorizationsPromise;

    const mutationVersion = this.unconfirmedAuthorizationMutationVersion;
    const promise = this.authorizationsPromise = this.apiManager.invokeApi('account.getAuthorizations')
    .then((authorizations) => {
      this.setCurrentAuthorizationDate(authorizations.authorizations.find((authorization) => {
        return authorization.pFlags.current;
      })?.date_created);

      this.setUnconfirmedAuthorizations(
        this.applyUnconfirmedAuthorizationMutations(
          this.getUnconfirmedAuthorizationsFromSessions(authorizations.authorizations),
          mutationVersion
        )
      );

      return authorizations;
    })
    .finally(() => {
      if(this.authorizationsPromise === promise) {
        this.authorizationsPromise = undefined;
      }
    });

    return promise;
  }

  // tdesktop `Api::Authorizations::callsDisabledHere()`: whether this session
  // has "accept calls on this device" switched off — the current authorization's
  // `call_requests_disabled`. A failed fetch counts as enabled, so a network
  // hiccup never silences a call.
  public isCallRequestsDisabled(): Promise<boolean> {
    return this.getAuthorizations().then((result) => {
      const current = result.authorizations.find((authorization) => authorization.pFlags.current);
      return !!current?.pFlags.call_requests_disabled;
    }, () => false);
  }

  // Wraps account.setAuthorizationTTL: the server drops any session that stays
  // inactive for longer than `days`. The current value ships with
  // account.getAuthorizations as `authorization_ttl_days`.
  public setAuthorizationTTL(days: number) {
    return this.apiManager.invokeApi('account.setAuthorizationTTL', {authorization_ttl_days: days});
  }

  public resetAuthorization(hash: string | number) {
    return this.apiManager.invokeApi('account.resetAuthorization', {hash}).then((result) => {
      if(result) {
        this.removeUnconfirmedAuthorization(hash);
      }

      return result;
    });
  }

  public resetAuthorizations() {
    return this.apiManager.invokeApi('auth.resetAuthorizations').then((result) => {
      if(result) {
        this.unconfirmedAuthorizationClearVersion = ++this.unconfirmedAuthorizationMutationVersion;
        this.unconfirmedAuthorizationMutations.clear();
        this.setUnconfirmedAuthorizations([]);
      }

      return result;
    });
  }

  // Wraps account.changeAuthorizationSettings. Used by the Speakers-and-Camera
  // settings tab to flip the "Accept calls on this device" switch — which the
  // server stores as the inverted `call_requests_disabled` flag on the
  // session's Authorization. `hash` is the session id from getAuthorizations().
  public changeAuthorizationSettings(hash: string | number, options: {
    callRequestsDisabled?: boolean,
    encryptedRequestsDisabled?: boolean,
    confirmed?: boolean
  }) {
    return this.apiManager.invokeApi('account.changeAuthorizationSettings', {
      hash,
      call_requests_disabled: options.callRequestsDisabled,
      encrypted_requests_disabled: options.encryptedRequestsDisabled,
      confirmed: options.confirmed
    }).then((result) => {
      if(result && options.confirmed) {
        this.removeUnconfirmedAuthorization(hash);
      }

      return result;
    });
  }

  public confirmUnconfirmedAuthorization(hash: string | number) {
    return this.changeAuthorizationSettings(hash, {confirmed: true});
  }

  public deleteAccount(reason: string) {
    return this.apiManager.invokeApi('account.deleteAccount', {reason});
  }
}
