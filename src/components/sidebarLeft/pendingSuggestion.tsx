import {i18n} from '@lib/langPack';
import {useAppState} from '@stores/appState';
import Row from '@components/rowTsx';
import styles from '@components/sidebarLeft/pendingSuggestion.module.scss';
import {render} from 'solid-js/web';
import {createEffect, createMemo, createSignal, JSX, onMount, Show, splitProps} from 'solid-js';
import classNames from '@helpers/string/classNames';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {useIsSidebarCollapsed} from '@stores/foldersSidebar';
import RippleElement from '@components/rippleElement';
import documentFragmentToNodes from '@helpers/dom/documentFragmentToNodes';
import showFrozenPopup from '@components/popups/frozen';
import {useAppSettings} from '@stores/appSettings';
import Button from '@components/buttonTsx';
import {toastNew} from '@components/toast';
import Animated from '@helpers/solid/animations';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import cancelEvent from '@helpers/dom/cancelEvent';
import {usePendingSuggestions} from '@stores/promo';
import showBirthdayPopup, {saveMyBirthday} from '@components/popups/birthday';
import {showEmailSetupPopup} from '@components/popups/emailSetup';
import rootScope from '@lib/rootScope';
import showPasskeyPopup from '@components/popups/passkey';
import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';

const BIRTHDAY_SETUP_SUGGESTION_KEY = 'BIRTHDAY_SETUP';
const EMAIL_SETUP_KEY = 'SETUP_LOGIN_EMAIL';
const EMAIL_SETUP_KEY_NOSKIP = 'SETUP_LOGIN_EMAIL_NOSKIP';
const PASSKEY_SETUP_KEY = 'SETUP_PASSKEY';

const PendingSuggestion = (props: Parameters<typeof Row>[0] & {closable?: () => void}) => {
  // const [, rest] = splitProps(props, ['closable']);
  return (
    <Row
      {...props}
      class={classNames(styles.suggestion, props.class)}
    >
      {props.children}
      {props.closable && (
        <Button.Icon
          icon="close"
          class={styles.close}
          onClick={(e) => {
            cancelEvent(e);
            props.closable();
          }}
        />
      )}
    </Row>
  );
};

PendingSuggestion.Title = (props: Parameters<typeof Row.Title>[0]) => {
  return (
    <Row.Title {...props}>
      <span class={classNames('text-bold', styles.suggestionTitle)}>{props.children}</span>
    </Row.Title>
  );
};

PendingSuggestion.Subtitle = (props: Parameters<typeof Row.Subtitle>[0]) => {
  return (
    <Row.Subtitle {...props}>
      <span class={styles.suggestionSubtitle}>{props.children}</span>
    </Row.Subtitle>
  );
};

function SimpleSuggestion(props: {
  emoji: string | (() => DocumentFragment),
  title: JSX.Element,
  subtitle: JSX.Element,
  danger?: boolean,
  onClick: () => void,
  onClose?: () => void
}) {
  const [isSidebarCollapsed] = useIsSidebarCollapsed();
  const emoji = typeof(props.emoji) === 'string' ? () => wrapEmojiText(props.emoji as string) : props.emoji;

  return (
    <Show
      when={isSidebarCollapsed()}
      fallback={
        <PendingSuggestion
          class={props.danger ? styles.danger : styles.secondary}
          clickable={props.onClick}
          closable={props.onClose}
          color={props.danger ? 'danger' : undefined}
        >
          <PendingSuggestion.Title>{props.title}</PendingSuggestion.Title>
          <PendingSuggestion.Subtitle>{props.subtitle}</PendingSuggestion.Subtitle>
        </PendingSuggestion>
      }
    >
      <RippleElement
        component="div"
        class={classNames(styles.collapsed, props.danger ? 'hover-danger-effect' : 'hover-effect')}
        onClick={props.onClick}
      >
        {documentFragmentToNodes(emoji())}
      </RippleElement>
    </Show>
  );
}

function FrozenSuggestion() {
  const emoji = () => wrapEmojiText('🚫');
  const onClick = () => showFrozenPopup();
  return (
    <SimpleSuggestion
      emoji={emoji}
      title={i18n('Suggestion.Frozen.Title', [emoji()])}
      subtitle={i18n('Suggestion.Frozen.Subtitle')}
      onClick={onClick}
    />
  );
}

function NotificationsSuggestion() {
  const [appSettings, setAppSettings] = useAppSettings();
  const emoji = () => wrapEmojiText('🔔');

  const onDismissed = () => {
    setAppSettings('notifications', 'suggested', true);
    toastNew({langPackKey: 'Suggestion.Notifications.Dismissed'});

    // setTimeout(() => {
    //   setAppSettings('notifications', 'suggested', false);
    // }, 2e3);
  };

  const onClick = () => {
    Notification.requestPermission().then((permission) => {
      if(permission === 'granted') {
        setAppSettings('notifications', 'suggested', true);
        uiNotificationsManager.onPushConditionsChange();
      } else if(permission === 'denied') {
        throw 1;
      }
    }).catch(onDismissed);
  };

  return (
    <SimpleSuggestion
      emoji={emoji}
      title={i18n('Suggestion.Notifications', [emoji()])}
      subtitle={i18n('Suggestion.Notifications.Subtitle')}
      onClick={onClick}
      onClose={onDismissed}
    />
  );
}

