import {AutoHeight} from '@components/autoHeight';
import ripple from '@components/ripple';
import {keepMe} from '@helpers/keepMe';
import {I18nTsx} from '@helpers/solid/i18n';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createSignal, useContext} from 'solid-js';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext, useAiEditorPopupContext} from './context';
import {Divider, Original, Result, useTransitionGroupWhenMeasured} from './parts';


keepMe(ripple);

export const TranslateTab = (props: {
  isAppearing: boolean;
}) => {
  const {usePeerTranslation, pickLanguage} = useHotReloadGuard();
  const context = useAiEditorPopupContext();

  const peerTranslation = usePeerTranslation(context.peerId);

  const [emojify, setEmojify] = createSignal(false);
  const [language, setLanguage] = createSignal<TranslatableLanguageISO>(peerTranslation.language());

  const {text: originalText} = useContext(AiEditorPopupContext);

  const {Wrapper, onMeasured} = useTransitionGroupWhenMeasured();

  const onLanguageClick = async() => {
    const lang = await pickLanguage(false);
    setLanguage(lang);
    peerTranslation.setLanguage(lang);
  };

  return (
    <AutoHeight outerClass={styles.tabContent}>
      <Wrapper>
        <Original text={originalText} onMeasured={onMeasured} />
        <Divider />
        <Result
          isAppearing={props.isAppearing}
          overrideTitle={
            <I18nTsx
              class={styles.resultTitle}
              key='AiEditor.TranslateTo'
              args={[
                <span class={styles.resultLanguage} use:ripple onClick={onLanguageClick}>
                  <I18nTsx key={`Language.${language()}`} />
                </span>
              ]}
            />
          }
          emojify={emojify()}
          onEmojify={() => setEmojify(!emojify())}
          composeMessageWithAiArgs={{
            text: originalText,
            translateTo: language(),
            emojify: emojify()
          }}
        />
      </Wrapper>
    </AutoHeight>
  );
};
