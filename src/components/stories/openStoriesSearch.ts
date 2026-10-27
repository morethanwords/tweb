import type {StoriesSearch} from '@components/stories/store';
import {GeoPoint, MediaArea} from '@layer';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {APP_TABS} from '@lib/appColumns';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {AccountSession, getAccountSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import mediaSizes, {ScreenSize} from '@helpers/mediaSizes';
import parseUriParams from '@helpers/string/parseUriParams';
import parseChatSpecificTag from '@lib/richTextProcessor/parseChatSpecificTag';

// * a place is the same wherever on a story its area stands
const isSamePlace = (a: MediaArea, b: MediaArea) => {
  const [geoA, geoB] = [a, b].map((area) => (area as MediaArea.mediaAreaGeoPoint).geo as GeoPoint.geoPoint);
  return a._ === b._ &&
    geoA?.lat === geoB?.lat &&
    geoA?.long === geoB?.long &&
    (a as MediaArea.mediaAreaVenue).venue_id === (b as MediaArea.mediaAreaVenue).venue_id;
};

const isSameSearch = (a: StoriesSearch, b: StoriesSearch) => {
  return a.hashtag === b.hashtag &&
    a.peerId === b.peerId &&
    !a.area === !b.area &&
    (!a.area || isSamePlace(a.area, b.area));
};

/**
 * The stories found open in a screen of the left column, over the screens there - but the same search on top
 * stays as it is. `session` is the account session it was asked in: one that is over by then opens nothing
 */
export default async function openStoriesSearch(search: StoriesSearch, session: AccountSession = getAccountSession()) {
  const {appSidebarLeft, appImManager, tabs} = hotReloadGuard;
  // * a narrow window shows the chat in place of the column
  if(mediaSizes.activeScreen !== ScreenSize.large) {
    await appImManager.selectTab(APP_TABS.CHATLIST);
  }

  if(isSessionLeaving(session)) {
    return;
  }

  const history = appSidebarLeft.getHistory();
  const top = history[history.length - 1];
  if(top instanceof tabs.AppStoriesSearchTab && isSameSearch(top.payload.search, search)) {
    return;
  }

  return appSidebarLeft.createTab(tabs.AppStoriesSearchTab).open({search});
}

/** a hashtag pressed in a story: `#tag` or `$tag` looks through every public story, `#tag@username` through that peer's */
export async function openStoriesSearchByHashtag(anchor: HTMLAnchorElement, session: AccountSession = getAccountSession()) {
  if(isSessionLeaving(session)) {
    return;
  }

  const managers = bindManagersToSession(rootScope.managers);
  const {query, username} = parseChatSpecificTag(parseUriParams(anchor.href).hashtag);
  let peerId: PeerId;
  if(username) {
    try {
      const peer = await managers.appUsersManager.resolveUsername(username);
      peerId = peer.id.toPeerId(peer._ !== 'user');
    } catch(err) {
      hotReloadGuard.internalLinkProcessor.showUsernameResolveError(err as ApiError);
      return;
    }
  }

  return openStoriesSearch({hashtag: query, peerId}, session);
}
