import {AutoHeight} from '@components/autoHeight';
import {useContext} from 'solid-js';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext, useAiEditorRequest} from './context';
import {Divider, Original, Result, useTransitionGroupWhenMeasured} from './parts';


export const FixTab = (props: {isAppearing: boolean}) => {
  const context = useContext(AiEditorPopupContext);
  const {text: originalText} = context;

  const {Wrapper, onMeasured} = useTransitionGroupWhenMeasured();

  const request = {text: originalText, proofRead: true};
  useAiEditorRequest(context, () => request);

  return (
    <AutoHeight outerClass={styles.tabContent}>
      <Wrapper>
        <Original isAppearing={props.isAppearing} text={originalText} onMeasured={onMeasured} />
        <Divider />
        <Result
          useDiffText
          isAppearing={props.isAppearing}
          composeMessageWithAiArgs={request}
        />
      </Wrapper>
    </AutoHeight>
  );
};
