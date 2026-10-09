import {createSignal} from 'solid-js';
import {FragmentCollectibleInfo} from '@layer';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import MediaHeader from '@components/mediaHeader';
import LottieAnimation from '@components/lottieAnimation';
import SelectorSearch from '@components/selectorSearch';
import A11yButton from '@components/a11yButton';
import formatUserPhone from '@components/wrappers/formatUserPhone';
import {I18nTsx} from '@helpers/solid/i18n';
import {copyPhoneNumber, copyTmeLink, copyUsername} from '@helpers/copyContact';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {formatFullSentTime} from '@helpers/date';
import {getMiddleware} from '@helpers/middleware';
import classNames from '@helpers/string/classNames';
import lottieLoader from '@lib/lottie/lottieLoader';
import rootScope from '@lib/rootScope';
import iconStyles from '@components/featureDetailsIconSticker.module.scss';
import styles from '@components/popups/collectibleInfo.module.scss';

/** A username or an anonymous (+888) number bought on Fragment — one of the two. */
type Collectible = {username: string, phone?: never} | {phone: string, username?: never};

function wrapAmount(amount: string | number, currency: string) {
  try {
    return paymentsWrapCurrencyAmount(amount, currency);
  } catch(err) { // a currency the table does not know
    return `${amount} ${currency}`;
  }
}

// the entity a request is out for: a second click on it while it is in flight is dropped
let resolving: string;

/**
 * Who owns a collectible and when and for how much it was bought, as tdesktop's CollectibleInfoBox.
 * `onFail` runs when the server knows of no such collectible (or the request fails) — the caller
 * falls back to what a click on the entity does otherwise.
 */
export default async function showCollectibleInfoPopup(options: Collectible & {
  peerId: PeerId,
  onFail?: () => void
}) {
  const {peerId, username, phone} = options;
  const key = username ? '@' + username : '+' + phone;
  if(resolving === key) {
    return;
  }

  resolving = key;
  let info: FragmentCollectibleInfo;
  try {
    info = await rootScope.managers.appProfileManager.getCollectibleInfo(username ? {
      _: 'inputCollectibleUsername',
      username
    } : {
      _: 'inputCollectiblePhone',
      phone: '+' + phone
    });
  } catch(err) {
    options.onFail?.();
    return;
  } finally {
    resolving = undefined;
  }

  const middlewareHelper = getMiddleware();
  // the owner as a chip, the way a picker shows a chosen peer
  const owner = SelectorSearch.renderEntity({
    key: peerId,
    middleware: middlewareHelper.get(),
    avatarSize: 30,
    meAsSaved: false
  });
  owner.element.classList.add(styles.owner);
  await Promise.all(owner.promises);

  const formatted = username ? '@' + username : formatUserPhone(phone);
  // the title's entity copies itself; the button a username's link, or the number again
  const copy = (link: boolean) => {
    if(phone) copyPhoneNumber(formatted);
    else if(link) copyTmeLink(username);
    else copyUsername(username);
  };

  const fiat = info.amount && info.currency ? wrapAmount(info.amount, info.currency) : undefined;
  const [show, setShow] = createSignal(false);

  createPopup(() => {
    // a white animation on the filled circle feature popups put their glyph on
    const icon = (
      <div class={classNames(iconStyles.Container, styles.icon)}>
        <LottieAnimation
          lottieLoader={lottieLoader}
          name={phone ? 'collectible_phone' : 'collectible_username'}
          size={64}
          restartOnClick
          lottieOptions={{color: [255, 255, 255]}}
          // shown once the animation can play, or straight away if it cannot (no WebAssembly)
          onPromise={(promise) => promise.then(() => setShow(true), () => setShow(true))}
        />
      </div>
    );

    return (
      <PopupElement
        class={styles.popup}
        show={show()}
        onCloseAfterTimeout={() => middlewareHelper.destroy()}
        old
      >
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Body class={styles.body}>
          <MediaHeader class={styles.header}>
            <MediaHeader.Sticker size={72} element={icon} />
            <MediaHeader.Title size={20}>
              <I18nTsx
                key={phone ? 'FragmentPhoneTitle' : 'FragmentUsernameTitle'}
                args={[
                  <A11yButton as="a" class={styles.entity} onClick={() => copy(false)}>
                    {formatted}
                  </A11yButton>
                ]}
              />
            </MediaHeader.Title>
            {owner.element}
            <MediaHeader.Subtitle>
              <I18nTsx
                key={phone ? 'FragmentPhoneMessage' : 'FragmentUsernameMessage'}
                // one node per argument: the args are flattened, so a fragment would shift the rest
                args={[
                  <span>{formatFullSentTime(info.purchase_date, false, true)}</span>,
                  wrapAmount(info.crypto_amount, info.crypto_currency),
                  fiat ? <span>({fiat})</span> : ''
                ]}
              />
            </MediaHeader.Subtitle>
          </MediaHeader>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            langKey="FragmentUsernameOpen"
            callback={() => {
              safeWindowOpen(info.url);
              return false;
            }}
          />
          <PopupElement.FooterButton
            langKey={phone ? 'Text.CopyLabel_PhoneNumber' : 'CopyLink'}
            color="secondary"
            callback={() => {
              copy(true);
              return false;
            }}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
