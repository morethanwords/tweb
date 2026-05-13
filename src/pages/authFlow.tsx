/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, Signal, createContext, createRoot, createSignal, useContext} from 'solid-js';

import rootScope from '@lib/rootScope';
import {AuthState} from '@types';
import {AuthSentCode} from '@layer';

/**
 * Centralised auth-flow router & shared context.
 *
 * `<AuthCardsHost>` (see `AuthCardsHost.tsx`) renders one card at a time. Cards
 * mount/unmount on every navigation — there's no caching. Lifecycle (lottie,
 * listeners, polling, etc.) lives in `onMount` / `onCleanup` of the card.
 *
 * Two ways to navigate:
 * - inside a card: `useAuthFlow().navigate({name: '…', payload: …})`
 * - outside Solid (e.g. passkey button): `navigateAuth({name: '…', payload: …})`
 *
 * Both paths funnel into the same module-level signal.
 */

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type CardName =
  | 'signIn'
  | 'authCode'
  | 'password'
  | 'signUp'
  | 'emailRecover'
  | 'signQR'
  | 'signImport';

export type CardPayloadMap = {
  signIn: void;
  authCode: AuthSentCode.authSentCode & {phone_number?: string};
  password: void;
  signUp: {phone_number: string, phone_code_hash: string};
  emailRecover: {email_pattern: string};
  signQR: void;
  signImport: AuthState.signImport['data'];
};

/**
 * Discriminated union — `payload` is required iff the card has a non-void payload.
 *
 * ```ts
 * navigateAuth({name: 'signIn'});
 * navigateAuth({name: 'authCode', payload: sentCode});
 * ```
 */
export type CardSpec = {
  [K in CardName]: CardPayloadMap[K] extends void
    ? {name: K}
    : {name: K, payload: CardPayloadMap[K]};
}[CardName];

export type AuthFlowContextValue = {
  /** Async-proxy managers from the worker — use for any MTProto call. */
  managers: typeof rootScope.managers;
  /** Currently mounted card (or `null` before bootstrap). */
  current: Accessor<CardSpec | null>;
  /** Switch to another card. The current card unmounts. */
  navigate(spec: CardSpec): void;
  /** Cancel auth flow and return to the previous account (used by the host's back button). */
  back(): void;
  /** Tear down the auth UI and bootstrap the IM page. */
  toIm(): Promise<void>;
};

/* ------------------------------------------------------------------ */
/* Module-level state                                                 */
/* ------------------------------------------------------------------ */

/**
 * Owned by a stable root so the signal lives across the whole app session.
 * `<AuthCardsHost>` reads `currentCard()`; imperative callers write through
 * `navigateAuth()`.
 */
const [currentCard, setCurrentCard] = (() => {
  const stored = (import.meta.hot?.data as any)?.currentCardSignal as Signal<CardSpec | null> | undefined;
  if(stored) return stored;
  const pair = createRoot(() => createSignal<CardSpec | null>(null));
  if(import.meta.hot) (import.meta.hot.data as any).currentCardSignal = pair;
  return pair;
})();

export {currentCard};

/**
 * Imperative navigation entry-point. Callable from non-Solid code (passkey button,
 * legacy adapter shims, error handlers) — the `<AuthCardsHost>` reacts to the same
 * signal regardless of who wrote to it.
 */
export function navigateAuth(spec: CardSpec): void {
  setCurrentCard(spec);
}

/**
 * Type-narrowed payload accessor — useful inside `<Match when={matchCard('authCode')}>`.
 * Returns the spec when the current card matches, else `null`.
 */
export function matchCard<K extends CardName>(name: K): Extract<CardSpec, {name: K}> | null {
  const c = currentCard();
  if(!c || c.name !== name) return null;
  return c as Extract<CardSpec, {name: K}>;
}

/* ------------------------------------------------------------------ */
/* Solid context                                                      */
/* ------------------------------------------------------------------ */

export const AuthFlowContext = createContext<AuthFlowContextValue>();

/**
 * Hook for cards to grab managers + navigation API.
 *
 * Throws if called outside `<AuthFlowProvider>` to fail fast — auth cards must
 * never be mounted standalone.
 */
export function useAuthFlow(): AuthFlowContextValue {
  const ctx = useContext(AuthFlowContext);
  if(!ctx) {
    throw new Error('useAuthFlow() called outside of <AuthFlowProvider>');
  }
  return ctx;
}

if(import.meta.hot) import.meta.hot.accept();
