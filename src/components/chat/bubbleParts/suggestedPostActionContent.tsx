import {Match, onCleanup, Show, Switch} from 'solid-js';
import {formatFullSentTime} from '../../../helpers/date';
import {numberThousandSplitterForStars} from '../../../helpers/number/numberThousandSplitter';
import {I18nTsx} from '../../../helpers/solid/i18n';
import {Message, MessageAction} from '../../../layer';
import getPeerId from '../../../lib/appManagers/utils/peers/getPeerId';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import {PeerTitleTsx} from '../../peerTitleTsx';
import styles from './suggestedPostActionContent.module.scss';
import {SUGGESTED_POST_WAIT_FOR_REWARD_HOURS} from '../../../lib/mtproto/mtproto_config';

if(import.meta.hot) import.meta.hot.accept();


const LIMIT_SYMBOLS = 20;

type PossibleAction = MessageAction.messageActionSuggestedPostApproval | MessageAction.messageActionSuggestedPostSuccess | MessageAction.messageActionSuggestedPostRefund;

type Props = {
  message: Message.message | Message.messageService;
  canManageDirectMessages: boolean;

  action?: PossibleAction;
  fromPeerTitle?: HTMLElement;
};

const SuggestedPostActionContent = defineSolidElement({
  name: 'suggested-post-action-content',
  component: (props: PassedProps<Props>) => {
    props.element.classList.add(styles.Container);
    if(import.meta.hot) onCleanup(() => props.element.classList.remove(styles.Container));

    const suggestedPost = () => props.message._ === 'message' ?
      props.message.suggested_post :
      undefined;

    const isChangeSuggestion = () => !!props.message.reply_to;

    const wasPublished = () => props.action?._ === 'messageActionSuggestedPostApproval' && props.action?.schedule_date && props.action.schedule_date * 1000 <= Date.now()

    const savedPeerId = () => props.message.saved_peer_id && getPeerId(props.message.saved_peer_id);
    const chargedPeerId = () => savedPeerId() !== rootScope.myId ? savedPeerId() : undefined;

    const awardedStars = () => props.action?._ === 'messageActionSuggestedPostSuccess' && props.action.price.amount;

    const chargedPrice = () => props.action?._ === 'messageActionSuggestedPostApproval' && props.action.price ?
      <I18nTsx
        key={props.action.price._ === 'starsTonAmount' ? 'SuggestedPosts.TONAmount' : 'Stars'}
        args={[numberThousandSplitterForStars(props.action.price.amount)]}
      /> :
      undefined;

    const makeEmoji = (text: string) => <span>{wrapEmojiText(text)}</span>;

    return <>
      <div class={styles.Label}>
        <Switch>
          <Match when={suggestedPost() && isChangeSuggestion()}>
            <I18nTsx
              key={props.fromPeerTitle ? 'SuggestedPosts.SuggestedAChange' : 'SuggestedPosts.YouSuggestedAChange'}
              args={props.fromPeerTitle ? [props.fromPeerTitle] : undefined}
            />
          </Match>
          <Match when={suggestedPost()}>
            <I18nTsx
              key={props.fromPeerTitle ? 'SuggestedPosts.SuggestedAPost' : 'SuggestedPosts.YouSuggestedAPost'}
              args={props.fromPeerTitle ? [props.fromPeerTitle] : undefined}
            />
          </Match>
          <Match when={props.action?._ === 'messageActionSuggestedPostRefund'}>
            <I18nTsx
              key='SuggestedPosts.Refund'
              args={[<PeerTitleTsx peerId={savedPeerId()} onlyFirstName limitSymbols={LIMIT_SYMBOLS} />]}
            />
          </Match>
          <Match when={props.action?._ === 'messageActionSuggestedPostApproval' && props.action?.pFlags?.balance_too_low}>
            <I18nTsx key='SuggestedPosts.BalanceTooLow' args={[wrapEmojiText('❌')]} />
          </Match>
          <Match when={props.action?._ === 'messageActionSuggestedPostApproval' && props.action?.pFlags?.rejected}>
            <I18nTsx
              key={props.fromPeerTitle ? 'SuggestedPosts.RejectedAPost' : 'SuggestedPosts.YouRejectedAPost'}
              args={props.fromPeerTitle ? [wrapEmojiText('❌'), props.fromPeerTitle] : [wrapEmojiText('❌')]}
            />
          </Match>
          <Match when={props.action?._ === 'messageActionSuggestedPostApproval'}>
            <I18nTsx key='SuggestedPosts.AgreementReached' args={[makeEmoji('🤝')]} />
          </Match>
          <Match when={props.action?._ === 'messageActionSuggestedPostSuccess'}>
            <I18nTsx
              key='SuggestedPosts.PostSuccess'
              args={[
                makeEmoji('✅'),
                <I18nTsx key='Stars' args={[numberThousandSplitterForStars(awardedStars())]} />
              ]}
            />
          </Match>
        </Switch>
      </div>

      <Show when={suggestedPost()?.price || suggestedPost()?.schedule_date}>
        <div class={styles.Grid}>
          <Show when={suggestedPost().price}>
            <div class={styles.GridLabel}><I18nTsx key='SuggestedPosts.Price' /></div>
            <div class={styles.GridValue}>
              <I18nTsx
                key={suggestedPost().price._ === 'starsTonAmount' ? 'SuggestedPosts.TONAmount' : 'Stars'}
                args={[numberThousandSplitterForStars(suggestedPost().price.amount)]}
              />
            </div>
          </Show>
          <Show when={suggestedPost().schedule_date}>
            <div class={styles.GridLabel}><I18nTsx key='SuggestedPosts.Time' /></div>
            <div class={styles.GridValue}>{formatFullSentTime(suggestedPost().schedule_date)}</div>
          </Show>
        </div>
      </Show>

      {props.action?._ === 'messageActionSuggestedPostApproval' && props.action.reject_comment && (
        <div class={`${styles.Subtitle} ${styles.center}`}>
          "{props.action.reject_comment}"
        </div>
      )}

      {props.action?._ === 'messageActionSuggestedPostApproval' && !props.action?.pFlags?.balance_too_low && !props.action?.pFlags?.rejected &&
        <>
          <I18nTsx
            class={styles.Subtitle}
            key={wasPublished() ? 'SuggestedPosts.AgreementReached.Published' : 'SuggestedPosts.AgreementReached.ToBePublished'}
            args={[makeEmoji('📅'), formatFullSentTime(props.action.schedule_date)]}
          />

          <Show when={props.action.price}>
            <I18nTsx
              class={styles.Subtitle}
              key={chargedPeerId() ? 'SuggestedPosts.AgreementReached.HasBeenCharged' : 'SuggestedPosts.AgreementReached.YouHaveBeenCharged'}
              args={chargedPeerId() ?
                [makeEmoji('💰'), <PeerTitleTsx peerId={chargedPeerId()} onlyFirstName limitSymbols={LIMIT_SYMBOLS} />, chargedPrice()] :
                [makeEmoji('💰'), chargedPrice()]}
            />

            <I18nTsx
              class={styles.Subtitle}
              key='SuggestedPosts.AgreementReached.WillReceive'
              args={[makeEmoji('⏳'), <PeerTitleTsx peerId={props.message.peerId} limitSymbols={LIMIT_SYMBOLS} />, '' + SUGGESTED_POST_WAIT_FOR_REWARD_HOURS]}
            />

            <I18nTsx
              class={styles.Subtitle}
              key='SuggestedPosts.AgreementReached.WillBeRefunded'
              args={[makeEmoji('🔄'), <PeerTitleTsx peerId={props.message.peerId} limitSymbols={LIMIT_SYMBOLS} />, '' + SUGGESTED_POST_WAIT_FOR_REWARD_HOURS]}
            />
          </Show>
        </>
      }
    </>;
  }
});

export default SuggestedPostActionContent;
