import PopupElement, {createPopup} from '@components/popups/indexTsx'

import {TransitionSliderTsx} from '@components/transitionTsx';
import {createSignal, onCleanup, Show} from 'solid-js';

import styles from '@components/popups/emailSetup.module.scss';
import {EnterCodeStep, EnterEmailStep} from '@components/emailVerification';
import {AccountSentEmailCode, EmailVerifyPurpose} from '@layer';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {doubleRaf} from '@helpers/schedulers';

let isCurrentlyShowing = false;
export function showEmailSetupPopup(options: {
  purpose: EmailVerifyPurpose
  noskip: boolean
  onSuccess?: () => void
  onDismiss?: () => void
}) {
  if(isCurrentlyShowing) {
    return;
  }
  isCurrentlyShowing = true;

  const [show, setShow] = createSignal(false);
  const [page, setPage] = createSignal(0);
  const [code, setCode] = createSignal<AccountSentEmailCode.accountSentEmailCode | undefined>(undefined);
  const [codePageTransitionEnded, setCodePageTransitionEnded] = createSignal(false);

  return createPopup(() => {
    const secondPageNavigationItem: NavigationItem = {
      type: 'left',
      onPop: () => void setPage(0)
    }

    onCleanup(() => {
      isCurrentlyShowing = false;
      appNavigationController.removeItem(secondPageNavigationItem);
    });

    doubleRaf().then(() => setShow(true));

    let isSuccess = false

    return (
      <PopupElement
        class={styles.popup}
        show={show()}
        closable={!options.noskip}
        onClose={() => {
          isCurrentlyShowing = false;
          if(!isSuccess) options.onDismiss?.()
        }}
        isConfirmationNeededOnClose={() => {
          if(options.noskip && !isSuccess) return Promise.reject()
        }}
        old
      >
        <PopupElement.Header floating>
          <Show when={!options.noskip || page() === 1}>
            <PopupElement.CloseButton
                  canGoBack={page() !== 0}
              onBackClick={() => void setPage(0)}
            />
          </Show>
        </PopupElement.Header>
        <PopupElement.Body>
          <TransitionSliderTsx
            class={styles.slider}
            type="navigation"
            transitionTime={150}
            animateFirst={false}
            currentPage={page()}
            onTransitionStart={(id) => {
              setCodePageTransitionEnded(false);
              if(id === 0) {
                appNavigationController.removeItem(secondPageNavigationItem);
              } else {
                appNavigationController.pushItem(secondPageNavigationItem);
              }
            }}
            onTransitionEnd={(id) => {
              if(id === 1) {
                setCodePageTransitionEnded(true);
              }
            }}
          >
            <EnterEmailStep
              class={styles.page}
              isInitialSetup={true}
              purpose={options.purpose}
              onCodeSent={code => {
                setCode(code);
                setPage(1);
              }}
            />
            <Show when={code()}>
              <EnterCodeStep
                class={styles.page}
                purpose={options.purpose}
                sentCode={code()!}
                visible={page() === 1 && codePageTransitionEnded()}
                onExpired={() => {
                  setPage(0);
                  setCode(undefined);
                }}
                onSuccess={() => {
                  isSuccess = true
                  options.onSuccess?.();
                  setShow(false);
                }}
              />
            </Show>
          </TransitionSliderTsx>
        </PopupElement.Body>
      </PopupElement>
    );
  })
}
