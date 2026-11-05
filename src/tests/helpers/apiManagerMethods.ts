import ApiManagerMethods from '@appManagers/apiManagerMethods';

/**
 * The app's request methods over `invokeApi` (invokeApiHashable, invokeApiSingle, invokeApiSingleProcess: the hashes
 * kept and the requests on their way joined as the app has them), with no constructor run
 */
export default function makeApiManagerMethods(invokeApi: (method: string, params?: any) => Promise<unknown>) {
  return Object.assign(Object.create(ApiManagerMethods.prototype) as ApiManagerMethods, {
    hashes: {},
    apiPromisesSingleProcess: {},
    apiPromisesSingle: {},
    invokeApi
  });
}
