import {Component} from 'solid-js';
import {render} from 'solid-js/web';
import {LangPackKey} from '@lib/langPack';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {InstanceOf} from '@types';
import {SliderSuperTab} from '@components/slider';
import {SliderSuperTabEventable} from '@components/sliderTab';
import {EventListenerListeners} from '@helpers/eventListenerBase';
import {PromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';


type ScaffoldSolidJSTabArgs<Payload> = {
  title: LangPackKey | ((payload: Payload) => LangPackKey);
  getComponentModule: () => Promise<{default: Component}>;
  onOpenAfterTimeout?: (this: InstanceOf<ScaffoledClass<Payload>>) => void;
  onClose?: (this: InstanceOf<ScaffoledClass<Payload>>) => void;
  onCloseAfterTimeout?: (this: InstanceOf<ScaffoledClass<Payload>>) => void;
};

type ScaffoledClass<Payload = void> = new (...args: ConstructorParameters<typeof SliderSuperTab>) => SliderSuperTab & {
  payload: Payload;
  init(payload: Payload, overrideTitle?: LangPackKey): Promise<void>;
};

export function scaffoldSolidJSTab<Payload = void>({
  title,
  getComponentModule,
  onOpenAfterTimeout,
  onClose,
  onCloseAfterTimeout
}: ScaffoldSolidJSTabArgs<Payload>): ScaffoledClass<Payload> {
  return class extends SliderSuperTab {
    public payload: Payload;

    private dispose?: () => void;

    public async init(payload: Payload, overrideTitle?: LangPackKey) {
      this.setTitle(overrideTitle || (typeof title === 'function' ? title(payload) : title));
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

    protected onClose() {
      onClose?.call?.(this);
    }

    protected onCloseAfterTimeout() {
      onCloseAfterTimeout?.call?.(this);
      this.dispose?.();
      super.onCloseAfterTimeout();
    }

    protected onOpenAfterTimeout() {
      onOpenAfterTimeout?.call?.(this);
    }
  } as ScaffoledClass<Payload>;
}


type ScaffoldSolidJSTabEventableArgs<Payload> = {
  title: LangPackKey | ((payload: Payload) => LangPackKey);
  getComponentModule: () => Promise<{default: Component}>;
  onOpenAfterTimeout?: (this: InstanceOf<ScaffoledEventableClass<Payload>>) => void;
};

type ScaffoledEventableClass<Payload = void, Events extends EventListenerListeners = {}> =
  new (...args: ConstructorParameters<typeof SliderSuperTab>) => SliderSuperTabEventable<Events> & {
    payload: Payload;
    init(payload: Payload, overrideTitle?: LangPackKey): Promise<void>;
  };

/**
 * Same as {@link scaffoldSolidJSTab} but the tab instance is a
 * {@link SliderSuperTabEventable}, so the rendered Solid component can dispatch
 * through (and external openers can listen on) `tab.eventListener` — needed by
 * e.g. PrivacySection, which saves on the tab's `destroy` event.
 */
export function scaffoldSolidJSTabEventable<Payload = void, Events extends EventListenerListeners = {}>({
  title,
  getComponentModule,
  onOpenAfterTimeout
}: ScaffoldSolidJSTabEventableArgs<Payload>): ScaffoledEventableClass<Payload, Events> {
  return class extends SliderSuperTabEventable<Events> {
    public payload: Payload;

    private dispose?: () => void;

    public async init(payload: Payload, overrideTitle?: LangPackKey) {
      this.setTitle(overrideTitle || (typeof title === 'function' ? title(payload) : title));
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

    public onCloseAfterTimeout() {
      this.dispose?.();
      return super.onCloseAfterTimeout();
    }

    protected onOpenAfterTimeout() {
      onOpenAfterTimeout?.call?.(this);
    }
  } as ScaffoledEventableClass<Payload, Events>;
}
