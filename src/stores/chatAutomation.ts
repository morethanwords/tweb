import {createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';
import type {BotConnectionReview} from '@appManagers/appBusinessManager';

const [botConnectionReviews, setBotConnectionReviews] = createRoot(() => (
  createSignal<BotConnectionReview[]>([])
));

function fetchBotConnectionReviews() {
  rootScope.managers.appBusinessManager.getBotConnectionReviews()
  .then(setBotConnectionReviews)
  .catch(() => {});
}

let loaded = false;

export default function useBotConnectionReviews() {
  if(!loaded) {
    loaded = true;

    fetchBotConnectionReviews();

    rootScope.addEventListener('bot_connection_reviews_update', setBotConnectionReviews);
    // * the reviews are the account's own
    rootScope.addEventListener('account_switched', () => {
      setBotConnectionReviews([]);
      fetchBotConnectionReviews();
    });
  }

  return botConnectionReviews;
}
