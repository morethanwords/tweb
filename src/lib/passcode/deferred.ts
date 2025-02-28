import deferredPromise from '../../helpers/cancellablePromise';

export default class DeferredIsUsingPasscode {
  private static deferred = deferredPromise<boolean>();
  private static value: boolean;

  public static resolveDeferred(value: boolean) {
    this.value = value;
    this.deferred?.resolve(value);
  }

  public static overrideCurrentValue(value: boolean) {
    this.value = value;
    this.deferred = undefined;
  }

  public static async isUsingPasscode() {
    if(this.deferred) await this.deferred;

    if(typeof this.value !== 'boolean') throw new Error('Is using passcode is not boolean WTF?');

    return this.value;
  }
}
