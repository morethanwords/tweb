import {Component} from 'solid-js';
import {render} from 'solid-js/web';

import SolidJSHotReloadGuardProvider from '../../../../lib/solidjs/hotReloadGuardProvider';
import {LangPackKey} from '../../../../lib/langPack';

import {SliderSuperTab} from '../../../slider';
import { PromiseCollector } from './promiseCollector';
import { ThisSuperTabProvider } from './thisTabProvider';

type ScaffoldSolidJSTabArgs = {
  title: LangPackKey;
  getComponentModule: () => MaybePromise<{default: Component}>;
};

const scaffoldSolidJSTab = ({title, getComponentModule}: ScaffoldSolidJSTabArgs) => 
  class extends SliderSuperTab {
    public async init() {
      this.setTitle(title);

      const div = document.createElement('div');

      const {default: Component} = await getComponentModule();

      const loadPromises: Promise<any>[] = [];
      let collectCallback = (promise: Promise<any>): void => void loadPromises.push(promise);

      render(() => (
        <SolidJSHotReloadGuardProvider>
          <PromiseCollector onCollect={(promise) => collectCallback(promise)}>
            <ThisSuperTabProvider value={this}>
              <Component />
            </ThisSuperTabProvider>
          </PromiseCollector>
        </SolidJSHotReloadGuardProvider>
      ), div);

      collectCallback = () => {}; // lose reference to the promises array
      // console.log('loadPromises.length :>> ', loadPromises.length);
      await Promise.all(loadPromises);

      this.scrollable.append(div);
    }
  };

export const AppPasscodeLockTab = scaffoldSolidJSTab({
  title: 'PasscodeLock.Title',
  getComponentModule: () => import('./main')
});
