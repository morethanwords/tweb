import {useContext} from 'solid-js';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext} from './context';
import {Divider, Original, Result} from './parts';


export const FixTab = (props: {isAppearing: boolean}) => {
  const {text: originalText} = useContext(AiEditorPopupContext);

  return (
    <div class={styles.tabContent}>
      <Original text={originalText} />
      <Divider />
      <Result isAppearing={props.isAppearing} />
    </div>
  );
};
