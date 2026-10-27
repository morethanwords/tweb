import {JSX, Match, Show, Switch, children, createMemo, lazy, onMount} from 'solid-js';

import Scrollable from '@components/scrollable2';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {IS_MOBILE_SAFARI} from '@environment/userAgent';
import loadFonts from '@helpers/dom/loadFonts';
import {doubleRaf} from '@helpers/schedulers';
import pause from '@helpers/schedulers/pause';
import classNames from '@helpers/string/classNames';
import themeController from '@helpers/themeController';
import liteMode from '@helpers/liteMode';
import Modes from '@config/modes';
import I18n from '@lib/langPack';

import {Transition} from '@vendor/solid-transition-group';

import {
  AuthFlowContext,
  AuthFlowContextValue,
  currentCard,
  matchCard,
  navigateAuth
} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';
import type {AuthFlowHost, AuthFlowOptions} from '@/pages/mountAuthFlow';
import Button from '@components/buttonTsx';

if(import.meta.hot) import.meta.hot.accept();

/* ------------------------------------------------------------------ */
/* Lazy card slots — same chunk-splitting as the legacy dynamic imports */
/* ------------------------------------------------------------------ */

const SignInCard = lazy(() => import('@/pages/cards/SignInCard'));
const AuthCodeCard = lazy(() => import('@/pages/cards/AuthCodeCard'));
const EmailSetupCard = lazy(() => import('@/pages/cards/EmailSetupCard'));
const EmailSetupCodeCard = lazy(() => import('@/pages/cards/EmailSetupCodeCard'));
const PasswordCard = lazy(() => import('@/pages/cards/PasswordCard'));
const SignUpCard = lazy(() => import('@/pages/cards/SignUpCard'));
const EmailRecoverCard = lazy(() => import('@/pages/cards/EmailRecoverCard'));
const SignQRCard = lazy(() => import('@/pages/cards/SignQRCard'));
const SignImportCard = lazy(() => import('@/pages/cards/SignImportCard'));

/* ------------------------------------------------------------------ */
/* Host                                                               */
/* ------------------------------------------------------------------ */

/**
 * Top-level component for the auth flow. Renders the host shell, the back
 * button, the scrollable container (`<Scrollable>` from `scrollable2.tsx`),
 * and the current card.
 *
 * Responsibilities lifted from the legacy `src/index.ts` bootstrap:
 * - host enter animation when opened from the app of another account
 * - scrollable opacity fade-in once fonts are ready
 * - top/bottom flex spacers around the cards
 *
 * What the back button and a sign-in lead to is the mounter's (`AuthFlowOptions`).
 *
 * Cards mount/unmount on every navigation — `<Transition mode="outin">` waits
 * for the leaving card's exit animation before the new card enters. There's
 * no keep-alive: every card runs `onMount` / `onCleanup` on each visit.
 */
