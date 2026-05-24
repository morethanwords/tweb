import {onCleanup, onMount} from 'solid-js';

import Button from '@components/buttonTsx';
import LanguageChangeButton from '@components/languageChangeButton';
import PasskeyLoginButton from '@components/passkeyLoginButton';
import {putPreloader} from '@components/putPreloader';
import MediaHeader from '@components/mediaHeader';
import bytesCmp from '@helpers/bytes/bytesCmp';
import bytesToBase64 from '@helpers/bytes/bytesToBase64';
import fixBase64String from '@helpers/fixBase64String';
import pause from '@helpers/schedulers/pause';
import textToSvgURL from '@helpers/textToSvgURL';
import type {DcId} from '@types';
import {AuthAuthorization, AuthLoginToken} from '@layer';
import App from '@config/app';
import {LangPackKey, i18n} from '@lib/langPack';
import AccountController from '@lib/accounts/accountController';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import rootScope from '@lib/rootScope';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Spec = Extract<CardSpec, {name: 'signQR'}>;

const FETCH_INTERVAL = 3;
const QR_SIZE = 240;

/**
 * Card variant of `pageSignQR`. Polls `auth.exportLoginToken` in a loop, painting
 * the QR code into the `auth-image` slot. On `loginTokenSuccess` we go to IM; on
 * `SESSION_PASSWORD_NEEDED` to the password card; on cancel/back to the signIn
 * card. The loop terminates when the card unmounts (cleanup flips `stopped`).
 */
