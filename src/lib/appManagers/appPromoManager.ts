import ctx from '@environment/ctx';
import tsNow from '@helpers/tsNow';
import {Birthday, HelpPromoData} from '@layer';
import {AppManager} from '@appManagers/manager';

const BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY = 'BIRTHDAY_CONTACTS_TODAY';
const PROMO_DATA_RETRY_INTERVAL = 60 * 60 * 1000;

export interface MyPromoData {
  pendingSuggestions: string[];
  dismissedSuggestions: string[];
}

export interface BirthdayContact {
  peerId: PeerId;
  birthday: Birthday;
}

export interface ContactBirthdaysState {
  contacts: BirthdayContact[];
  yesterday: BirthdayContact[];
  today: BirthdayContact[];
  tomorrow: BirthdayContact[];
}

function getLocalDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isBirthdayOnDate(birthday: Birthday, date: Date) {
  return birthday.day === date.getDate() && birthday.month === date.getMonth() + 1;
}

export default class AppPromoManager extends AppManager {
  private promoData: HelpPromoData = {_: 'help.promoDataEmpty', expires: 0};
  private myPromoData: MyPromoData = {pendingSuggestions: [], dismissedSuggestions: []};
  private promoDataLoaded = false;

  private refetchTimeout: number;
  private pendingDismissed = new Set<string>();
  private dismissedSinceFetch = new Set<string>();
  private birthdayContactsDismissedDayKey: string;

  private contactBirthdaysDayKey: string;
  private contactBirthdaysState: ContactBirthdaysState;

  protected after() {
    return this.appStateManager.getState().then((state) => {
      this.birthdayContactsDismissedDayKey = state.birthdayContactsDismissedDayKey;
    });
  }

  private schedulePromoDataRefetch(timeout: number) {
    if(this.refetchTimeout) return;

    this.refetchTimeout = ctx.setTimeout(() => {
      this.refetchTimeout = undefined;
      void this.getPromoData(true).catch(() => {});
    }, timeout);
  }

