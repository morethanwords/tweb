import {Message} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '../../../lib/solidjs/hotReloadGuard';
import confirmationPopup from '../../confirmationPopup';
import Icon from '../../icon';
import ripple from '../../ripple';
import wrapPeerTitle from '../../wrappers/peerTitle';
import type Chat from '../chat';
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
    const {rootScope} = useHotReloadGuard();
    const onAcceptClick = async() => {
      const canManageDirectMessages = await rootScope.managers.appPeersManager.canManageDirectMessages(props.message.peerId);

      try {
        await confirmationPopup({
          titleLangKey: 'SuggestedPosts.AcceptOffer',
          descriptionLangKey: canManageDirectMessages ? 'SuggestedPosts.AcceptOfferDescription.ForAdmin' : 'SuggestedPosts.AcceptOfferDescription.ForSubscriber',
          descriptionLangArgs: [await wrapPeerTitle({peerId: props.message.fromId, onlyFirstName: true})],
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
          <button class="reply-markup-button" use:ripple onClick={onAcceptClick}>
            <span class="reply-markup-button-text reply-markup-suggested-action">
              {Icon('checkround_filled')}{/* @once */i18n('SuggestedPosts.Accept')}
            </span>
          </button>
          <button class="reply-markup-button" use:ripple onClick={onRejectClick}>
            <span class="reply-markup-button-text reply-markup-suggested-action">
              {Icon('crossround_filled')}{/* @once */i18n('SuggestedPosts.Reject')}
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
