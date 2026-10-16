import {CodeInputField} from '@components/codeInputField';
import {createEffect, createSignal, JSX, onCleanup, onMount, Show} from 'solid-js';

import styles from '@components/emailVerification.module.scss';
import MediaHeader from '@components/mediaHeader';
import Section from '@components/section';
import {I18nTsx} from '@helpers/solid/i18n';
import {InputFieldTsx} from '@components/inputFieldTsx';
import I18n, {LangPackKey} from '@lib/langPack';
import ButtonTsx from '@components/buttonTsx';
import classNames from '@helpers/string/classNames';
import mediaSizes from '@helpers/mediaSizes';
import {AccountEmailVerified, AccountSentEmailCode, EmailVerifyPurpose, MessageEntity} from '@layer';
import InputField, {InputState} from '@components/inputField';
import {fastRaf} from '@helpers/schedulers';
import focusWhenSettled from '@helpers/dom/focusWhenSettled';
import Animated from '@helpers/solid/animations';
import rootScope from '@lib/rootScope';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';

/**
 * The two steps of email verification — "type an address" and "type the code we
 * mailed you" — as standalone components, so that every surface that needs them
 * renders the same thing:
 *
 * - `showEmailSetupPopup()` (`@components/popups/emailSetup`) — the suggestion popup;
 * - `ChangeLoginEmailTab` — Settings → Privacy and Security → Login Email;
 * - the auth-flow cards, when the server answers `auth.sentCodeTypeSetUpEmailRequired`
 *   and a login email has to be added before the account can be signed into.
 *
 * The steps only own their own layout; the shell around them (popup, sidebar
 * tab, auth card) picks it with `variant` and passes `class` to fit them in.
 *
 * The `purpose` is what makes the same pair work in all three places:
 * `emailVerifyPurposeLoginChange` for an existing account,
 * `emailVerifyPurposeLoginSetup` (which carries the pending phone login) while
 * signing in. A login-setup verification answers with
 * `account.emailVerifiedLogin`, whose `sent_code` continues the login — which is
 * why `onSuccess` hands the result over instead of swallowing it.
 */

/**
 * Which surface the step is drawn on. `popup` — its own look, a pill button on a
 * fixed-height sheet. `card` — the sign-in shell, where the design system's button
 * radius, the cards' sticker size and their grey subtitle already rule, so the
 * step stops being the odd one out next to the other auth cards. `tab` — a settings
 * tab, drawn the way the other tabs are: the header on the tab's background, the
 * field and its button in a section of their own.
 */
export type StepVariant = 'popup' | 'card' | 'tab';

const VARIANT_CLASSES: {[variant in StepVariant]?: string} = {
  card: styles.onCard,
  tab: styles.onTab
};

/** Auth cards size their sticker with the screen; the popup's is fixed, a tab's the tabs' own. */
function stickerSize(variant: StepVariant) {
  if(variant === 'tab') return 130;
  if(variant !== 'card') return 120;
  return mediaSizes.isMobile ? 100 : 130;
}

/** A tab holds the step's field and its button in a section, the way the other settings tabs hold theirs. */
function StepForm(props: {variant?: StepVariant, children: JSX.Element}) {
  if(props.variant !== 'tab') {
    return props.children;
  }

  return (
    <Section>
      <div class="input-wrapper">{props.children}</div>
    </Section>
  );
}

/**
 * A second button under the step's own — the way back to an earlier step of the
 * flow the step is embedded in. It is the same button as the primary one, so a
 * card never grows a differently sized control next to it.
 */
export type StepSecondaryAction = {
  text: LangPackKey,
  onClick: () => void
};

function SecondaryButton(props: {action?: StepSecondaryAction}) {
  return (
    <Show when={props.action}>
      {(action) => (
        <ButtonTsx
          class={classNames(
            styles.button,
            styles.secondaryButton,
            'btn-primary btn-secondary btn-primary-transparent primary'
          )}
          text={action().text}
          onClick={() => action().onClick()}
        />
      )}
    </Show>
  );
}

