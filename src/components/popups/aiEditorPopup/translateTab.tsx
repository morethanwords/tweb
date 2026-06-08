import ripple from '@components/ripple';
import {keepMe} from '@helpers/keepMe';
import {I18nTsx} from '@helpers/solid/i18n';
import {createSignal, useContext} from 'solid-js';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext} from './context';
import {Divider, Original, Result} from './parts';


keepMe(ripple);

export const TranslateTab = (props: {
  isAppearing: boolean;
}) => {
  const [emojify, setEmojify] = createSignal(false);

  const {text: originalText} = useContext(AiEditorPopupContext);

  return (
    <div class={styles.tabContent}>
      <Original text={originalText} />
      <Divider />
      <Result
        isAppearing={props.isAppearing}
        overrideTitle={
          <I18nTsx
            class={styles.resultTitle}
            key='AiEditor.TranslateTo'
            args={[<span class={styles.resultLanguage} use:ripple>Spanish</span>]}
          />
        }
        emojify={emojify()}
        onEmojify={() => setEmojify(!emojify())}
      />
    </div>
  );
};
