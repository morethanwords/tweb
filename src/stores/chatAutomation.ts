import {createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';
import type {BotConnectionReview} from '@appManagers/appBusinessManager';

const [botConnectionReviews, setBotConnectionReviews] = createRoot(() => (
  createSignal<BotConnectionReview[]>([])
));

let loaded = false;

export default function useBotConnectionReviews() {
  if(!loaded) {
    loaded = true;

    rootScope.managers.appBusinessManager.getBotConnectionReviews()
    .then(setBotConnectionReviews)
    .catch(() => {});

    rootScope.addEventListener('bot_connection_reviews_update', setBotConnectionReviews);
  }

  return botConnectionReviews;
}