/** Renders `a***b@c***.com`-style patterns with the masked runs as spoilers. */
export function wrapEmailPattern(pattern: string) {
  if(pattern.includes(' ') || !pattern.includes('*')) return pattern;

  const entities: MessageEntity[] = [];
  for(let i = 0; i < pattern.length;) {
    const idx = pattern.indexOf('*', i);
    if(idx === -1) break;
    let endIdx = idx + 1;
    while(pattern[endIdx] === '*') endIdx++;

    entities.push({
      _: 'messageEntitySpoiler',
      offset: idx,
      length: endIdx - idx
    });

    i = endIdx;
  }

  const wrapper = document.createElement('span');
  // an address reads left to right in any language
  wrapper.dir = 'ltr';
  wrapper.classList.add(styles.emailPattern);
  wrapper.append(wrapRichText(pattern, {entities, noTextFormat: true}));
  return wrapper;
}

let emailVerificationErrorIdSeed = 0;

export function EnterEmailStep(props: {
  isInitialSetup?: boolean
  class?: string
  purpose: EmailVerifyPurpose
  onCodeSent: (code: AccountSentEmailCode.accountSentEmailCode) => void
  /** Return `true` to take the error over — the step then shows nothing itself. */
  onError?: (err: ApiError) => boolean
  secondaryAction?: StepSecondaryAction
  variant?: StepVariant
}) {
  const [error, setError] = createSignal<LangPackKey | undefined>(undefined);
  const [email, setEmail] = createSignal<string>('');
  const [loading, setLoading] = createSignal(false);

  const errorDescriptionId = 'email-verification-error-' + (++emailVerificationErrorIdSeed);

  let inputRef!: InputField;

  function onSubmit() {
    if(!email().includes('@')) {
      inputRef.setError();
      return;
    }

    setLoading(true);
    rootScope.managers.appAccountManager.sendVerifyEmailCode(
      props.purpose,
      email()
    ).then((sentCode) => {
      setLoading(false);
      props.onCodeSent({
        ...sentCode,
        // the address was just typed in — show it in full rather than the
        // server's masked pattern
        email_pattern: email()
      });
    }).catch((err: ApiError) => {
      if(props.onError?.(err)) {
        setLoading(false);
        return;
      }

      if(err.type === 'EMAIL_INVALID') {
        setError('EmailSetup.InvalidEmail');
      } else if(err.type === 'EMAIL_NOT_ALLOWED') {
        setError('EmailSetup.BadEmail');
      } else {
        console.error(err);
        setError('Error.AnError');
      }

      // avoid flashing while transitioning to error state
      setTimeout(() => {
        setLoading(false);
      }, 200);
    });
  }

  onMount(() => {
    inputRef.input.setAttribute('aria-label', I18n.format('EmailSetup.InputCaption', true));
    onCleanup(focusWhenSettled(inputRef.input));

    subscribeOn(inputRef.input)('keydown', (e) => {
      if(e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      }
    });
  });

  return (
    <div class={classNames(styles.page, VARIANT_CLASSES[props.variant], props.class)}>
      <MediaHeader marginBottom={props.variant === 'tab'}>
        <MediaHeader.Sticker name="Mailbox" size={stickerSize(props.variant)} />
        <MediaHeader.Title>
          <I18nTsx key={props.isInitialSetup ? 'EmailSetup.Title' : 'EmailSetup.ChangeTitle'} />
        </MediaHeader.Title>
        <MediaHeader.Subtitle class={props.variant === 'card' ? 'secondary' : undefined}>
          <I18nTsx key={props.isInitialSetup ? 'EmailSetup.Subtitle' : 'EmailSetup.ChangeSubtitle'} />
        </MediaHeader.Subtitle>
      </MediaHeader>

      <StepForm variant={props.variant}>
        <InputFieldTsx
          instanceRef={ref => inputRef = ref}
          class={styles.input}
          label="EmailSetup.InputCaption"
          disabled={loading()}
          value={email()}
          errorLabel={error() ? null : undefined}
          errorDescriptionId={error() ? errorDescriptionId : undefined}
          onRawInput={(val) => {
            setEmail(val);
            setError(undefined);
            inputRef.setState(InputState.Neutral);
          }}
        />

        <div class={styles.footer}>
          <Animated type="cross-fade">
            <Show
              when={!error()}
              fallback={(
                <div id={errorDescriptionId} class={styles.error} role="alert">
                  <I18nTsx key={error()} />
                </div>
              )}
            >
              <div class={styles.buttonContainer}>
                <ButtonTsx
                  class={classNames(styles.button, 'btn-primary btn-color-primary')}
                  text="Continue"
                  disabled={loading()}
                  onClick={onSubmit}
                />
              </div>
            </Show>
          </Animated>
        </div>
      </StepForm>

      <SecondaryButton action={props.secondaryAction} />
    </div>
  )
}

