import Button from '@components/buttonTsx';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import RippleElement from '@components/rippleElement';
import createBirthdaySuggestions from '@components/sidebarLeft/birthdaySuggestions';
import createEmailSetupSuggestion from '@components/sidebarLeft/emailSetupSuggestion';
import createFrozenSuggestion from '@components/sidebarLeft/frozenSuggestion';
import createNotificationsSuggestion from '@components/sidebarLeft/notificationsSuggestion';
import createPasskeySetupSuggestion from '@components/sidebarLeft/passkeySetupSuggestion';
import type {PendingSuggestionController} from '@components/sidebarLeft/pendingSuggestionController';
import styles from '@components/sidebarLeft/pendingSuggestion.module.scss';
import selectPendingSuggestion, {PendingSuggestionType} from '@components/sidebarLeft/selectPendingSuggestion';
import {toastNew} from '@components/toast';
import documentFragmentToNodes from '@helpers/dom/documentFragmentToNodes';
import Animated from '@helpers/solid/animations';
import classNames from '@helpers/string/classNames';
import I18n, {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import useBotConnectionReviews from '@stores/chatAutomation';
import {useIsSidebarCollapsed} from '@stores/foldersSidebar';
import {createEffect, createMemo, createSignal, JSX, Show} from 'solid-js';
import {render} from 'solid-js/web';

function BotConnectionReviewSuggestion() {
  const reviews = useBotConnectionReviews();
  const review = createMemo(() => reviews()[0]);
  const details = createMemo(() => [review()?.device, review()?.location].filter(Boolean).join(', '));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useIsSidebarCollapsed();
  const [processing, setProcessing] = createSignal(false);

  const performAction = async(confirm: boolean) => {
    const currentReview = review();
    if(!currentReview || processing()) return;

    setProcessing(true);
    try {
      const result = await (confirm ?
        rootScope.managers.appBusinessManager.confirmBotConnection(currentReview.botId) :
        rootScope.managers.appBusinessManager.rejectBotConnection(currentReview.botId));
      if(result) {
        toastNew({
          langPackKey: confirm ?
            'ChatAutomation.ConnectionReview.Confirmed' :
            'ChatAutomation.ConnectionReview.Rejected'
        });
      }
    } catch(err) {
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setProcessing(false);
    }
  };

  const botTitle = () => (
    <PeerTitleTsx peerId={review().botId.toPeerId(false)} username />
  );

  return (
    <Show when={review()}>
      <Show
        when={!isSidebarCollapsed()}
        fallback={
          <RippleElement
            component="button"
            type="button"
            class={classNames(styles.collapsed, 'hover-danger-effect')}
            aria-label={I18n.format('ChatAutomation.ConnectionReview.Title', true)}
            onClick={() => setIsSidebarCollapsed(false)}
          >
            {documentFragmentToNodes(wrapEmojiText('⚠️'))}
          </RippleElement>
        }
      >
        <div class={styles.connectionReview}>
          <div class={styles.connectionReviewTitle}>
            {reviews().length > 1 && `1/${reviews().length} `}
            {i18n('ChatAutomation.ConnectionReview.Title')}
          </div>
          <div class={styles.connectionReviewText}>
            {botTitle()} {' '}
            {details() ?
              i18n('ChatAutomation.ConnectionReview.Text', [details()]) :
              i18n('ChatAutomation.ConnectionReview.TextNoLocation')}
          </div>
          <div class={styles.connectionReviewActions}>
            <Button
              primaryTransparent
              class={styles.connectionReviewButton}
              disabled={processing()}
              text="ChatAutomation.ConnectionReview.Confirm"
              onClick={() => performAction(true)}
            />
            <Button
              primaryTransparent
              class={classNames(styles.connectionReviewButton, styles.connectionReviewReject)}
              disabled={processing()}
              text="ChatAutomation.ConnectionReview.Reject"
              onClick={() => performAction(false)}
            />
          </div>
        </div>
      </Show>
    </Show>
  );
}

export function renderPendingSuggestion(toElement: HTMLElement) {
  toElement.classList.add(styles.container);

  render(() => {
    const birthdaySuggestions = createBirthdaySuggestions();
    const suggestions: Record<PendingSuggestionType, PendingSuggestionController> = {
      frozen: createFrozenSuggestion(),
      notifications: createNotificationsSuggestion(),
      passkey: createPasskeySetupSuggestion(),
      birthdayContacts: birthdaySuggestions.contacts,
      birthdaySetup: birthdaySuggestions.setup
    };
    createEmailSetupSuggestion();

    const [element, setElement] = createSignal<JSX.Element>();
    const botConnectionReviews = useBotConnectionReviews();
    const suggestionConstructor = createMemo(() => {
      if(botConnectionReviews().length) {
        return BotConnectionReviewSuggestion;
      }

      const type = selectPendingSuggestion({
        frozen: suggestions.frozen.available(),
        notifications: suggestions.notifications.available(),
        passkey: suggestions.passkey.available(),
        birthdayContacts: suggestions.birthdayContacts.available(),
        birthdaySetup: suggestions.birthdaySetup.available()
      });

      return type ? suggestions[type].component : undefined;
    });

    createEffect(() => {
      const constructor = suggestionConstructor();
      const element = constructor ? (<div class={styles.suggestionContainer}>{constructor()}</div>) : undefined;
      setElement(element);
    });

    createEffect(() => {
      document.body.classList.toggle('has-pending-suggestion', !!element());
    });

    return (
      <Animated
        type="grow-height"
        appear
        mode="add-remove"
        noItemClass
      >
        {element()}
      </Animated>
    );
  }, toElement);
}
