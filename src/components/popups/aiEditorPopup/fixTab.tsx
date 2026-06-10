import {AutoHeight} from '@components/autoHeight';
import {useContext} from 'solid-js';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext} from './context';
import {Divider, Original, Result, useTransitionGroupWhenMeasured} from './parts';


export const FixTab = (props: {isAppearing: boolean}) => {
  const {text: originalText} = useContext(AiEditorPopupContext);

  const {Wrapper, onMeasured} = useTransitionGroupWhenMeasured();


  return (
    <AutoHeight outerClass={styles.tabContent}>
      <Wrapper>
        <Original isAppearing={props.isAppearing} text={originalText} onMeasured={onMeasured} />
        <Divider />
        <Result
          isAppearing={props.isAppearing}
          composeMessageWithAiArgs={{text: originalText, proofRead: true}}
        />
      </Wrapper>
    </AutoHeight>
  );
};
