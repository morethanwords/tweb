import App from '@config/app';
import ctx from '@environment/ctx';
import {bigIntFromBytes} from '@helpers/bigInt/bigIntConversion';
import tsNow from '@helpers/tsNow';
import {AccountAuthorizations, Authorization, EmailVerification, EmailVerifyPurpose, InputCheckPasswordSRP, InputPasskeyCredential, Update} from '@layer';
import {DcId, TrueDcId} from '@types';
import AccountController from '@lib/accounts/accountController';
import {AppManager} from '@appManagers/manager';

export const DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD = 7 * 24 * 60 * 60;

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

export default class AppAccountManager extends AppManager {
  private unconfirmedAuthorizations: UnconfirmedAuthorization[] = [];
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
      pendingUpdates.forEach((update) => this.processNewAuthorizationUpdate(update));
      this.scheduleAuthorizationExpiration();
    });

    this.unconfirmedAuthorizationsLoaded = loadedPromise;
    return loadedPromise;
  }

  private setAuthorizationAutoconfirmPeriod(period?: number, updateAuthorizations = true) {
    const normalizedPeriod = period > 0 ? period : DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD;
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

    const expiresAt = Math.min(...this.unconfirmedAuthorizations.map((authorization) => {
      return authorization.date + this.authorizationAutoconfirmPeriod;
    }));
    const delay = Math.max(0, expiresAt - tsNow(true)) * 1000;

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

    if(areSameAuthorizations(this.unconfirmedAuthorizations, updated)) {
      this.scheduleAuthorizationExpiration();
      return;
    }

    this.unconfirmedAuthorizations = updated;
    this.appStateManager.pushToState('unconfirmedAuthorizations', updated);
    this.rootScope.dispatchEvent('unconfirmed_authorizations_update', updated);
    this.scheduleAuthorizationExpiration();
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

  private getUnconfirmedAuthorizationsFromSessions(authorizations: Authorization.authorization[]) {
    return authorizations
    .filter((authorization) => authorization.pFlags.unconfirmed)
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
        from_auth_key_id: bigIntFromBytes(fromAuthKey.id.reverse()).toString()
      } : {})
    }, {ignoreErrors: true}).then((authorization) => {
      if(authorization._ === 'auth.authorization') {
        this.apiManager.setUser(authorization.user);
      }

      return authorization;
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
