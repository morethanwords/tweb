/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, JSX, onMount} from 'solid-js';

import Button from '@components/buttonTsx';
import Icon from '@components/icon';
import InputField from '@components/inputField';
import PopupElement from '@components/popups';
import PopupAvatar from '@components/popups/avatar';
import MediaHeader from '@components/mediaHeader';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import type {CancellablePromise} from '@helpers/cancellablePromise';
import type {InputFile} from '@layer';
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

  const avatarPreview = document.createElement('canvas');
  avatarPreview.id = 'canvas-avatar';
  avatarPreview.className = 'avatar-edit-canvas';

  const addIco = Icon('cameraadd', 'avatar-edit-icon');

  const avatarContainer = document.createElement('div');
  avatarContainer.classList.add('avatar-edit');
  avatarContainer.append(avatarPreview, addIco);
  avatarContainer.addEventListener('click', () => {
    PopupElement.createPopup(PopupAvatar).open(avatarPreview, (_uploadAvatar) => {
      uploadAvatar = _uploadAvatar;
    });
  });

  let uploadAvatar: (() => CancellablePromise<InputFile>) | undefined;

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

  function sendAvatar() {
    return new Promise<void>((resolve, reject) => {
      if(!uploadAvatar) return resolve();

      uploadAvatar().then((inputFile) => {
        managers.appProfileManager.uploadProfilePhoto(inputFile).then(resolve, reject);
      }, reject);
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
          <MediaHeader.Sticker element={avatarContainer} size={120}/>
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
