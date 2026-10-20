import Button from '@components/buttonTsx';
import CrossfadeBlock from '@components/crossfadeBlock';
import MediaHeader from '@components/mediaHeader';
import PopupElementTsx, {createPopup as createPopupTsx} from '@components/popups/indexTsx';
import RippleElement from '@components/rippleElement';
import anchorCallback from '@helpers/dom/anchorCallback';
import classNames from '@helpers/string/classNames';
import documentFragmentToNodes from '@helpers/dom/documentFragmentToNodes';
import getAuthorizationErrorLangKey from '@helpers/getAuthorizationErrorLangKey';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {I18n, i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {hideToast, toast, toastNew} from '@components/toast';
import {useIsSidebarCollapsed} from '@stores/foldersSidebar';
import useUnconfirmedAuthorizations from '@stores/unconfirmedAuthorizations';
import type {UnconfirmedAuthorization} from '@appManagers/appAccountManager';
import {createEffect, createMemo, createSignal, onCleanup, Show} from 'solid-js';
import {render} from 'solid-js/web';
import styles from '@components/sidebarLeft/newAuthorization.module.scss';
import collapsedPanelStyles from '@components/sidebarLeft/collapsedPanelButton.module.scss';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export function formatAuthorizationOrigin(authorization: UnconfirmedAuthorization) {
  return [authorization.device, authorization.location].filter(Boolean).join(', ');
}

function makeTitle(total: number) {
  const title = document.createDocumentFragment();
  if(total > 1) {
    title.append(`1/${total} `);
  }
  title.append(i18n('UnconfirmedAuthTitle'));
  return title;
}

function getAuthorizationAccessibleLabel(authorization: UnconfirmedAuthorization, total: number) {
  const position = total > 1 ? `1/${total}. ` : '';
  return position + I18n.format('UnconfirmedAuthTitle', true) + ' ' +
    I18n.format('UnconfirmedAuthSingle', true, [formatAuthorizationOrigin(authorization)]);
}

function AuthorizationPreventedPopup(props: {authorization: UnconfirmedAuthorization}) {
  const [show, setShow] = createSignal(false);
  const [remaining, setRemaining] = createSignal(5);
  let interval: number;
  let countdownStarted = false;

  const startCountdown = () => {
    if(countdownStarted) return;
    countdownStarted = true;
    window.clearTimeout(readyFallback);
    setShow(true);
    interval = window.setInterval(() => {
      setRemaining((value) => {
        if(value <= 1) {
          window.clearInterval(interval);
          return 0;
        }

        return value - 1;
      });
    }, 1000);
  };

  const readyFallback = window.setTimeout(startCountdown, 1000);
  onCleanup(() => {
    window.clearTimeout(readyFallback);
    window.clearInterval(interval);
  });

  return (
    <PopupElementTsx
      class={styles.popup}
      closable={false}
      show={show()}
      animationGroup="none"
      isConfirmationNeededOnClose={() => {
        if(remaining()) return Promise.reject();
      }}
    >
      <PopupElementTsx.Body class={styles.popupBody}>
        <MediaHeader>
          <MediaHeader.Sticker
            class={styles.popupSticker}
            name="hand_stop"
            size={80}
            onReady={startCountdown}
          />
          <MediaHeader.Title>
            {i18n('UnconfirmedAuthDeniedTitle', [1])}
          </MediaHeader.Title>
          <MediaHeader.Subtitle>
            {i18n('UnconfirmedAuthDeniedMessageSingle', [formatAuthorizationOrigin(props.authorization)])}
          </MediaHeader.Subtitle>
        </MediaHeader>
        <div class={classNames('popup-description-framed', styles.warning)}>
          {i18n('UnconfirmedAuthDeniedWarning')}
        </div>
      </PopupElementTsx.Body>
      <PopupElementTsx.Footer>
        <PopupElementTsx.FooterButton
          confirm
          disabled={!!remaining()}
        >
          {i18n('UnconfirmedAuthDeniedButton')}
          {remaining() ? ` (${remaining()})` : undefined}
        </PopupElementTsx.FooterButton>
      </PopupElementTsx.Footer>
    </PopupElementTsx>
  );
}

function showAuthorizationPrevented(authorization: UnconfirmedAuthorization) {
  createPopupTsx(() => <AuthorizationPreventedPopup authorization={authorization} />);
}

async function openActiveSessions() {
  const authorizations = await rootScope.managers.appAccountManager.getAuthorizations();
  hotReloadGuard.appSidebarLeft.createTab(hotReloadGuard.tabs.AppActiveSessionsTab).open({
    authorizations: authorizations.authorizations
  });
}

function showAuthorizationConfirmed() {
  const devicesLink = anchorCallback(() => {
    hideToast();
    openActiveSessions().catch(() => toastNew({langPackKey: 'Error.AnError'}));
  });
  devicesLink.append(i18n('Settings'), ' > ', i18n('Devices'));

  const content = document.createDocumentFragment();
  const title = document.createElement('strong');
  title.append(i18n('UnconfirmedAuthConfirmed'));
  content.append(
    title,
    document.createElement('br'),
    i18n('UnconfirmedAuthConfirmedMessage', [devicesLink])
  );
  toast(content, undefined, 5000);
}

export function NewAuthorization(props: {
  authorization: UnconfirmedAuthorization,
  total: number
}) {
  const [isSidebarCollapsed] = useIsSidebarCollapsed();
  const [processing, setProcessing] = createSignal(false);

  const performAction = async(action: 'confirm' | 'deny') => {
    const managers = bindManagersToSession(rootScope.managers);
    if(processing()) return false;

    const authorization = props.authorization;
    setProcessing(true);
    try {
      const result = action === 'confirm' ?
        await managers.appAccountManager.confirmUnconfirmedAuthorization(authorization.hash) :
        await managers.appAccountManager.resetAuthorization(authorization.hash);

      if(!result) {
        throw new Error('Authorization action failed');
      }

      if(action === 'confirm') {
        showAuthorizationConfirmed();
      } else {
        setTimeout(() => showAuthorizationPrevented(authorization), 0);
      }

      return true;
    } catch(err) {
      toastNew({langPackKey: getAuthorizationErrorLangKey(err as ApiError)});
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const showActionsPopup = () => {
    createPopupTsx(() => (
      <PopupElementTsx closable show>
        <PopupElementTsx.Header>
          <PopupElementTsx.Title>{makeTitle(props.total)}</PopupElementTsx.Title>
        </PopupElementTsx.Header>
        <PopupElementTsx.Body>
          <div class="popup-description">
            {i18n('UnconfirmedAuthSingle', [formatAuthorizationOrigin(props.authorization)])}
          </div>
        </PopupElementTsx.Body>
        <PopupElementTsx.Buttons>
          <PopupElementTsx.Button
            confirm
            langKey="UnconfirmedAuthConfirm"
            callback={() => performAction('confirm')}
          />
          <PopupElementTsx.Button
            danger
            langKey="UnconfirmedAuthDeny"
            callback={() => performAction('deny')}
          />
        </PopupElementTsx.Buttons>
      </PopupElementTsx>
    ));
  };

  return (
    <Show
      when={isSidebarCollapsed()}
      fallback={
        <div
          class={styles.notice}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <div class={styles.title}>
            {props.total > 1 && `1/${props.total} `}
            {i18n('UnconfirmedAuthTitle')}
          </div>
          <div class={styles.subtitle}>
            {i18n('UnconfirmedAuthSingle', [formatAuthorizationOrigin(props.authorization)])}
          </div>
          <div class={styles.actions}>
            <Button
              class={classNames(styles.action, 'rp-overflow', 'hover-primary-effect')}
              disabled={processing()}
              onClick={() => performAction('confirm')}
              text="UnconfirmedAuthConfirm"
            />
            <Button
              class={classNames(styles.action, styles.deny, 'rp-overflow', 'hover-danger-effect')}
              disabled={processing()}
              onClick={() => performAction('deny')}
              text="UnconfirmedAuthDeny"
            />
          </div>
        </div>
      }
    >
      <RippleElement
        component="button"
        type="button"
        class={classNames(collapsedPanelStyles.button, 'hover-effect')}
        onClick={showActionsPopup}
        aria-label={getAuthorizationAccessibleLabel(props.authorization, props.total)}
      >
        {documentFragmentToNodes(wrapEmojiText('🔐'))}
      </RippleElement>
    </Show>
  );
}

export function renderNewAuthorization(toElement: HTMLElement) {
  toElement.classList.add(styles.container);

  render(() => {
    const authorizations = useUnconfirmedAuthorizations();
    // * the next one crossfades in when the first is answered, the count changes in place
    const authorization = createMemo(() => authorizations()[0], undefined, {
      equals: (previous, next) => previous?.hash === next?.hash
    });

    createEffect(() => {
      document.body.classList.toggle('has-unconfirmed-authorization', !!authorization());
    });

    onCleanup(() => {
      document.body.classList.remove('has-unconfirmed-authorization');
    });

    return (
      <CrossfadeBlock value={authorization()} class={styles.noticeContainer}>
        {(authorization) => (
          <NewAuthorization
            authorization={authorization}
            total={authorizations().length}
          />
        )}
      </CrossfadeBlock>
    );
  }, toElement);
}
