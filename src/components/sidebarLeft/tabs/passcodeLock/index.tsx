import {Component} from 'solid-js';
import {render} from 'solid-js/web';

import SolidJSHotReloadGuardProvider from '../../../../lib/solidjs/hotReloadGuardProvider';
import {LangPackKey} from '../../../../lib/langPack';

import SidebarSlider, {SliderSuperTab} from '../../../slider';

import {PromiseCollector} from './promiseCollector';
import {SuperTabProvider} from './superTabProvider';

type ScaffoldSolidJSTabArgs = {
  title: LangPackKey;
  getComponentModule: () => MaybePromise<{default: Component}>;
};

type ScaffoledClass<Payload = void> = new (slider: SidebarSlider, destroyable?: boolean) => SliderSuperTab & {
  payload: Payload;
  init(payload: Payload): Promise<void>;
};

function scaffoldSolidJSTab<Payload = void>({title, getComponentModule}: ScaffoldSolidJSTabArgs): ScaffoledClass<Payload> {
  return class extends SliderSuperTab {
    public payload: Payload;

    private dispose?: () => void;

    public async init(payload: Payload) {
      this.setTitle(title);
      this.payload = payload;

      const div = document.createElement('div');

      const {default: Component} = await getComponentModule();

      const loadPromises: Promise<any>[] = [];
      let collectPromise = (promise: Promise<any>): void => void loadPromises.push(promise);

      this.dispose = render(() => (
        <SolidJSHotReloadGuardProvider>
          <PromiseCollector onCollect={(promise) => collectPromise(promise)}>
            <SuperTabProvider self={this} allTabs={allTabs}>
              <Component />
            </SuperTabProvider>
          </PromiseCollector>
        </SolidJSHotReloadGuardProvider>
      ), div);

      collectPromise = () => {}; // lose reference to the promises array
      // console.log('loadPromises.length :>> ', loadPromises.length);

      this.scrollable.append(div);

      await Promise.all(loadPromises);
    }

    protected onCloseAfterTimeout() {
      this.dispose?.();
      super.onCloseAfterTimeout();
    }
  } as ScaffoledClass<Payload>;
}

export const AppPasscodeLockTab = scaffoldSolidJSTab({
  title: 'PasscodeLock.Title',
  getComponentModule: () => import('./mainTab')
});

export const AppPasscodeEnterPasswordTab = scaffoldSolidJSTab<{
  passcode: string;
} | void>({
  title: 'PasscodeLock.Title',
  getComponentModule: () => import('./enterPasswordTab')
});


export type AllPasscodeLockTabs = typeof allTabs;

const allTabs = {
  AppPasscodeLockTab,
  AppPasscodeEnterPasswordTab
};
