import {numberThousandSplitterForStars} from '../../../helpers/number/numberThousandSplitter';
import {Message} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import {SUGGESTED_POST_WAIT_FOR_REWARD_HOURS} from '../../../lib/mtproto/mtproto_config';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '../../../lib/solidjs/hotReloadGuard';
import confirmationPopup from '../../confirmationPopup';
import Icon from '../../icon';
import ripple from '../../ripple';
import wrapPeerTitle from '../../wrappers/peerTitle';
import type Chat from '../chat';
import SuggestedPostAcceptWithTimePopup from './suggestedPostAcceptWithTimePopup';
import {useFormattedCommission} from './suggestedPostAcceptWithTimePopup/useFormattedCommission';
import SuggestedPostRejectPopup from './suggestedPostRejectPopup';
ripple; // keep

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  chat: Chat;
  message: Message.message;
};

const SuggestedPostReplyMarkupContent = defineSolidElement({
  name: 'suggested-post-reply-markup-content',
  component: (props: PassedProps<Props>) => {
    const {rootScope, HotReloadGuard} = useHotReloadGuard();

    const {commission, formattedCommission} = useFormattedCommission();

    const onAcceptClick = async() => {
      const canManageDirectMessages = await rootScope.managers.appPeersManager.canManageDirectMessages(props.message.peerId);
      const stars = props.message.suggested_post?.price?._ === 'starsAmount' && +props.message.suggested_post?.price?.amount || undefined;
      let scheduleDate = props.message.suggested_post?.schedule_date || undefined;
      if(scheduleDate * 1000 < Date.now()) scheduleDate = undefined;

      if(canManageDirectMessages && !scheduleDate) {
        new SuggestedPostAcceptWithTimePopup({
          message: props.message,
          peerId: props.chat.peerId,
          HotReloadGuard,
          offeredStars: stars
        }).show();
        return;
      }

      try {
        await confirmationPopup({
          className: 'suggested-post-popup',
          titleLangKey: 'SuggestedPosts.AcceptOffer',
          descriptionLangKey: canManageDirectMessages ?
            stars ? 'SuggestedPosts.AcceptOfferDescription.ForAdminPaid' : 'SuggestedPosts.AcceptOfferDescription.ForAdmin' :
            'SuggestedPosts.AcceptOfferDescription.ForSubscriber',
          descriptionLangArgs: [
            await wrapPeerTitle({peerId: props.message.fromId, onlyFirstName: true}),
            ...(canManageDirectMessages && stars ? [
              i18n('Stars', [numberThousandSplitterForStars((stars * commission()).toFixed(2))]),
              formattedCommission(),
              SUGGESTED_POST_WAIT_FOR_REWARD_HOURS
            ] : [])
          ],
          button: {langKey: 'SuggestedPosts.Accept'}
        });

        await rootScope.managers.monoforumDialogsStorage.toggleSuggestedPostApproval({
          parentPeerId: props.message.peerId,
          messageId: props.message.mid
        });
      } catch{ }
    };

    const onRejectClick = () => {
      new SuggestedPostRejectPopup({
        peerId: props.message.peerId,
        messageId: props.message.mid
      }).show();
    };

    const onSuggestChangesClick = () => {
      props.chat.input.initSuggestPostChange(props.message.mid);
    };

    return (
      <div class="reply-markup">
        <div class="reply-markup-row">
          <button class="reply-markup-button" use:ripple onClick={onRejectClick}>
            <span class="reply-markup-button-text reply-markup-suggested-action">
              {Icon('crossround_filled')}{/* @once */i18n('SuggestedPosts.Reject')}
            </span>
          </button>
          <button class="reply-markup-button" use:ripple onClick={onAcceptClick}>
            <span class="reply-markup-button-text reply-markup-suggested-action">
              {Icon('checkround_filled')}{/* @once */i18n('SuggestedPosts.Accept')}
            </span>
          </button>
        </div>
        <div class="reply-markup-row">
          <button class="reply-markup-button is-first is-last" use:ripple onClick={onSuggestChangesClick}>
            <span class="reply-markup-button-text reply-markup-suggested-action">
              {Icon('newchat_filled')}{/* @once */i18n('SuggestedPosts.SuggestChanges')}
            </span>
          </button>
        </div>
      </div>
    );
  }
});

export default SuggestedPostReplyMarkupContent;
