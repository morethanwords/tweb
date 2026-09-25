import Button from '@components/buttonTsx';
import ripple from '@components/ripple';
import Section from '@components/section';
import {keepMe} from '@helpers/keepMe';
import {GrowHeightReveal} from '@helpers/solid/animations';
import {I18nTsx} from '@helpers/solid/i18n';
import type {TextWithEntities} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createSignal, Show} from 'solid-js';
import PopupElement, {createPopup} from '../indexTsx';
import {previewStyles} from '../previewCard';
import type {AiEditorPopupProps} from './aiEditorPopup';
import styles from './aiEditorPopup.module.scss';
import bodyStyles from './bodyContent.module.scss';
import {
  AiComposerPromptField,
  AiComposerSection,
  useAiComposerPromptGeneration,
  useAiComposerPromptInput,
  useAiComposerPromptMaxLength
} from './composerParts';
import {useAiEditorPopupContext} from '@components/popups/aiEditorPopup/context';
import AiEditorPopupProvider from '@components/popups/aiEditorPopup/provider';
import {Result} from './parts';

keepMe(ripple);

const EMPTY_TEXT: TextWithEntities.textWithEntities = {
  _: 'textWithEntities',
  text: '',
  entities: []
};

export type CreateWithAiPopupProps = Pick<AiEditorPopupProps, 'peerId' | 'onApply'> & {
  onApplyRichMessage: NonNullable<AiEditorPopupProps['onApplyRichMessage']>
};

export const CreateWithAiPopupBody = () => {
  const {I18n, pickLanguage} = useHotReloadGuard();
  const context = useAiEditorPopupContext();
  const {
    promptTextSignal: [promptText, setPromptText],
    resultTextSignal: [resultText],
    resultRichMessageSignal: [resultRichMessage]
  } = context;
  const [emojify, setEmojify] = createSignal(false);
  const [language, setLanguage] = createSignal<TranslatableLanguageISO>(
    I18n.langCodeNormalized() || 'en'
  );
  const [pending, setPending] = createSignal(false);

  const maxPromptLength = useAiComposerPromptMaxLength();
  const promptLength = () => [...promptText()].length;
  const canGenerate = () => (
    !!promptText().trim() &&
    promptLength() <= maxPromptLength() &&
    !pending()
  );
  const hasResult = () => !!(resultRichMessage() || resultText());
  const {
    appliedPrompt,
    generate,
    reset: resetAppliedPrompt
  } = useAiComposerPromptGeneration({
    canGenerate,
    prompt: promptText
  });

  const setPromptInputField = useAiComposerPromptInput({
    active: () => true,
    onSubmit: generate
  });

  const onPromptInput = (value: string) => {
    setPromptText(value);
    resetAppliedPrompt(value);
  };

  const onLanguageClick = async() => {
    try {
      setLanguage(await pickLanguage(false));
    } catch{}
  };

  const applyOrGenerate = () => {
    const richMessage = resultRichMessage();
    if(richMessage) {
      context.onApplyRichMessage?.(richMessage);
    } else if(resultText()) {
      context.onApply(resultText());
    } else {
      generate();
    }
  };

  return (
    <div class={bodyStyles.bodyContent}>
      <Section>
        <AiComposerPromptField
          instanceRef={setPromptInputField}
          label='AiEditor.Create.Placeholder'
          maxLength={maxPromptLength()}
          onRawInput={onPromptInput}
          value={promptText()}
        />
      </Section>
      <GrowHeightReveal when={appliedPrompt()}>
        <Section>
          <AiComposerSection class={bodyStyles.createResult}>
            <Show when={appliedPrompt()} keyed>
              {(prompt) => (
                <Result
                  overrideTitle={
                    <I18nTsx
                      class={previewStyles.resultTitle}
                      key='AiEditor.Create.InLanguage'
                      args={[
                        <span
                          class={previewStyles.resultLanguage}
                          use:ripple
                          onClick={onLanguageClick}
                        >
                          <I18nTsx key={`Language.${language()}`} />
                        </span>
                      ]}
                    />
                  }
                  emojify={emojify()}
                  onEmojify={() => setEmojify(!emojify())}
                  onPendingChange={setPending}
                  composeMessageWithAiArgs={{
                    text: EMPTY_TEXT,
                    createRichMessage: true,
                    customPrompt: prompt,
                    translateTo: language(),
                    emojify: emojify()
                  }}
                />
              )}
            </Show>
          </AiComposerSection>
        </Section>
      </GrowHeightReveal>
      <div class={bodyStyles.footerButtons}>
        <Button
          class={bodyStyles.applyButton}
          primaryFilled
          disabled={context.actionPending() || !hasResult() && !canGenerate()}
          onClick={applyOrGenerate}
        >
          <I18nTsx
            key={hasResult() ? 'AiEditor.Create.AddToMessage' : 'AiEditor.Generate'}
          />
        </Button>
      </div>
    </div>
  );
};

const CreateWithAiPopup = (props: CreateWithAiPopupProps) => {
  const contextProps: AiEditorPopupProps = {
    ...props,
    text: EMPTY_TEXT
  };
  return (
    <PopupElement
      class={styles.popup}
      containerClass={styles.container}
    >
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title>
          <I18nTsx key='AiEditor.Create.Title' />
        </PopupElement.Title>
      </PopupElement.Header>
      <PopupElement.Body>
        <AiEditorPopupProvider {...contextProps}>
          <CreateWithAiPopupBody />
        </AiEditorPopupProvider>
      </PopupElement.Body>
    </PopupElement>
  );
};

export function openCreateWithAiPopup(
  props: CreateWithAiPopupProps,
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider
) {
  createPopup(() => <HotReloadGuard><CreateWithAiPopup {...props} /></HotReloadGuard>);
}
