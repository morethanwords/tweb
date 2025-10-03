import {createSignal} from 'solid-js';
import {I18nTsx} from '../../../../helpers/solid/i18n';
import rootScope from '../../../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../../../lib/solidjs/defineSolidElement';
import {InputFieldTsx} from '../../../inputFieldTsx';
import ripple from '../../../ripple';
import Space from '../../../space';
import styles from './style.module.scss';
ripple; // keep

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  peerId: PeerId;
  messageId: number;
  onFinish: () => void;
};

const MAX_LENGTH = 100;

const SuggestedPostRejectPopupContent = defineSolidElement({
  name: 'suggested-post-reject-popup-content',
  component: (props: PassedProps<Props>) => {
    const [comment, setComment] = createSignal('');

    const tooLong = () => comment().length > MAX_LENGTH;

    let isFinishing = false;

    const onFinish = () => {
      if(isFinishing || tooLong()) return;
      isFinishing = true;
      rootScope.managers.monoforumDialogsStorage.toggleSuggestedPostApproval({
        parentPeerId: props.peerId,
        messageId: props.messageId,
        reject: true,
        rejectComment: comment() || undefined
      });
      props.onFinish();
    };

    return <>
      <Space amount="0.5rem" />

      <InputFieldTsx value={comment()} onRawInput={setComment} label='SuggestedPosts.RejectComment.Label' maxLength={MAX_LENGTH} />
      <div class={styles.Caption}>
        <I18nTsx key='SuggestedPosts.RejectComment.Caption' />
      </div>

      <Space amount="2rem" />

      <button
        use:ripple
        class="btn-primary btn-color-primary btn-large"
        onClick={onFinish}
        disabled={tooLong()}
      >
        <I18nTsx key='SuggestedPosts.Reject' />
      </button>

      <Space amount="0.5rem" />
    </>;
  }
});

export default SuggestedPostRejectPopupContent;
