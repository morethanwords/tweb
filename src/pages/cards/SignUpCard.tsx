import {createSignal, JSX, onMount} from 'solid-js';

import AvatarEdit, {AvatarEditPayload} from '@components/avatarEdit';
import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import MediaHeader from '@components/mediaHeader';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import {LangPackKey, i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Spec = Extract<CardSpec, {name: 'signUp'}>;

/**
 * Card variant of `pageSignUp`. Avatar uploader (canvas + camera-add icon)
 * and two name inputs. The card title doubles as a live preview of the
 * entered full name.
 */
export default function SignUpCard(props: {spec: Spec}) {
  const {managers, toIm} = useAuthFlow();

  /* ---------- state ---------- */

  const [submitting, setSubmitting] = createSignal(false);
  const [signUpKey, setSignUpKey] = createSignal<LangPackKey>('StartMessaging');

  /* ---------- avatar (sticker slot) ---------- */

  let uploadAvatar: AvatarEditPayload | undefined;

  // the same picker + media editor every other avatar in the app goes through; the payload is
  // a pair of thunks, so nothing is uploaded until the account exists
  const avatarEdit = new AvatarEdit((payload) => {
    uploadAvatar = payload;
  });

  /* ---------- inputs ---------- */

  const nameInputField = new InputField({
    label: 'FirstName',
    maxLength: 70
  });

  const lastNameInputField = new InputField({
    label: 'LastName',
    maxLength: 64
  });

  /* ---------- live full-name preview (drives MediaHeader.Title) ---------- */

  const [titleContent, setTitleContent] = createSignal<JSX.Element>(i18n('YourName'));

  function handleNameInput() {
    const name = nameInputField.value || '';
    const lastName = lastNameInputField.value || '';

    const fullName = (name || lastName) ? (name + ' ' + lastName).trim() : '';

    setTitleContent(fullName ? wrapEmojiText(fullName) : i18n('YourName'));
  }

  nameInputField.input.addEventListener('input', handleNameInput);
  lastNameInputField.input.addEventListener('input', handleNameInput);

  /* ---------- submit ---------- */

  async function sendAvatar() {
    if(!uploadAvatar) return;

    const [file, video] = await Promise.all([uploadAvatar.file(), uploadAvatar.video?.()]);
    await managers.appProfileManager.uploadProfilePhoto({
      file,
      video,
      videoStartTs: uploadAvatar.videoStartTs
    });
  }

  function onSubmit() {
    if(nameInputField.input.classList.contains('error') || lastNameInputField.input.classList.contains('error')) {
      return;
    }

    if(!nameInputField.value.length) {
      nameInputField.input.classList.add('error');
      return;
    }

    setSubmitting(true);

    const name = nameInputField.value.trim();
    const lastName = lastNameInputField.value.trim();

    const params = {
      phone_number: props.spec.payload.phone_number,
      phone_code_hash: props.spec.payload.phone_code_hash,
      first_name: name,
      last_name: lastName
    };

    setSignUpKey('PleaseWait');

    managers.apiManager.invokeApi('auth.signUp', params).then(async(response) => {
      switch(response._) {
        case 'auth.authorization':
          await managers.apiManager.setUser(response.user);
          sendAvatar().finally(() => {
            toIm();
          });
          break;
        default:
          setSignUpKey(response._ as LangPackKey);
          setSubmitting(false);
          break;
      }
    }).catch((err) => {
      setSubmitting(false);

      switch(err.type) {
        default:
          setSignUpKey(err.type);
          break;
      }
    });
  }

  /* ---------- lifecycle ---------- */

  onMount(() => {
    managers.appStateManager.pushToState('authState', {
      _: 'authStateSignUp',
      authCode: props.spec.payload
    });

    blurActiveElement();
  });

  return (
    <AuthCard
      class={styles.pageSignUp}
      header={
        <MediaHeader>
          <MediaHeader.Sticker element={avatarEdit.container} size={120}/>
          <MediaHeader.Title>{titleContent()}</MediaHeader.Title>
          <MediaHeader.Subtitle>{i18n('Login.Register.Subtitle')}</MediaHeader.Subtitle>
        </MediaHeader>
      }
    >
      {nameInputField.container}
      {lastNameInputField.container}
      <Button
        class="btn-primary btn-color-primary"
        disabled={submitting()}
        onClick={onSubmit}
      >
        {i18n(signUpKey())}
        {submitting() && (
          <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
            <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
          </svg>
        )}
      </Button>
    </AuthCard>
  );
}
