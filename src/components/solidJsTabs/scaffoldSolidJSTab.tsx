import {Component} from 'solid-js';
import {render} from 'solid-js/web';
import {LangPackKey} from '@lib/langPack';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {InstanceOf} from '@types';
import {SliderSuperTab} from '@components/slider';
import {PromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';


type ScaffoldSolidJSTabArgs<Payload> = {
  title: LangPackKey;
  getComponentModule: () => Promise<{default: Component}>;
  onOpenAfterTimeout?: (this: InstanceOf<ScaffoledClass<Payload>>) => void;
};

type ScaffoledClass<Payload = void> = new (...args: ConstructorParameters<typeof SliderSuperTab>) => SliderSuperTab & {
  payload: Payload;
  init(payload: Payload, overrideTitle?: LangPackKey): Promise<void>;
};

export function scaffoldSolidJSTab<Payload = void>({
  title,
  getComponentModule,
  onOpenAfterTimeout
}: ScaffoldSolidJSTabArgs<Payload>): ScaffoledClass<Payload> {
  return class extends SliderSuperTab {
    public payload: Payload;

    private dispose?: () => void;

    public async init(payload: Payload, overrideTitle?: LangPackKey) {
      this.setTitle(overrideTitle || title);
      this.payload = payload;

      const div = document.createElement('div');

      const {default: Component} = await getComponentModule();

      const promiseCollectorHelper = PromiseCollector.createHelper();

      this.dispose = render(() => (
        <SolidJSHotReloadGuardProvider>
          <PromiseCollector onCollect={promiseCollectorHelper.onCollect}>
            <SuperTabProvider self={this}>
              <Component />
            </SuperTabProvider>
          </PromiseCollector>
        </SolidJSHotReloadGuardProvider>
      ), div);

      this.scrollable.append(div);

      await promiseCollectorHelper.await();
    }

    protected onCloseAfterTimeout() {
      this.dispose?.();
      super.onCloseAfterTimeout();
    }

    protected onOpenAfterTimeout() {
      onOpenAfterTimeout?.call?.(this);
    }
  } as ScaffoledClass<Payload>;
}