function BirthdaySetupSuggestion() {
  const emoji = () => wrapEmojiText('🎂');

  const onDismissed = () => {
    rootScope.managers.appPromoManager.dismissSuggestion(BIRTHDAY_SETUP_SUGGESTION_KEY);
  };

  const onClick = () => {
    showBirthdayPopup({
      onSave: async(date) => {
        if(await saveMyBirthday(date)) {
          rootScope.managers.appPromoManager.dismissSuggestion(BIRTHDAY_SETUP_SUGGESTION_KEY);
          return;
        }
        return false;
      }
    });
  };

  return (
    <SimpleSuggestion
      emoji={emoji}
      title={i18n('Suggestion.BirthdaySetup', [emoji()])}
      subtitle={i18n('Suggestion.BirthdaySetup.Subtitle')}
      onClick={onClick}
      onClose={onDismissed}
    />
  );
}

function PasskeySetupSuggestion() {
  const emoji = () => wrapEmojiText('🔑');

  const onDismissed = () => {
    rootScope.managers.appPromoManager.dismissSuggestion(PASSKEY_SETUP_KEY);
  };

  const onClick = () => {
    showPasskeyPopup(() => {
      rootScope.managers.appPromoManager.dismissSuggestion(PASSKEY_SETUP_KEY);
    });
  };

  return (
    <SimpleSuggestion
      emoji={emoji}
      title={i18n('Suggestion.PasskeySetup', [emoji()])}
      subtitle={i18n('Suggestion.PasskeySetup.Subtitle')}
      onClick={onClick}
      onClose={onDismissed}
    />
  );
}

export function renderPendingSuggestion(toElement: HTMLElement) {
  toElement.classList.add(styles.container);

  render(() => {
    const [{appConfig}] = useAppState();
    const [appSettings, setAppSettings] = useAppSettings();
    const [element, setElement] = createSignal<JSX.Element>();
    const pendingSuggestions = usePendingSuggestions();

    // * test
    // onMount(() => {
    //   if(appSettings.notifications.suggested) {
    //     setAppSettings('notifications', 'suggested', false);
    //   }
    // });

    createEffect(() => {
      const pendingSuggestions$ = pendingSuggestions();
      if(pendingSuggestions$.has(EMAIL_SETUP_KEY) || pendingSuggestions$.has(EMAIL_SETUP_KEY_NOSKIP)) {
        Promise.all([
          rootScope.managers.appPromoManager.getPromoData(true),
          rootScope.managers.passwordManager.getState()
        ]).then(([data, passwordState]) => {
          if(passwordState.login_email_pattern && !passwordState.email_unconfirmed_pattern) {
            return;
          }

          const noskip = data.pendingSuggestions.includes(EMAIL_SETUP_KEY_NOSKIP);
          if(data.pendingSuggestions.includes(EMAIL_SETUP_KEY) || noskip) {
            showEmailSetupPopup({
              noskip,
              purpose: {_: 'emailVerifyPurposeLoginChange'},
              onDismiss: () => {
                if(!noskip) {
                  rootScope.managers.appPromoManager.dismissSuggestion(EMAIL_SETUP_KEY);
                }
              },
              onSuccess: () => {
                toastNew({langPackKey: 'EmailSetup.SetupToast'});
              }
            });
          }
        });
      }
    });

    const suggestionConstructor = createMemo(() => {
      if(appConfig.freeze_since_date) {
        return FrozenSuggestion;
      } else if(IS_WEB_AUTHN_SUPPORTED && pendingSuggestions().has(PASSKEY_SETUP_KEY)) {
        return PasskeySetupSuggestion;
      } else if(pendingSuggestions().has(BIRTHDAY_SETUP_SUGGESTION_KEY)) {
        return BirthdaySetupSuggestion;
      } else if(
        !appSettings.notifications.suggested &&
        Notification.permission !== 'granted'
      ) {
        return NotificationsSuggestion;
      }
    });

    createEffect(() => {
      const constructor = suggestionConstructor();
      const element = constructor ? (<div class={styles.suggestionContainer}>{constructor()}</div>) : undefined;
      setElement(element);
    });

    createEffect(() => {
      document.body.classList.toggle('has-pending-suggestion', !!element());
      // toElement.classList.toggle(styles.shown, !!element());
    });

    return (
      <Animated
        type="grow-height"
        appear
        mode="add-remove"
        noItemClass
      >
        {element()}
      </Animated>
    );
  }, toElement);
}
