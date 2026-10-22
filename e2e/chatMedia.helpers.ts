import {Page} from '@playwright/test';

// * a photo or video of a message, and one of a rich message's page
export const MESSAGE_MEDIA = '.attachment.media-container, .album-item';
export const PAGE_MEDIA = '[class*="_MediaViewable_"]';
// * how far down the chat list to look for a photo
const DIALOGS_LIMIT = 30;

export type Point = {x: number, y: number};

/**
 * The newest message in the chat list with a photo a peek or the media viewer can show - in a chat
 * with at least `photos` of them - a small GIF (no side over 320 px), or a rich message whose page has
 * a photo or a video
 */
export async function findMessage(page: Page, kind: 'photo' | 'gif' | 'rich', {photos = 1}: {photos?: number} = {}) {
  return page.evaluate(async({kind, photos, limit}) => {
    const managers = (window as any).appImManager.managers;
    const {dialogs} = await managers.dialogsStorage.getDialogs({filterId: 0, limit});
    for(const {peerId} of dialogs) {
      const result = await managers.appMessagesManager.getHistory({
        peerId,
        ...(kind === 'rich' ?
          {limit: 50} :
          {inputFilter: {_: kind === 'gif' ? 'inputMessagesFilterGif' : 'inputMessagesFilterPhotos'}, limit: 10})
      }).catch((): undefined => undefined);
      if(kind === 'photo' && (result?.count ?? result?.history.length) < photos) continue;
      for(const mid of result?.history || []) {
        const message = await managers.appMessagesManager.getMessageByPeer(peerId, mid);
        const media = message?.media;
        // * one large enough to tell its picture from a blurred thumbnail: a 64px photo is drawn stretched
        const found = kind === 'photo' ?
          media?._ === 'messageMediaPhoto' && !media.pFlags.spoiler && !media.ttl_seconds &&
            Math.max(...media.photo.sizes.map((size: {w?: number}) => size.w || 0)) >= 320 :
          kind === 'gif' ?
            media?._ === 'messageMediaDocument' && media.document?.type === 'gif' && !media.pFlags.spoiler &&
              Math.max(media.document.w, media.document.h) <= 320 :
            message?.rich_message && /pageBlock(Photo|Video)/.test(JSON.stringify(message.rich_message));
        if(found) {
          return {peerId, mid};
        }
      }
    }
  }, {kind, photos, limit: DIALOGS_LIMIT});
}

/** Opens the chat of a message there and returns the middle of its media, scrolled into view */
export async function openMessage(page: Page, {peerId, mid}: {peerId: number, mid: number}, mediaSelector = MESSAGE_MEDIA): Promise<Point> {
  await page.evaluate(async({peerId, mid, limit}) => {
    // * a fresh page knows only the chats its list has drawn: load as many as the search went through
    const {appImManager} = window as any;
    await appImManager.managers.dialogsStorage.getDialogs({filterId: 0, limit});
    await appImManager.setInnerPeer({peerId, lastMsgId: mid});
  }, {peerId, mid, limit: DIALOGS_LIMIT});
  const args = {selector: `#column-center [data-mid="${mid}"]`, mediaSelector};
  await page.waitForFunction(({selector, mediaSelector}) => {
    const element = document.querySelector(selector);
    const bubble = element?.closest('.bubble') || element;
    return !!bubble?.querySelector(mediaSelector);
  }, args, {timeout: 60_000});
  await page.waitForTimeout(1500);
  const findMedia = ({selector, mediaSelector, scroll}: typeof args & {scroll?: boolean}) => {
    const element = document.querySelector(selector);
    const bubble = element.closest('.bubble') || element;
    const media = element.matches(mediaSelector) ? element : bubble.querySelector(mediaSelector);
    if(scroll) media.scrollIntoView({block: 'center'});
    const rect = media.getBoundingClientRect();
    return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
  };

  await page.evaluate(findMedia, {...args, scroll: true});
  // * scrolling there can bring in more of the chat around it: measured once it has settled
  await page.waitForTimeout(800);
  return page.evaluate(findMedia, args);
}
