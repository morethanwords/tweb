import deferredPromise from '../../helpers/cancellablePromise';

import StaticUtilityClass from '../staticUtilityClass';


export default class DeferredIsUsingPasscode extends StaticUtilityClass {
  private static deferred = deferredPromise<void>();
  private static value: boolean;

  public static resolveDeferred(value: boolean) {
    this.value = value;
    this.deferred?.resolve();
    this.deferred = undefined;
  }

  public static async isUsingPasscode() {
    if(this.deferred) await this.deferred;

    if(typeof this.value !== 'boolean') throw new Error('Is using passcode is not boolean WTF?');

    return this.value;
  }

  /**
   * Mainly for Service worker
   */
  public static resetDeferred() {
    this.value = undefined;
    this.deferred = deferredPromise();
  }
}
