/**
 * This class is an intermediate to avoid cyclic imports
 * Should get the hash from commonStateStorage
 */
export default class PasscodeHashFetcher {
  public static fetchHash = async(): Promise<Uint8Array> => {
    throw new Error('PasscodeHashFetcher.fetchHash was not set properly');
  }
}
