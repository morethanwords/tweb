import {Middleware} from '@helpers/middleware';
import {PeerColor, User} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import wrapEmojiPattern from '@components/wrappers/emojiPattern';
import wrapSticker from '@components/wrappers/sticker';

// * Background-emoji pattern geometry, ported 1:1 from tdesktop's FillBackgroundEmoji
// * (Telegram/SourceFiles/history/view/history_view_reply.cpp:267 — the non-quote variant,
// * shared there by replies, contacts AND web pages). tdesktop renders three cached emoji
// * frame sizes (kSize1/2/3 = 12/16/20, reply.cpp:237-239) and lays out 9 instances, each
// * anchored from the box's RIGHT edge (reply.cpp:296-310). Tuple = [distanceFromRight, top, sizeIndex, opacity].
const TDESKTOP_PATTERN_SIZES = [12, 16, 20];
const TDESKTOP_PATTERN: [xFromRight: number, y: number, sizeIndex: number, alpha: number][] = [
  [28, 4, 2, .32],
  [51, 15, 1, .32],
  [64, -2, 0, .28],
  [87, 11, 1, .24],
  [125, -2, 2, .16],
  [28, 31, 1, .24],
  [72, 33, 2, .2],
  [46, 52, 1, .24],
  [24, 55, 2, .18]
];

// * The pattern is pinned to the box's right edge (CSS inset-inline-end: 0), so a right-anchored
// * tdesktop x maps to a left-origin x of `width - distanceFromRight`. Width seats the leftmost
// * emoji (125); height covers the lowest (55 + 20). The quote-like box's overflow:hidden then
// * clips it to the real reply/webpage height — mirroring tdesktop's `if(y >= rect.height()) return`.
export const PEER_COLOR_PATTERN_CANVAS_WIDTH = 130;
export const PEER_COLOR_PATTERN_CANVAS_HEIGHT = 76;
export const PEER_COLOR_PATTERN_EMOJI_SIZE = 24; // source raster >= the largest draw size (20)
export const PEER_COLOR_PATTERN_POSITIONS: [x: number, y: number, size: number, alpha: number][] =
  TDESKTOP_PATTERN.map(([xFromRight, y, sizeIndex, alpha]): [number, number, number, number] =>
    [PEER_COLOR_PATTERN_CANVAS_WIDTH - xFromRight, y, TDESKTOP_PATTERN_SIZES[sizeIndex], alpha]);

// * The pattern is drawn once per emoji as a mask and painted in CSS (`.quote-like-pattern`) with the
// * box's own colour. So, like every other client, it takes the colour of whatever it sits in —
// * the peer's, the outgoing one of the chat's own theme, white over standalone media — and
// * follows a theme switch without being redrawn.
const masks: Map<string, string> = new Map();

export type WrapPeerColorPatternOptions = {
  peerId: PeerId,
  container: HTMLElement,
  middleware?: Middleware,
  withCollectible?: boolean
};

// * shared peer-color background-emoji pattern (replies, quotes, contacts, web pages)
export default function wrapPeerColorPattern(options: WrapPeerColorPatternOptions) {
  const {peerId, container, middleware} = options;
  const peer = apiManagerProxy.getPeer(peerId);
  const color = (peer as User.user)?.color as PeerColor.peerColor | PeerColor.peerColorCollectible;
  const docId = color?.background_emoji_id;
  if(docId) {
    const appendPattern = (mask: string) => {
      const div = document.createElement('div');
      div.classList.add('quote-like-pattern');
      div.style.width = `${PEER_COLOR_PATTERN_CANVAS_WIDTH}px`;
      div.style.height = `${PEER_COLOR_PATTERN_CANVAS_HEIGHT}px`;
      div.style.setProperty('--pattern-mask', `url(${mask})`);
      container.prepend(div);
    };

    const key = `${docId}-${window.devicePixelRatio}`;
    const mask = masks.get(key);
    if(mask) {
      appendPattern(mask);
    } else {
      wrapEmojiPattern({
        docId,
        middleware,
        positions: PEER_COLOR_PATTERN_POSITIONS,
        canvasWidth: PEER_COLOR_PATTERN_CANVAS_WIDTH,
        canvasHeight: PEER_COLOR_PATTERN_CANVAS_HEIGHT,
        emojiSize: PEER_COLOR_PATTERN_EMOJI_SIZE
      }).then((canvas) => {
        if(!canvas) return;
        const mask = canvas.toDataURL();
        masks.set(key, mask);
        if(middleware && !middleware()) return;
        appendPattern(mask);
      });
    }
  }

  if(options.withCollectible && color?._ === 'peerColorCollectible') {
    const div = document.createElement('div');
    div.classList.add('reply-collectible');
    container.classList.add('has-collectible');
    container.appendChild(div);

    rootScope.managers.appEmojiManager.getCustomEmojiDocument(color.gift_emoji_id).then((doc) => {
      if(middleware && !middleware()) return;
      if(!doc) return;

      return wrapSticker({
        doc,
        div,
        middleware,
        width: 24,
        height: 24
      });
    });
  }
}
