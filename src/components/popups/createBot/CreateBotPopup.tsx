import styles from '@components/popups/createBot/createBot.module.scss';
import PopupElement from '@components/popups/indexTsx';
import SimpleFormField from '@components/simpleFormField';
import {createMutation} from '@helpers/solid/createMutation';
import {I18nTsx} from '@helpers/solid/i18n';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createMemo, createSignal, on, onCleanup, Show} from 'solid-js';


const USERNAME_SUFFIX = 'bot';
const USERNAME_PREFIX = '@';
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 29; // accounting for the trailing "bot" (32 total)
const MAX_BOT_NAME_LENGTH = 128;
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

type UsernameStatus =
  | {state: 'idle'}
  | {state: 'loading'}
  | {state: 'available'}
  | {state: 'error'}
  | {state: 'taken'}
  | {state: 'invalid'; reason: 'tooShort' | 'tooLong' | 'invalidChars' | 'mustStartLetter' | 'unknown'};

export type CreateBotPopupProps = {
  requestingPeerId: PeerId
  suggestedBotName?: string
  suggestedUsername?: string
  onCreate: (data: {name: string; username: string}) => MaybePromise<boolean>
}

const CreateBotPopup = (props: CreateBotPopupProps) => {
  const {PeerTitleTsx, AvatarNewTsx, rootScope} = useHotReloadGuard();

  const [show, setShow] = createSignal(true);
  const [botName, setBotName] = createSignal(props.suggestedBotName ?? '');
  const [usernameValue, setUsernameValue] = createSignal(props.suggestedUsername ?? '');
  const [usernameStatus, setUsernameStatus] = createSignal<UsernameStatus>({state: 'idle'});


  const trimmedName = createMemo(() => botName().trim());
  const nameError = createMemo(() => {
    const name = trimmedName();
    if(!name) return 'empty';
    if(name.length > MAX_BOT_NAME_LENGTH) return 'tooLong';
    return undefined;
  });

  const submitMutation = createMutation(async() => {
    if(!isValid()) return false;
    const ok = await props.onCreate({
      name: trimmedName(),
      username: fullUsername()
    });
    return ok;
  })

  function validateUsernameLocally(value: string): UsernameStatus | undefined {
    if(!value) return {state: 'idle'};
    if(!/^[a-zA-Z]/.test(value)) {
      return {state: 'invalid', reason: 'mustStartLetter'};
    }
    if(!USERNAME_REGEX.test(value)) {
      return {state: 'invalid', reason: 'invalidChars'};
    }
    if(value.length < MIN_USERNAME_LENGTH) {
      return {state: 'invalid', reason: 'tooShort'};
    }
    if(value.length > MAX_USERNAME_LENGTH) {
      return {state: 'invalid', reason: 'tooLong'};
    }
    return undefined;
  }

  // Constantly check username availability when it changes
  createEffect(on(usernameValue, (value) => {
    const localResult = validateUsernameLocally(value);
    if(localResult) {
      setUsernameStatus(localResult);
      return;
    }

    setUsernameStatus({state: 'loading'});

    let cancelled = false;

    const timeout = self.setTimeout(async() => {
      if(cancelled) return;

      const fullUsername = value + USERNAME_SUFFIX;

      const result = await rootScope.managers.appBotsManager.checkUsername(fullUsername);
      if(cancelled) return;

      if(usernameValue() !== value) return; // out-of-date result

      if(result === 'invalid') {
        setUsernameStatus({state: 'invalid', reason: 'unknown'});
      } else {
        setUsernameStatus({state: result});
      }
    }, 500);

    onCleanup(() => {
      cancelled = true;
      self.clearTimeout(timeout);
    });
  }));

  const fullUsername = createMemo(() => usernameValue() + USERNAME_SUFFIX);

  const isValid = createMemo(() => {
    return !nameError() && usernameStatus().state === 'available';
  });

  function handleUsernameChange(value: string) {
    // Sanitize: lowercase, strip non-allowed chars, prevent typing the suffix manually
    let cleaned = value.replace(/[^a-zA-Z0-9_]/g, '');
    if(cleaned.length > MAX_USERNAME_LENGTH) {
      cleaned = cleaned.slice(0, MAX_USERNAME_LENGTH);
    }
    setUsernameValue(cleaned);
  }

  const usernameStatusKey = createMemo((): LangPackKey => {
    const s = usernameStatus();
    switch(s.state) {
      case 'loading': return 'CreateBot.Username.Checking';
      case 'available': return 'CreateBot.Username.Available';
      case 'taken': return 'CreateBot.Username.Taken';
      case 'invalid':
        switch(s.reason) {
          case 'tooShort': return 'CreateBot.Username.TooShort';
          case 'tooLong': return 'CreateBot.Username.TooLong';
          case 'mustStartLetter': return 'CreateBot.Username.MustStartLetter';
          case 'invalidChars': return 'CreateBot.Username.InvalidChars';
          case 'unknown': return 'CreateBot.Username.Invalid';
        }
        break;
      case 'error': return 'CreateBot.Username.Error';
    }
    return undefined;
  });

  const usernameStatusClass = createMemo(() => {
    const s = usernameStatus();
    if(s.state === 'available') return styles.statusSuccess;
    if(s.state === 'taken' || s.state === 'invalid') return styles.statusError;
    if(s.state === 'loading') return styles.statusLoading;
    return undefined;
  });

  return (
    <PopupElement class={styles.popup} containerClass={styles.popupContainer} show={show()}>
      <PopupElement.Header class={styles.popupHeader}>
        <PopupElement.CloseButton class={styles.popupCloseButton} />
      </PopupElement.Header>
      <PopupElement.Body class={styles.popupBody}>
        <div class={styles.avatar}>
          <AvatarNewTsx peerId={props.requestingPeerId} size={120} />
        </div>

        <I18nTsx class={styles.title} key="CreateBot.Title" />

        <div class={styles.subtitle}>
          <I18nTsx
            key="CreateBot.Description"
            args={[<PeerTitleTsx peerId={props.requestingPeerId} />]}
          />
        </div>

        <div class={styles.fields}>
          <SimpleFormField
            class={styles.field}
            value={botName()}
            onChange={setBotName}
            isError={!!nameError() && botName().length > 0}
          >
            <SimpleFormField.Label>
              <I18nTsx key="CreateBot.Name.Label" />
            </SimpleFormField.Label>
            <SimpleFormField.Input
              forceFieldValue
              maxLength={MAX_BOT_NAME_LENGTH}
            />
          </SimpleFormField>

          <div>
            <SimpleFormField
              class={`${styles.field} ${styles.usernameField}`}
              value={usernameValue()}
              onChange={handleUsernameChange}
              isError={usernameStatus().state === 'taken' || usernameStatus().state === 'invalid'}
            >
              <SimpleFormField.SideContent first last class={styles.usernameFieldHiddenPrefix}>
                {USERNAME_PREFIX}
              </SimpleFormField.SideContent>
              <SimpleFormField.Label active>
                <I18nTsx key="CreateBot.Username.Label" />
              </SimpleFormField.Label>
              <SimpleFormField.Input
                forceFieldValue
                class={styles.usernameInput}
                autocapitalize="off"
                autocomplete="off"
                spellcheck={false}
              />
              <div class={styles.usernameOverlay}>
                <span class={styles.usernameOverlayPrefix}>{USERNAME_PREFIX}</span>
                <span class={styles.usernameOverlayValue}>{usernameValue()}</span>
                <span class={styles.usernameOverlaySuffix}>{USERNAME_SUFFIX}</span>
              </div>
            </SimpleFormField>

            <div class={styles.linkInfo}>
              <Show
                when={usernameStatus().state === 'available'}
                fallback={
                  <Show when={usernameStatusKey()}>
                    <span class={usernameStatusClass()}>
                      <I18nTsx key={usernameStatusKey()} />
                    </span>
                  </Show>
                }
              >
                <I18nTsx
                  key="CreateBot.Link"
                  args={[
                    <span class={styles.linkInfoLink}>
                      t.me/{fullUsername()}
                    </span>
                  ]}
                />
              </Show>
            </div>
          </div>
        </div>
      </PopupElement.Body>
      <PopupElement.Footer class={styles.popupFooter}>
        <PopupElement.FooterButton
          secondary
          langKey="Cancel"
          callback={() => {
            setShow(false);
            return true;
          }}
        />
        <PopupElement.FooterButton
          disabled={!isValid() || submitMutation.isPending()}
          langKey="CreateBot.Create"
          callback={() => submitMutation.mutateAsync()}
        />
      </PopupElement.Footer>
    </PopupElement>
  );
};

export default CreateBotPopup;
