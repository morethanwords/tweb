import appMediaPlaybackController from '@components/appMediaPlaybackController';
import rootScope from '@lib/rootScope';

/** An audio plays through the app's player, which the app sets up once it is signed in. */
export function ensureMediaPlayback() {
  if(!(appMediaPlaybackController as any).container) {
    appMediaPlaybackController.construct(rootScope.managers);
  }
}
