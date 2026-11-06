import {AutoHeight} from '@components/autoHeight';
import ripple from '@components/ripple';
import {keepMe} from '@helpers/keepMe';
import {I18nTsx} from '@helpers/solid/i18n';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createSignal} from 'solid-js';
import styles from './bodyContent.module.scss';
import {takeSavedSendStyle, useAiEditorPopupContext, useAiEditorRequest} from './context';
import {Divider, Original, Result, useTransitionGroupWhenMeasured} from './parts';
import {previewStyles} from '@components/popups/previewCard';


keepMe(ripple);

export const TranslateTab = (props: {
  isAppearing: boolean;
}) => {
  const {usePeerTranslation, pickLanguage} = useHotReloadGuard();
  const context = useAiEditorPopupContext();
  const {peerId, text: originalText} = context;

  const peerTranslation = usePeerTranslation(peerId);

  const savedTranslation = takeSavedSendStyle(context, (style) => !!style.translateTo);
  const [emojify, setEmojify] = createSignal(!!savedTranslation?.emojify);
  const [language, setLanguage] = createSignal<TranslatableLanguageISO>(
    (savedTranslation?.translateTo as TranslatableLanguageISO) || peerTranslation.language()
  );

  const {Wrapper, onMeasured} = useTransitionGroupWhenMeasured();

  const request = () => ({text: originalText, translateTo: language(), emojify: emojify()});
  useAiEditorRequest(context, request);

  const onLanguageClick = async() => {
    const lang = await pickLanguage(false);
    setLanguage(lang);
    peerTranslation.setLanguage(lang);
  };

  return (
    <AutoHeight outerClass={styles.tabContent}>
      <Wrapper>
        <Original isAppearing={props.isAppearing} text={originalText} onMeasured={onMeasured} />
        <Divider />
        <Result
          isAppearing={props.isAppearing}
          overrideTitle={
            <I18nTsx
              class={previewStyles.resultTitle}
              key='AiEditor.TranslateTo'
              args={[
                <span class={previewStyles.resultLanguage} use:ripple onClick={onLanguageClick}>
                  <I18nTsx key={`Language.${language()}`} />
                </span>
              ]}
            />
          }
          emojify={emojify()}
          onEmojify={() => setEmojify(!emojify())}
          composeMessageWithAiArgs={request()}
        />
      </Wrapper>
    </AutoHeight>
  );
};
