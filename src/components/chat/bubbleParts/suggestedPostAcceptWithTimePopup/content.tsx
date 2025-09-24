import {createSignal, Match, Switch} from 'solid-js';
import {numberThousandSplitterForStars} from '../../../../helpers/number/numberThousandSplitter';
import {I18nTsx} from '../../../../helpers/solid/i18n';
import {Message} from '../../../../layer';
import {SUGGESTED_POST_WAIT_FOR_REWARD_HOURS} from '../../../../lib/mtproto/mtproto_config';
import rootScope from '../../../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../../../lib/solidjs/defineSolidElement';
import {PeerTitleTsx} from '../../../peerTitleTsx';
import ripple from '../../../ripple';
import Space from '../../../space';
import PublishTimeField from '../../suggestPostPopup/publishTimeField';
import styles from './styles.module.scss';
import {useFormattedCommission} from './useFormattedCommission';
ripple; // keep

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  peerId: PeerId;
  message: Message.message;
  offeredStars?: number;
  onFinish: () => void;
};

const SuggestedPostAcceptWithTimePopupContent = defineSolidElement({
  name: 'suggested-post-accept-with-time-popup-content',
  component: (props: PassedProps<Props>) => {
    const [publishTimestamp, setPublishTimestamp] = createSignal<number>();

    const {commission, formattedCommission} = useFormattedCommission();


    let isFinishing = false;

    const onFinish = () => {
      if(isFinishing) return;
      isFinishing = true;
      rootScope.managers.monoforumDialogsStorage.toggleSuggestedPostApproval({
        parentPeerId: props.peerId,
        messageId: props.message.mid,
        scheduleTimestamp: publishTimestamp()
      });
      props.onFinish();
    };

    return <>
      <Space amount="0.5rem" />

      <div class={styles.Description}>
        <Switch>
          <Match when={props.offeredStars}>
            <I18nTsx
              key='SuggestedPosts.AcceptOfferDescription.ForAdminPaid'
              args={[
                <PeerTitleTsx peerId={props.message.fromId} />,
                <I18nTsx key='Stars' args={[numberThousandSplitterForStars(props.offeredStars * commission())]} />,
                formattedCommission(),
                SUGGESTED_POST_WAIT_FOR_REWARD_HOURS + ''
              ]}
            />
          </Match>
          <Match when>
            <I18nTsx
              key='SuggestedPosts.AcceptOfferDescription.ForAdmin'
              args={[<PeerTitleTsx peerId={props.message.fromId} />]}
            />
          </Match>
        </Switch>
      </div>

      <Space amount="1.5rem" />

      <PublishTimeField
        noTimeLangKey='SuggestedPosts.PublishingTime.PublishNow'
        value={publishTimestamp()}
        onChange={setPublishTimestamp}
      />

      <Space amount="2rem" />

      <button
        use:ripple
        class="btn-primary btn-color-primary btn-large"
        onClick={onFinish}
      >
        <I18nTsx key='SuggestedPosts.Accept' />
      </button>

      <Space amount="0.5rem" />
    </>;
  }
});

export default SuggestedPostAcceptWithTimePopupContent;
