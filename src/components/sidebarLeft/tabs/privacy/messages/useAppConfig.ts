import {createResource} from 'solid-js';

import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';

import {usePromiseCollector} from '../../solidJsTabs/promiseCollector';


const useAppConfig = () => {
  const {rootScope} = useHotReloadGuard();
  const promiseCollector = usePromiseCollector();

  return createResource(() => {
    const promise = rootScope.managers.apiManager.getAppConfig();
    promiseCollector.collect(promise);
    return promise;
  });
};

export default useAppConfig;