export default function SignQRCard(_props: {spec: Spec}) {
  const {managers, navigate, toIm} = useAuthFlow();

  // Persistent host for the QR canvas (qr-code-styling injects its canvas
  // into this div). We hand it to <MediaHeader.Sticker element={...}>.
  let stickerHost: HTMLDivElement;
  let preloader: HTMLElement | undefined;
  let stopped = false;

  // Latest token we've drawn — kept so the theme_changed listener can repaint
  // synchronously without waiting for the next `iterate` cycle to come around.
  let lastDrawnToken: Uint8Array | number[] | undefined;
  let QRCodeStylingCtor: any;

  /* ---------- description list ---------- */

  const helpKeys: LangPackKey[] = ['Login.QR.Help1', 'Login.QR.Help2', 'Login.QR.Help3'];
  const helpList = (
    <ol class={styles.qrDescription}>
      {helpKeys.map((key, idx) => (
        <li class={styles.qrDescriptionItem}>
          <span class={styles.qrDescriptionMarker}>{idx + 1}</span>
          {i18n(key)}
        </li>
      ))}
    </ol>
  );

  /* ---------- 'user_auth' subscription ---------- */

  const onUserAuth = () => {
    stopped = true;
  };
  rootScope.addEventListener('user_auth', onUserAuth, {once: true});

  /* ---------- paint QR ---------- */

  // Builds the QR canvas (and its embedded logo) from the current token using the
  // theme's CSS variables. Called on token rotation from `iterate` and on theme
  // change from the `theme_changed` listener so the QR repaints with the new
  // colors without waiting for the next 3-second polling tick.
  async function paintQR(token: Uint8Array | number[]) {
    if(!QRCodeStylingCtor) return;

    const encoded = bytesToBase64(token);
    const url = 'tg://login?token=' + fixBase64String(encoded, true);

    const style = window.getComputedStyle(document.documentElement);
    const surfaceColor = style.getPropertyValue('--light-filled-primary-color').trim();
    const textColor = style.getPropertyValue('--primary-text-color').trim();
    const primaryColor = style.getPropertyValue('--primary-color').trim();

    const logoUrl = await fetch('assets/img/logo_padded.svg')
    .then((res) => res.text())
    .then((text) => {
      text = text.replace(/(fill:).+?(;)/, `$1${primaryColor}$2`);
      return textToSvgURL(text);
    });

    const qrCode = new QRCodeStylingCtor({
      width: QR_SIZE * window.devicePixelRatio,
      height: QR_SIZE * window.devicePixelRatio,
      data: url,
      image: logoUrl,
      dotsOptions: {color: textColor, type: 'rounded'},
      cornersSquareOptions: {type: 'extra-rounded'},
      imageOptions: {imageSize: 1, margin: 0},
      backgroundOptions: {color: surfaceColor},
      qrOptions: {errorCorrectionLevel: 'L'}
    });

    qrCode.append(stickerHost);
    (stickerHost.lastChild as HTMLCanvasElement).classList.add(styles.qrCanvas);

    let promise: Promise<void>;
    if(qrCode._drawingPromise) {
      promise = qrCode._drawingPromise;
    } else {
      promise = Promise.race([
        pause(1000),
        new Promise<void>((resolve) => {
          qrCode._canvas._image.addEventListener('load', () => {
            window.requestAnimationFrame(() => resolve());
          }, {once: true});
        })
      ]);
    }

    // ! costyl, but the library doesn't expose any events
    await promise.then(() => {
      if(preloader) {
        preloader.style.animation = 'hide-icon .4s forwards';

        const c = stickerHost.children[1] as HTMLElement;
        c.style.display = 'none';
        c.style.animation = 'grow-icon .4s forwards';
        setTimeout(() => {
          c.style.display = '';
        }, 150);
        setTimeout(() => {
          c.style.animation = '';
        }, 500);
        preloader = undefined;
      } else {
        Array.from(stickerHost.children).slice(0, -1).forEach((el) => el.remove());
      }
    });

    lastDrawnToken = token;
  }

  /* ---------- theme_changed: repaint with new CSS-variable colors ---------- */

  const onThemeChanged = () => {
    if(stopped || !lastDrawnToken) return;
    paintQR(lastDrawnToken);
  };
  rootScope.addEventListener('theme_changed', onThemeChanged);

  /* ---------- iterate loop ---------- */

  const options: {dcId?: DcId, ignoreErrors: true} = {ignoreErrors: true};
  let prevToken: Uint8Array | number[] | undefined;

  async function iterate(QRCodeStyling: any, isLoop: boolean): Promise<boolean> {
    try {
      const userIds = await AccountController.getUserIds();
      let loginToken = await managers.apiManager.invokeApi('auth.exportLoginToken', {
        api_id: App.id,
        api_hash: App.hash,
        except_ids: userIds.map((userId) => userId.toUserId())
      }, {ignoreErrors: true});

      if(loginToken._ === 'auth.loginTokenMigrateTo') {
        if(!options.dcId) {
          options.dcId = loginToken.dc_id as DcId;
          managers.apiManager.setBaseDcId(loginToken.dc_id);
        }

        loginToken = await managers.apiManager.invokeApi('auth.importLoginToken', {
          token: loginToken.token
        }, options) as AuthLoginToken.authLoginToken;
      }

      if(loginToken._ === 'auth.loginTokenSuccess') {
        const authorization = loginToken.authorization as any as AuthAuthorization.authAuthorization;
        await managers.apiManager.setUser(authorization.user);
        toIm();
        return true;
      }

      if(!prevToken || !bytesCmp(prevToken, loginToken.token)) {
        prevToken = loginToken.token;
        QRCodeStylingCtor = QRCodeStyling;
        await paintQR(loginToken.token);
      }

      if(isLoop) {
        const timestamp = Date.now() / 1000;
        const diff = loginToken.expires - timestamp - await managers.timeManager.getServerTimeOffset();
        await pause(diff > FETCH_INTERVAL ? 1e3 * FETCH_INTERVAL : 1e3 * diff | 0);
      }
    } catch(err) {
      switch((err as ApiError).type) {
        case 'SESSION_PASSWORD_NEEDED':
          navigate({name: 'password'});
          stopped = true;
          break;
        case 'AUTH_TOKEN_EXPIRED':
          console.warn('SignQRCard: AUTH_TOKEN_EXPIRED');
          return false;
        default:
          console.error('SignQRCard: default error:', err);
          stopped = true;
          break;
      }

      return true;
    }

    return false;
  }

  /* ---------- lifecycle ---------- */

  onMount(async() => {
    managers.appStateManager.pushToState('authState', {_: 'authStateSignQr'});

    preloader = putPreloader(stickerHost, true);

    const [{default: QRCodeStyling}] = await Promise.all([
      import('qr-code-styling' as any)
    ]);

    if(stopped) return;

    while(!stopped) {
      const needBreak = await iterate(QRCodeStyling, true);
      if(needBreak || stopped) break;
    }
  });

  onCleanup(() => {
    stopped = true;
    rootScope.removeEventListener('user_auth', onUserAuth);
    rootScope.removeEventListener('theme_changed', onThemeChanged);
  });

  /* ---------- render ---------- */

  return (
    <AuthCard
      class={styles.pageSignQR}
      inputWrapper={false}
      header={
        <MediaHeader>
          <MediaHeader.Sticker ref={stickerHost} class={styles.qrContainer} size={QR_SIZE}/>
          <MediaHeader.Title>{i18n('Login.QR.Title')}</MediaHeader.Title>
          <MediaHeader.Subtitle class="secondary">{i18n('Login.QR.Subtitle')}</MediaHeader.Subtitle>
        </MediaHeader>
      }
    >
      {helpList}
      <Button
        class="btn-primary btn-secondary btn-primary-transparent primary"
        onClick={() => {
          stopped = true;
          navigate({name: 'signIn'});
        }}
        text="Login.QR.Cancel"
      />
      {getCurrentAccount() === 1 && <LanguageChangeButton />}
      <PasskeyLoginButton />
    </AuthCard>
  );
}