export default function AuthCardsHost(props: AuthFlowOptions & {ref: (host: AuthFlowHost) => void}): JSX.Element {
  let hostEl!: HTMLElement;
  let scrollableEl!: HTMLDivElement;
  // * back or signed in: whichever came first is where the host goes
  let leaving = false;

  /* ---------- context ---------- */

  const ctx: AuthFlowContextValue = {
    accountNumber: props.accountNumber,
    managers: props.managers,
    current: currentCard,
    navigate: navigateAuth,
    back,
    toIm,
    openAccount: props.openAccount,
    isLeaving: () => leaving
  };

  const host: AuthFlowHost = {leave, back};
  props.ref(host);

  /* ---------- back button (returns to previous account) ---------- */

  async function back(): Promise<void> {
    if(!props.back || leaving) return;
    leaving = true;
    hostEl.classList.add(styles.leaving);
    await props.back(host);
  }

  /* ---------- transition into the IM page ---------- */

  async function toIm(): Promise<void> {
    if(leaving) return;
    leaving = true;
    // Nothing goes back from here. And `#page-chats` hides the cards the
    // instant it shows, but the fixed corner buttons (z-index: 100) sit above
    // it — fade them out now so they don't linger until the host is disposed
    // ~1s later.
    hostEl.classList.add(styles.leaving);
    await props.toIm(host);
  }

  // * reduced animations fade it where it stands, and none leave it at once. The screens are done from its
  // * first moment, whoever asked it - an answer still on its way is no failure of theirs, a photo picked
  // * opens no editor
  async function leave(): Promise<void> {
    leaving = true;
    hostEl.classList.add(styles.leaving);
    if(!liteMode.isAvailable('animations')) return;
    hostEl.classList.add(styles.hostExit);
    await doubleRaf();
    hostEl.classList.add(styles.hostExiting);
    await pause(200);
  }

  /* ---------- theme toggle (mirrors sidebarLeft "Dark mode" menu item) ---------- */

  function toggleTheme(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const icon = target.querySelector('.tgico') ?? target;
    const rect = icon.getBoundingClientRect();
    themeController.switchTheme(undefined, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    });
  }

  /* ---------- enter animation (was in src/index.ts) ---------- */

  async function runEnterSequence() {
    const fontsPromise = loadFonts();

    const shouldAnimate = props.animateEnter && liteMode.isAvailable('animations');
    if(shouldAnimate) {
      hostEl.classList.add(styles.hostEnter);
    }

    await fontsPromise;
    hostEl.style.opacity = '';

    if(!shouldAnimate) return;

    await pause(20);
    await doubleRaf();
    hostEl.classList.add(styles.hostEntering);
    await pause(1000);
    hostEl.classList.remove(styles.hostEnter, styles.hostEntering);
  }

  /* ---------- onMount ---------- */

  onMount(() => {
    if(!currentCard()) {
      console.warn(
        '[AuthCardsHost] mounted without an initial card — call navigateAuth({...}) before render'
      );
    }

    runEnterSequence();

    // * opened over the app, from its menu: the focus comes into the screens (a card that asks for
    // * its field takes it from here), and Tab walks on from their top
    if(props.overApp && Modes.a11y && !hostEl.contains(document.activeElement)) {
      hostEl.focus({preventScroll: true});
    }
  });

  /* ---------- render ---------- */

  return (
    <AuthFlowContext.Provider value={ctx}>
      <main
        ref={hostEl}
        style={{opacity: 0}}
        class={classNames('whole', styles.host, props.overApp && styles.overApp)}
        id="auth-pages"
        tabIndex={props.overApp && Modes.a11y ? -1 : undefined}
      >
        {props.back && (
          <Button.Icon icon="back" class={styles.closeButton} onClick={back} aria-label={I18n.format('StarsRating.Back', true)} />
        )}
        <Button.Icon icon="darkmode_filled" class={styles.themeButton} onClick={toggleTheme} aria-label={I18n.format('DarkMode', true)} />
        <Scrollable
          ref={scrollableEl}
          class={classNames(
            styles.scrollable,
            (!IS_TOUCH_SUPPORTED || IS_MOBILE_SAFARI) && 'no-scrollbar'
          )}
        >
          <div class={classNames(styles.placeholder, styles.placeholderTop)} />
          <div class={styles.cardsContainer}>
            <CardsTransition />
          </div>
          <div class={styles.placeholder} />
        </Scrollable>
      </main>
    </AuthFlowContext.Provider>
  );
}

/**
 * The Switch is lifted out of `<Transition>`'s direct children and resolved via
 * `children()` so we can observe the matched card from outside the transition
 * primitive. Two consequences:
 *
 * - Lazy card chunks resolve to `""` while the import is in flight, which
 *   `resolveFirst` (inside `<Transition>`) reads as `null`. If `<Transition>`
 *   were mounted at that moment, the subsequent `null → element` update would
 *   be interpreted as an enter and animate the *first* card in. We instead
 *   gate `<Transition>` behind `<Show>` until the first real card is resolved,
 *   so its initial child is the card itself — `appear={false}` then correctly
 *   suppresses the initial animation.
 * - For card-to-card navigation, a `createMemo` retains the previously rendered
 *   card during the new card's lazy-load window, so `<Transition>` never sees
 *   a transient empty state mid-navigation either.
 */
function CardsTransition(): JSX.Element {
  const cardChild = children(() => (
    <Switch>
      <Match when={matchCard('signIn')} keyed>
        {(spec) => <SignInCard spec={spec} />}
      </Match>
      <Match when={matchCard('authCode')} keyed>
        {(spec) => <AuthCodeCard spec={spec} />}
      </Match>
      <Match when={matchCard('emailSetup')} keyed>
        {(spec) => <EmailSetupCard spec={spec} />}
      </Match>
      <Match when={matchCard('emailSetupCode')} keyed>
        {(spec) => <EmailSetupCodeCard spec={spec} />}
      </Match>
      <Match when={matchCard('password')} keyed>
        {(spec) => <PasswordCard spec={spec} />}
      </Match>
      <Match when={matchCard('signUp')} keyed>
        {(spec) => <SignUpCard spec={spec} />}
      </Match>
      <Match when={matchCard('emailRecover')} keyed>
        {(spec) => <EmailRecoverCard spec={spec} />}
      </Match>
      <Match when={matchCard('signQR')} keyed>
        {(spec) => <SignQRCard spec={spec} />}
      </Match>
      <Match when={matchCard('signImport')} keyed>
        {(spec) => <SignImportCard spec={spec} />}
      </Match>
    </Switch>
  ));

  const stableCard = createMemo<JSX.Element>((prev) => {
    const c = cardChild();
    return c || prev;
  });

  return (
    <Show when={stableCard()}>
      <Transition
        mode="outin"
        enterActiveClass={styles.cardEnterActive}
        exitActiveClass={styles.cardExitActive}
        enterClass={styles.cardEnter}
        enterToClass={styles.cardEnterTo}
        exitClass={styles.cardExit}
        exitToClass={styles.cardExitTo}
        appear={false}
      >
        {stableCard()}
      </Transition>
    </Show>
  );
}
