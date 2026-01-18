/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {State, StateSettings} from '@config/state';
import rootScope from '@lib/rootScope';
import StateStorage from '@lib/stateStorage';
import setDeepProperty, {splitDeepPath} from '@helpers/object/setDeepProperty';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {ActiveAccountNumber} from '@lib/accounts/types';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import {StoragesResults} from '@appManagers/utils/storages/loadStorages';
import commonStateStorage from '@lib/commonStateStorage';
import callbackify from '@helpers/callbackify';
import isObject from '@helpers/object/isObject';

export type ResetStoragesPromise = CancellablePromise<{
  storages: Map<keyof StoragesResults, (PeerId | UserId | ChatId)[]>,
  refetch?: boolean,
  callback: () => Promise<void>
}>;

export default class AppStateManager {
  private state: State = {} as any;
  public readonly storage: StateStorage;

  // ! for mtproto worker use only
  public newVersion: string;
  public oldVersion: string;
  public userId: UserId;

  public onSettingsUpdate: (value: StateSettings) => void;

  public readonly resetStoragesPromise: ResetStoragesPromise;

  constructor(private accountNumber: ActiveAccountNumber) {
    this.storage = new StateStorage(accountNumber);
    this.resetStoragesPromise = deferredPromise();
  }

  public getState() {
    return Promise.resolve(this.state);
  }

  public setByKey(key: string, value: any) {
    setDeepProperty(this.state, key, value);

    const first = splitDeepPath(key)[0] as keyof State;
    if(first === 'settings') {
      rootScope.dispatchEvent('settings_updated', {key, value, settings: this.state.settings});
    }

    return this.pushToState(first, this.state[first]);
  }

  public pushToState<T extends keyof State>(key: T, value: State[T], direct = true, onlyLocal?: boolean) {
    if(direct) {
      this.state[key] = value;
    }

    return this.setKeyValueToStorage(key, value, onlyLocal);
  }

  public updateLocalState<T extends keyof State>(key: T, value: State[T]) {
    this.state[key] = value;
    return this.storage.set({
      [key]: value
    }, true);
  }

  public setKeyValueToStorage<T extends keyof State>(key: T, value: State[T] = this.state[key], onlyLocal?: boolean) {
    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'state',
      key,
      value,
      accountNumber: this.accountNumber
    });

    if(key === 'settings') {
      this.onSettingsUpdate?.(value as StateSettings);
      return commonStateStorage.set({
        [key]: value
      }, onlyLocal);
    }

    return this.storage.set({
      [key]: value
    }, onlyLocal);
  }

  public getSomethingCached<T extends Extract<keyof State, 'accountContentSettings'>>({
    key,
    defaultValue,
    getValue,
    overwrite
  }: {
    key: T,
    defaultValue: State[T]['value'],
    getValue: () => Promise<State[T]['value']>,
    overwrite?: boolean
  }) {
    return callbackify(this.state ?? this.getState(), (state) => {
      const cached = state[key];
      const hasValue = isObject(cached) && Object.keys(cached).length;
      const now = Date.now();
      const shouldRefresh = !hasValue || cached.timestamp < (now - 86400e3);
      if(shouldRefresh || overwrite) {
        getValue().then((value) => {
          this.pushToState(key, {value, timestamp: now});
        });
      }

      if(!hasValue) {
        return defaultValue;
      }

      return cached.value;
    });
  }

  /* public resetState() {
    for(let i in this.state) {
      // @ts-ignore
      this.state[i] = false;
    }
    sessionStorage.set(this.state).then(() => {
      location.reload();
    });
  } */
}