export function EnterCodeStep(props: {
  class?: string
  visible?: boolean
  purpose: EmailVerifyPurpose
  sentCode: AccountSentEmailCode.accountSentEmailCode
  onSuccess: (result: AccountEmailVerified) => void
  onExpired: () => void
  /** Return `true` to take the error over — the step then shows nothing itself. */
  onError?: (err: ApiError) => boolean
  secondaryAction?: StepSecondaryAction
  variant?: StepVariant
}) {
  const [error, setError] = createSignal<LangPackKey | undefined>(undefined);
  const [loading, setLoading] = createSignal(false);
  const codeSignal = createSignal<string>('');

  let inputRef!: HTMLInputElement;

  createEffect(() => {
    // `visible` says which slider page is current — the popup keeps both in the
    // DOM, and focusing the one behind would steal the caret. The waiting for
    // the page to actually arrive is `focusWhenSettled`'s job.
    if(props.visible === false) return;
    onCleanup(focusWhenSettled(inputRef));
  })

  function onSubmit() {
    setLoading(true);
    rootScope.managers.appAccountManager.verifyEmail(
      props.purpose,
      {
        _: 'emailVerificationCode',
        code: codeSignal[0]()
      }
    ).then((result) => {
      setLoading(false);
      props.onSuccess(result);
    }).catch((err: ApiError) => {
      if(err.type === 'EMAIL_VERIFY_EXPIRED') {
        setLoading(false);
        return props.onExpired();
      }

      if(props.onError?.(err)) {
        setLoading(false);
        return;
      }

      if(err.type === 'CODE_INVALID') {
        setError('EmailSetup.WrongCode');
      } else {
        console.error(err);
        setError('Error.AnError');
      }

      codeSignal[1]('');

      // avoid flashing while transitioning to error state
      setTimeout(() => {
        setLoading(false);
        fastRaf(() => inputRef.focus());
      }, 200);
    });
  }

  return (
    <div class={classNames(styles.page, VARIANT_CLASSES[props.variant], props.class)}>
      <MediaHeader marginBottom={props.variant === 'tab'}>
        <MediaHeader.Sticker name="LoveLetter" size={stickerSize(props.variant)} />
        <MediaHeader.Title>
          <I18nTsx key="EmailSetup.CheckEmail" />
        </MediaHeader.Title>
        <MediaHeader.Subtitle class={props.variant === 'card' ? 'secondary' : undefined}>
          <I18nTsx
            key="EmailSetup.CheckEmailSubtitle"
            args={[wrapEmailPattern(props.sentCode.email_pattern)]}
          />
        </MediaHeader.Subtitle>
      </MediaHeader>

      <StepForm variant={props.variant}>
        <CodeInputField
          label="AccDescr.EmailCode"
          ref={inputRef}
          valueSignal={codeSignal}
          class={styles.input}
          length={props.sentCode.length}
          disabled={loading()}
          onFill={onSubmit}
          error={error() != null}
          onChange={() => setError(undefined)}
        />

        <div class={styles.footer}>
          <Animated type="cross-fade">
            <Show
              when={!error()}
              fallback={(
                <div class={styles.error} role="alert">
                  <I18nTsx key={error()} />
                </div>
              )}
            >
              <div class={styles.buttonContainer}>
                <ButtonTsx
                  class={classNames(styles.button, 'btn-primary btn-color-primary')}
                  text="Continue"
                  disabled={loading() || codeSignal[0]().length !== props.sentCode.length}
                  onClick={onSubmit}
                />
              </div>
            </Show>
          </Animated>
        </div>
      </StepForm>

      <SecondaryButton action={props.secondaryAction} />
    </div>
  )
}
