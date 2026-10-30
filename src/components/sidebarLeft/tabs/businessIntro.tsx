import {createMemo, createResource, createSignal, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import type InputField from '@components/inputField';
import {InputFieldTsx} from '@components/inputFieldTsx';
import Row from '@components/rowTsx';
import SaveButton from '@components/saveButton';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import {FakeBubbles} from '@components/chat/bubbles/fakeBubbles';
import {EMPTY_PLACEHOLDER_CLASS, wrapBusinessIntroLines} from '@components/chat/businessIntroPlaceholder';
import {StickerTsx} from '@components/wrappers/sticker';
import type {AppBusinessIntroTab} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import classNames from '@helpers/string/classNames';
import shake from '@helpers/dom/shake';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {BusinessIntro, UserFull} from '@layer';
import {i18n} from '@lib/langPack';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {useAppConfig} from '@stores/appState';
import type {MyDocument} from '@appManagers/appDocsManager';
import styles from '@components/sidebarLeft/tabs/businessIntro.module.scss';

type AppBusinessIntroTabType = typeof AppBusinessIntroTab;

export type BusinessIntroTabPayload = {
  userFull: MaybePromise<UserFull.userFull>
};

/** tdesktop's fallbacks for `intro_title_length_limit` and `intro_description_length_limit`. */
const DEFAULT_TITLE_LENGTH_LIMIT = 32;
const DEFAULT_DESCRIPTION_LENGTH_LIMIT = 70;
/** The size the greeting's sticker has in an empty chat (`.empty-bubble-placeholder-sticker`). */
const PREVIEW_STICKER_SIZE = 200;
const ROW_STICKER_SIZE = 24;

/** The way the field counts: an emoji is one character. */
const textLength = (text: string) => [...text].length;

const BusinessIntroTab = () => {
  const [tab] = useSuperTab<AppBusinessIntroTabType>();
  const promiseCollector = usePromiseCollector();

  const loadPromise = Promise.resolve(tab.payload.userFull).then((userFull) => ({
    intro: userFull?.business_intro as BusinessIntro.businessIntro
  }));
  promiseCollector.collect(loadPromise);

  const [data] = createResource(() => loadPromise);

  return (
    <Show when={data()}>
      <BusinessIntroForm intro={data().intro} />
    </Show>
  );
};

export default BusinessIntroTab;

/**
 * The start page as others will see it in an empty chat: the same greeting bubble, on the chat's
 * background, without the line that says who set it (tdesktop's preview leaves it out too).
 */
function BusinessIntroPreview(props: {
  title: string,
  description: string,
  sticker?: MyDocument
}) {
  const lines = createMemo(() => {
    const {title, subtitle} = wrapBusinessIntroLines({title: props.title, description: props.description});
    title.classList.add(EMPTY_PLACEHOLDER_CLASS + '-line');
    subtitle.classList.add(EMPTY_PLACEHOLDER_CLASS + '-line');
    return [title, subtitle];
  });

  return (
    // * the fields above say all of it to a screen reader
    <FakeBubbles class={styles.preview}>
      <div
        aria-hidden="true"
        class={classNames(
          'bubble service is-group-first is-group-last has-service-description',
          EMPTY_PLACEHOLDER_CLASS,
          EMPTY_PLACEHOLDER_CLASS + '-greeting',
          styles.bubble
        )}
      >
        <div class="bubble-content-wrapper">
          <div class="bubble-content">
            <div class="service-msg">
              {lines()}
              <Show when={props.sticker}>
                <StickerTsx
                  sticker={props.sticker}
                  width={PREVIEW_STICKER_SIZE}
                  height={PREVIEW_STICKER_SIZE}
                  class={EMPTY_PLACEHOLDER_CLASS + '-sticker'}
                  ref={(element) => element.classList.add(EMPTY_PLACEHOLDER_CLASS + '-line')}
                  extraOptions={{play: true, loop: true, withThumb: true, liteModeKey: 'stickers_chat'}}
                />
              </Show>
            </div>
          </div>
        </div>
      </div>
    </FakeBubbles>
  );
}

const BusinessIntroForm = (props: {
  intro: BusinessIntro.businessIntro
}) => {
  const [tab] = useSuperTab<AppBusinessIntroTabType>();
  const managers = tab.managers;
  const appConfig = useAppConfig();

  const titleMaxLength = appConfig.intro_title_length_limit || DEFAULT_TITLE_LENGTH_LIMIT;
  const descriptionMaxLength = appConfig.intro_description_length_limit || DEFAULT_DESCRIPTION_LENGTH_LIMIT;

  const savedTitle = props.intro?.title || '';
  const savedDescription = props.intro?.description || '';
  const savedSticker = props.intro?.sticker as MyDocument;

  const [title, setTitle] = createSignal(savedTitle);
  const [description, setDescription] = createSignal(savedDescription);
  const [sticker, setSticker] = createSignal<MyDocument>(savedSticker);
  const [saving, setSaving] = createSignal(false);
  // * what an intro with no sticker of its own shows: one of the greeting stickers, as tdesktop's "Random"
  const [randomSticker] = createResource(() => managers.appStickersManager.getGreetingSticker().catch((): MyDocument => undefined));

  let titleField: InputField, descriptionField: InputField;
  const isTitleTooLong = () => textLength(title()) > titleMaxLength;
  const isDescriptionTooLong = () => textLength(description()) > descriptionMaxLength;

  const isEmpty = () => !title().trim() && !description().trim() && !sticker();
  const isTooLong = () => isTitleTooLong() || isDescriptionTooLong();
  const hasChanges = createMemo(() => (
    title().trim() !== savedTitle ||
    description().trim() !== savedDescription ||
    sticker()?.id !== savedSticker?.id
  ));
  const canSave = createMemo(() => hasChanges() && !isTooLong());

  /**
   * Resolves to whether the intro was saved. The header button closes the tab once it is; the
   * "unsaved changes" popup does not, since the slider is closing the tab already.
   */
  const save = async(close: boolean) => {
    if(saving()) return false;
    // * only the "unsaved changes" popup gets here with a field over its limit: the field, red
    // * already, says why the tab stays open
    if(isTooLong()) {
      if(isTitleTooLong()) shake(titleField.container);
      if(isDescriptionTooLong()) shake(descriptionField.container);
      return false;
    }

    setSaving(true);

    try {
      await managers.appBusinessManager.updateBusinessIntro({
        title: title(),
        description: description(),
        stickerId: sticker()?.id
      });
      tab.isConfirmationNeededOnClose = undefined;
      if(close) tab.close();
      return true;
    } catch(err) {
      console.error('updateBusinessIntro error:', err);
      toastNew({langPackKey: 'Error.AnError'});
      return false;
    } finally {
      setSaving(false);
    }
  };

  // * tdesktop's "Reset to Default" empties the form; saving it then removes the intro
  const reset = () => {
    setTitle('');
    setDescription('');
    setSticker(undefined);
  };

  let stickerRow: HTMLElement;
  const openStickers = hotReloadGuard.useStickersDropdown({
    onStickerClick: async({docId}) => {
      const doc = await managers.appDocsManager.getDoc(docId);
      if(doc) setSticker(doc);
    }
  });

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({
    // * a draft over a limit is a draft too: leaving asks all the same
    hasChanges,
    // a failed save keeps the tab open, changes and all
    saveAllSettings: async() => {
      if(!await save(false)) throw new Error('BUSINESS_INTRO_NOT_SAVED');
    },
    descriptionLangKey: 'BusinessIntroUnsavedChanges',
    waitForSave: true
  });

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={canSave() && !saving()} onClick={() => save(true)} />
      </Portal>

      <BusinessIntroPreview
        title={title().trim()}
        description={description().trim()}
        sticker={sticker() || randomSticker()}
      />

      <Section caption="BusinessIntroInfo">
        <div class="input-wrapper">
          <InputFieldTsx
            label="BusinessIntroTitleHint"
            name="business-intro-title"
            maxLength={titleMaxLength}
            value={title()}
            onRawInput={setTitle}
            instanceRef={(ref) => titleField = ref}
          />
          {/* * several lines, as Android's editor takes them and the greeting shows them */}
          <InputFieldTsx
            label="BusinessIntroMessageHint"
            name="business-intro-message"
            maxLength={descriptionMaxLength}
            withLinebreaks
            value={description()}
            onRawInput={setDescription}
            instanceRef={(ref) => descriptionField = ref}
          />
        </div>
        <Row
          ref={(element) => {
            stickerRow = element;
            element.setAttribute('aria-haspopup', 'dialog');
          }}
          clickable={() => openStickers(stickerRow)}
        >
          <Row.Icon icon="stickers" />
          <Row.Title
            titleRight={sticker() ? (
              <StickerTsx
                sticker={sticker()}
                width={ROW_STICKER_SIZE}
                height={ROW_STICKER_SIZE}
                autoStyle
                extraOptions={{play: false}}
              />
            ) : (
              <span class="primary">{i18n('BusinessIntroStickerRandom')}</span>
            )}
          >
            {i18n('BusinessIntroSticker')}
          </Row.Title>
        </Row>
      </Section>

      <Show when={!isEmpty()}>
        <Section>
          <Row color="danger" clickable={reset}>
            <Row.Icon icon="delete" />
            <Row.Title class="danger">{i18n('BusinessIntroReset')}</Row.Title>
          </Row>
        </Section>
      </Show>
    </>
  );
};
