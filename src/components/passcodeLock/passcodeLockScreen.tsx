import {batch, Component, createEffect, createRenderEffect, createSignal, mergeProps, on, onCleanup, onMount} from 'solid-js';
import {createMutable} from 'solid-js/store';

import {SETTINGS_INIT} from '../../config/state';
import type {WallPaper} from '../../layer';
import {useHotReloadGuard} from '../../lib/solidjs/hotReloadGuard';
import {logger} from '../../lib/logger';
import AccountController from '../../lib/accounts/accountController';
import {i18n} from '../../lib/langPack';
import ListenerSetter from '../../helpers/listenerSetter';
import {getColorsFromWallPaper} from '../../helpers/color';
import mediaSizes, {ScreenSize} from '../../helpers/mediaSizes';

import ripple from '../ripple'; // keep
import Space from '../space';
import ChatBackgroundPatternRenderer from '../chat/patternRenderer';
import ChatBackgroundGradientRenderer from '../chat/gradientRenderer';
import {InputFieldTsx} from '../inputFieldTsx';
import PasswordInputField from '../passwordInputField';
import PasswordMonkey from '../monkeys/password';

import styles from './passcodeLockScreen.module.scss';


type StateStore = {
  isMobile: boolean;
  isError: boolean;
  passcode: string;
  totalAccounts: number;
  patternCanvas?: HTMLCanvasElement;
  gradientCanvas?: HTMLCanvasElement;
};

const log = logger('my-debug');

/**
 * TODO
 * []
 * []
 * []
 * []
 * []
 */
const PasscodeLockScreen: Component<{}> = (props) => {
  const {themeController, appImManager} = useHotReloadGuard();

  let container: HTMLDivElement;
  let passwordInputField: PasswordInputField;
  const listenerSetter = new ListenerSetter();

  const store = createMutable<StateStore>({
    isMobile: mediaSizes.activeScreen === ScreenSize.mobile,
    isError: false,
    passcode: '',
    totalAccounts: 1
  });

  async function createBackground() {
    const rect = container.getBoundingClientRect();
    const theme = themeController.getTheme();
    const slug = (theme.settings?.wallpaper as WallPaper.wallPaper)?.slug;
    const defaultTheme = SETTINGS_INIT.themes.find((t) => t.name === theme.name);
    const backgroundUrl = await appImManager.getBackground({slug});

    const {wallpaper: wallPaper} = themeController.getThemeSettings(theme);
    const isPattern = !!(wallPaper as WallPaper.wallPaper).pFlags.pattern;
    const intensity = wallPaper.settings?.intensity && wallPaper.settings.intensity / 100;
    const isDarkPattern = !!intensity && intensity < 0;

    const patternRenderer = ChatBackgroundPatternRenderer.getInstance({
      element: container,
      url: backgroundUrl,
      width: rect.width,
      height: rect.height,
      mask: isDarkPattern
    });

    const createdPatternCanvas = patternRenderer.createCanvas();
    createdPatternCanvas.classList.add(styles.CanvasCommon, styles.PatternCanvas);
    patternRenderer.renderToCanvas(createdPatternCanvas);

    const colors = getColorsFromWallPaper(wallPaper);
    const {canvas: createdGradientCanvas} = ChatBackgroundGradientRenderer.create(colors);
    createdGradientCanvas.classList.add(styles.CanvasCommon);

    batch(() => {
      store.patternCanvas = createdPatternCanvas;
      store.gradientCanvas = createdGradientCanvas;
    });

    return {patternRenderer};
  }

  onMount(() => {
    // const promise = createBackground();

    AccountController.getTotalAccounts().then(amount => store.totalAccounts = amount);

    listenerSetter.add(window)('resize', () => {
      ChatBackgroundPatternRenderer.resizeInstancesOf(container);
    });
    listenerSetter.add(mediaSizes)('changeScreen', (_, to) => {
      store.isMobile = to === ScreenSize.mobile;
    })
  });

  createEffect(on(() => store.isMobile, () => {
    // return;
    if(store.isMobile) return;
    const promise = createBackground();

    onCleanup(() => {
      const patternCanvas = store.patternCanvas;
      promise.then(({patternRenderer}) => {
        patternRenderer.cleanup(patternCanvas);
      });

      batch(() => {
        store.patternCanvas = undefined;
        store.gradientCanvas = undefined;
      });
    });
  }));

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  createEffect(() => {
    store.passcode;
    store.isError = false;
  });

  const input = (
    <InputFieldTsx
      InputFieldClass={PasswordInputField}
      instanceRef={(value) => void (passwordInputField = value)}

      value={store.passcode}
      onRawInput={value => void (store.passcode = value)}
      label="PasscodeLock.EnterYourPasscode"
      errorLabel={store.isError ? 'PasscodeLock.WrongPasscode' : undefined}
    />
  );


  return (
    <div ref={container} class={styles.Container}>
      {store.gradientCanvas}
      {store.patternCanvas}
      <div class={styles.Card}>
        <PasswordMonkeyTsx
          passwordInputField={passwordInputField}
        />
        <Space amount="1.125rem" />
        <form action="" onSubmit={(e) => {
          e.preventDefault();
          store.isError = true;
        }}>
          {input}
          <Space amount="1rem" />
          <button
            use:ripple
            type="submit"
            class="btn-primary btn-color-primary btn-large"
          >
            {i18n('DeleteProceedBtn')}
          </button>
        </form>
        <Space amount="1.625rem" />
        <div class={styles.Description}>
          {
            i18n(
              store.totalAccounts > 1 ?
                'PasscodeLock.ForgotPasscode.MultipleAccounts' :
                'PasscodeLock.ForgotPasscode.OneAccount',
              [
                <button
                  class={styles.LogoutButton}
                /> as HTMLButtonElement
              ]
            )
          }
        </div>
      </div>
    </div>
  );
};


const PasswordMonkeyTsx: Component<{
  passwordInputField: PasswordInputField;
  size?: number;
}> = (inProps) => {
  const props = mergeProps({size: 100}, inProps);

  const [monkey, setMonkey] = createSignal<PasswordMonkey>();

  createRenderEffect(() => {
    const monkey = new PasswordMonkey(props.passwordInputField, props.size);
    monkey.load();
    setMonkey(monkey);

    onCleanup(() => {
      monkey.remove();
    });
  });

  return (
    <div class={styles.PasswordMonkey} style={{'--size': props.size + 'px'}}>
      {monkey().container}
    </div>
  );
};

export default PasscodeLockScreen;