  public async getPromoData(force = false): Promise<MyPromoData> {
    if(force && this.promoDataLoaded) {
      this.setPromoData(this.promoData);
    }

    if(!force && this.promoData && this.promoData.expires > tsNow(true)) {
      return this.myPromoData;
    }

    if(this.refetchTimeout) {
      ctx.clearTimeout(this.refetchTimeout);
      this.refetchTimeout = undefined;
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'help.getPromoData',
      processResult: (promoData) => {
        this.promoDataLoaded = true;
        if(promoData._ === 'help.promoData') {
          this.appPeersManager.saveApiPeers(promoData);
          for(const suggestion of promoData.dismissed_suggestions) {
            this.dismissedSinceFetch.delete(suggestion);
          }
        }
        this.setPromoData(promoData);

        this.schedulePromoDataRefetch(promoData.expires * 1000 - tsNow());

        return this.myPromoData;
      }
    }).catch((err) => {
      this.schedulePromoDataRefetch(PROMO_DATA_RETRY_INTERVAL);
      throw err;
    });
  }

  private setPromoData(promoData: HelpPromoData) {
    this.promoData = promoData;

    const localDayKey = getLocalDayKey(new Date());
    const dismissedSuggestions = new Set(
      [...this.pendingDismissed].filter((suggestion) => (
        suggestion !== BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY ||
        this.birthdayContactsDismissedDayKey === localDayKey
      ))
    );
    for(const suggestion of this.dismissedSinceFetch) {
      dismissedSuggestions.add(suggestion);
    }
    if(this.birthdayContactsDismissedDayKey === localDayKey) {
      dismissedSuggestions.add(BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY);
    }

    const pendingSuggestions = [];
    if(promoData._ === 'help.promoData') {
      for(const suggestion of promoData.dismissed_suggestions) {
        dismissedSuggestions.add(suggestion);
      }

      for(const suggestion of promoData.pending_suggestions) {
        if(dismissedSuggestions.has(suggestion)) continue;
        pendingSuggestions.push(suggestion);
      }
    }

    this.myPromoData = {
      pendingSuggestions,
      dismissedSuggestions: [...dismissedSuggestions]
    };

    this.rootScope.dispatchEvent('promo_data_update', this.myPromoData);
  }

  public dismissSuggestion(suggestion: string) {
    if(this.myPromoData.dismissedSuggestions.includes(suggestion)) return;

    const birthdayDismissedDayKey = suggestion === BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY ?
      getLocalDayKey(new Date()) : undefined;
    this.pendingDismissed.add(suggestion);
    if(birthdayDismissedDayKey) {
      this.birthdayContactsDismissedDayKey = birthdayDismissedDayKey;
      void this.appStateManager.pushToState('birthdayContactsDismissedDayKey', birthdayDismissedDayKey)
      .catch(() => {});
    } else {
      this.dismissedSinceFetch.add(suggestion);
    }
    this.setPromoData(this.promoData);

    this.apiManager.invokeApiSingleProcess({
      method: 'help.dismissSuggestion',
      params: {suggestion, peer: {_: 'inputPeerEmpty'}}
    }).then(() => {
      this.pendingDismissed.delete(suggestion);
      this.setPromoData(this.promoData);
    }).catch(() => {
      this.pendingDismissed.delete(suggestion);
      if(suggestion !== BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY) {
        this.dismissedSinceFetch.delete(suggestion);
      }
      this.setPromoData(this.promoData);
    });
  }

  public isCachedBirthdayNearby(peerId: PeerId) {
    const now = new Date();
    const nearbyDates = [-1, 0, 1].map((offset) => {
      const date = new Date(now);
      date.setDate(date.getDate() + offset);
      return date;
    });
    const cachedBirthday = peerId.isUser() ?
      this.appProfileManager.getCachedFullUser(peerId.toUserId())?.birthday : undefined;
    if(cachedBirthday && nearbyDates.some((date) => isBirthdayOnDate(cachedBirthday, date))) {
      return true;
    }

    if(this.contactBirthdaysDayKey !== getLocalDayKey(now)) return false;

    return !!this.contactBirthdaysState?.contacts.some((contact) => (
      contact.peerId === peerId && nearbyDates.some((date) => isBirthdayOnDate(contact.birthday, date))
    ));
  }

  public getContactBirthdays(force = false): Promise<ContactBirthdaysState> {
    const dayKey = getLocalDayKey(new Date());
    if(!force && this.contactBirthdaysState && this.contactBirthdaysDayKey === dayKey) {
      return Promise.resolve(this.contactBirthdaysState);
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'contacts.getBirthdays',
      processResult: (result) => {
        const inaccessibleUserIds = new Set(
          result.users
          .filter((user) => user._ === 'userEmpty')
          .map((user) => String(user.id))
        );
        this.appPeersManager.saveApiPeers(result);

        const now = new Date();
        const yesterdayDate = new Date(now);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const tomorrowDate = new Date(now);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const contacts: BirthdayContact[] = [];
        const yesterday: BirthdayContact[] = [];
        const today: BirthdayContact[] = [];
        const tomorrow: BirthdayContact[] = [];

        for(const contact of result.contacts) {
          const userId = contact.contact_id;
          const user = this.appUsersManager.getUser(userId);
          if(inaccessibleUserIds.has(String(userId)) || !user || user.pFlags.deleted) continue;

          this.appProfileManager.modifyCachedFullUser(userId, (userFull) => {
            const birthday = userFull.birthday;
            if(birthday?.day === contact.birthday.day &&
              birthday.month === contact.birthday.month &&
              birthday.year === contact.birthday.year) {
              return false;
            }

            userFull.birthday = contact.birthday;
          });

          if(user.pFlags.self || userId === this.rootScope.myId ||
            this.appProfileManager.getCachedFullUser(userId)?.pFlags.blocked) {
            continue;
          }

          const birthdayContact: BirthdayContact = {
            peerId: userId.toPeerId(false),
            birthday: contact.birthday
          };
          contacts.push(birthdayContact);

          if(isBirthdayOnDate(contact.birthday, yesterdayDate)) {
            yesterday.push(birthdayContact);
          } else if(isBirthdayOnDate(contact.birthday, now)) {
            today.push(birthdayContact);
          } else if(isBirthdayOnDate(contact.birthday, tomorrowDate)) {
            tomorrow.push(birthdayContact);
          }
        }

        this.contactBirthdaysDayKey = getLocalDayKey(now);
        return this.contactBirthdaysState = {contacts, yesterday, today, tomorrow};
      }
    });
  }
}
