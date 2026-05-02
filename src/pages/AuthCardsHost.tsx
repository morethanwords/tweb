/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, Match, Show, Switch, children, createMemo, lazy, onMount} from 'solid-js';

import Scrollable from '@components/scrollable2';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {IS_MOBILE_SAFARI} from '@environment/userAgent';
import loadFonts from '@helpers/dom/loadFonts';
import {doubleRaf} from '@helpers/schedulers';
import pause from '@helpers/schedulers/pause';
import classNames from '@helpers/string/classNames';
import themeController from '@helpers/themeController';
import {changeAccount} from '@lib/accounts/changeAccount';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {getValidatedAccount} from '@lib/accounts/getValidatedAccount';
import rootScope from '@lib/rootScope';
import sessionStorage from '@lib/sessionStorage';

import {Transition} from '@vendor/solid-transition-group';

import {
  AuthFlowContext,
  AuthFlowContextValue,
  currentCard,
  matchCard,
  navigateAuth
} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';
import {bootstrapIm} from '@/pages/bootstrapIm';
import Button from '@components/buttonTsx';

/* ------------------------------------------------------------------ */
/* Lazy card slots — same chunk-splitting as the legacy dynamic imports */
/* ------------------------------------------------------------------ */

const SignInCard = lazy(() => import('@/pages/cards/SignInCard'));
const AuthCodeCard = lazy(() => import('@/pages/cards/AuthCodeCard'));
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
 * - host enter animation when re-mounting after an account switch
 * - scrollable opacity fade-in once fonts are ready
 * - top/bottom flex spacers around the cards
 *
 * Cards mount/unmount on every navigation — `<Transition mode="outin">` waits
 * for the leaving card's exit animation before the new card enters. There's
 * no keep-alive: every card runs `onMount` / `onCleanup` on each visit.
 */
export default function AuthCardsHost(): JSX.Element {
  const showBackButton = getCurrentAccount() !== 1;

  let hostEl!: HTMLDivElement;
  let scrollableEl!: HTMLDivElement;

  /* ---------- context ---------- */

  const ctx: AuthFlowContextValue = {
    managers: rootScope.managers,
    current: currentCard,
    navigate: navigateAuth,
    back,
    toIm
  };

  /* ---------- back button (returns to previous account) ---------- */

  async function back(): Promise<void> {
    await sessionStorage.set({should_animate_main: 1});
    const prevAccount = getValidatedAccount(await sessionStorage.get('previous_account'));
    await sessionStorage.delete('previous_account');

    if(hostEl) {
      hostEl.classList.add(styles.hostExit);
      await doubleRaf();
      hostEl.classList.add(styles.hostExiting);
      await pause(200);
    }

    changeAccount(prevAccount);
  }

  /* ---------- transition into the IM page ---------- */

  async function toIm(): Promise<void> {
    await bootstrapIm();
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

    const shouldAnimate = await sessionStorage.get('should_animate_auth');
    if(shouldAnimate) {
      await sessionStorage.delete('should_animate_auth');
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
  });

  /* ---------- render ---------- */

  return (
    <AuthFlowContext.Provider value={ctx}>
      <div ref={hostEl} style={{opacity: 0}} class={classNames('whole', styles.host)} id="auth-pages">
        {showBackButton && (
          <Button.Icon icon="back" class={styles.closeButton} onClick={back} />
        )}
        <Button.Icon icon="darkmode_filled" class={styles.themeButton} onClick={toggleTheme} />
        <Scrollable
          ref={scrollableEl}
          class={classNames(
            styles.scrollable,
            (!IS_TOUCH_SUPPORTED || IS_MOBILE_SAFARI) && 'no-scrollbar'
          )}
        >
          <div class={styles.placeholder} />
          <div class={styles.cardsContainer}>
            <CardsTransition />
          </div>
          <div class={styles.placeholder} />
        </Scrollable>
      </div>
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
