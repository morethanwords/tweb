import type {GroupCallOutputSource} from '@appManagers/appGroupCallsManager';
import {GroupCallParticipant} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import liteMode from '@helpers/liteMode';
import I18n from '@lib/langPack';
import GroupCallVideoTile, {GROUP_CALL_MOVE_DURATION, GROUP_CALL_MOVE_EASING, GroupCallVideoTileType} from '@components/groupCall/videoTile';
import {
  GroupCallTileRect,
  layoutColumn,
  layoutList,
  layoutStage
} from '@components/groupCall/videoLayout';

const TYPES: GroupCallVideoTileType[] = ['presentation', 'video'];

const isSameRect = (a: GroupCallTileRect, b: GroupCallTileRect) => {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
};

// A camera fills its tile as long as that cuts this much of the frame away at most, and past that
// shrinks into it gradually (getVideoBox) — less on the stage, where the tiles are cut to the
// videos' shapes and a crop would only shave off a little. A screencast is never cropped.
const MAX_CROP_LIST = 0.45;
const MAX_CROP_STAGE = 0.2;

export type GroupCallVideoGridMode = {
  /** The wide panel: tiles on the stage, the participants in a column beside it. */
  wide: boolean,
  /** Only wide: the column is out and covers this much of the stage's inline-end edge. */
  columnWidth: number
};

/**
 * The layout works left to right (videoLayout.ts); a right-to-left interface reads the tiles from
 * the right, and its column covers the stage's left edge — the same rects, mirrored in their host.
 */
const mirrorRects = (rects: GroupCallTileRect[], hostWidth: number) => {
  return rects.map((rect) => ({...rect, x: hostWidth - rect.x - rect.width}));
};

/**
 * Every camera and screencast of the call, each one tile, wherever the panel's shape puts it:
 * - narrow: above the participants list, the pinned one first and large;
 * - wide: all of them on the stage, or the pinned one alone there and the rest above the
 *   participants in the column.
 *
 * A tile is the same element wherever it goes, so a change of place — a pin, the column sliding
 * in or out, someone turning their camera on — moves it there with a transform instead of
 * rebuilding it, and its video never stops.
 */
export default class GroupCallVideoGrid {
  public readonly stage: HTMLElement;
  public readonly list: HTMLElement;
  /**
   * Over the stage and the column both: a tile changing between them crosses here. The column
   * clips what it holds and sits over the stage, so a tile that changed hosts at once vanished
   * from the stage, or slid in under the column.
   */
  public readonly flight: HTMLElement;
  // where each tile crossing over `flight` lands once its move ends
  private readonly landings = new Map<GroupCallVideoTile, {
    animation: Animation,
    host: HTMLElement,
    rect: GroupCallTileRect,
    maxCrop: number
  }>();

  private readonly tiles = new Map<GroupCallOutputSource, GroupCallVideoTile>();
  private readonly peerTiles = new Map<PeerId, Map<GroupCallVideoTileType, GroupCallVideoTile>>();
  private readonly resizeObserver: ResizeObserver;
  private mode: GroupCallVideoGridMode = {wide: false, columnWidth: 0};
  private stageSize = {width: 0, height: 0};
  private listWidth = 0;
  private listHeightAnimation: Animation;
  private layoutFrame: number;
  private animateNextLayout = false;
  private destroyed = false;

  constructor(private readonly options: {
    instance: GroupCallInstance,
    listenerSetter: ListenerSetter,
    onCountChange: (count: number) => void
  }) {
    const {instance, listenerSetter} = options;

    this.stage = document.createElement('div');
    this.stage.classList.add('group-call-stage');
    this.list = document.createElement('div');
    this.list.classList.add('group-call-video-list');
    this.flight = document.createElement('div');
    this.flight.classList.add('group-call-video-flight');

    this.resizeObserver = new ResizeObserver((entries) => {
      let changed = false;
      entries.forEach((entry) => {
        const {width, height} = entry.contentRect;
        if(entry.target === this.stage) {
          changed ||= width !== this.stageSize.width || height !== this.stageSize.height;
          this.stageSize = {width, height};
        } else {
          // the list's height is ours to set: only its width is news
          changed ||= width !== this.listWidth;
          this.listWidth = width;
        }
      });

      // follows a drag of the panel's edge frame by frame, so nothing animates
      if(changed) {
        this.layout(false);
      }
    });
    this.resizeObserver.observe(this.stage);
    this.resizeObserver.observe(this.list);

    listenerSetter.add(rootScope)('group_call_participant', ({groupCallId, participant}) => {
      if(instance.id === groupCallId) {
        this.updateParticipant(participant);
      }
    });

    listenerSetter.add(instance)('pinned', () => this.scheduleLayout(true));

    listenerSetter.add(instance)('speaking', ({peerId, speaking}) => {
      this.peerTiles.get(peerId)?.forEach((tile) => tile.setSpeaking(speaking));
    });
    // the outline needs the levels sampled for as long as the tiles are up
    listenerSetter.addCleanup(instance.watchSpeaking());

    const onClick = (e: Event) => {
      const element = findUpClassName(e.target, 'group-call-video-tile');
      const tile = element && [...this.tiles.values()].find((tile) => tile.element === element);
      if(!tile) {
        return;
      }

      if(this.pinnedTile === tile) instance.unpinAll();
      else instance.pinSource(tile.source);
    };
    attachClickEvent(this.stage, onClick, {listenerSetter});
    attachClickEvent(this.list, onClick, {listenerSetter});

    void this.loadParticipants();
  }

  private async loadParticipants() {
    const {instance} = this.options;
    let participants: Map<PeerId, GroupCallParticipant>;
    try {
      participants = await instance.participants;
    } catch(err) {
      console.error('load group call videos failed', err);
      return;
    }

    if(this.destroyed) {
      return;
    }

    participants.forEach((participant) => this.updateParticipant(participant, false));
    // the first layout is not a change of anything, so it is not animated either
    this.layout(false);
  }

  public get count() {
    return this.tiles.size;
  }

  /** The pinned tile, if the pinned video has one — a pin can outlive its video for a moment. */
  public get pinnedTile() {
    return this.tiles.get(this.options.instance.pinnedSource);
  }

  public getPeerTiles(peerId: PeerId) {
    return this.peerTiles.get(peerId);
  }

  public setMode(mode: GroupCallVideoGridMode, animate: boolean) {
    if(this.mode.wide === mode.wide && this.mode.columnWidth === mode.columnWidth) {
      return;
    }

    // switching between narrow and wide reshapes the whole panel at once: no tile flies across it
    const animateChange = animate && this.mode.wide === mode.wide;
    this.mode = mode;
    this.layout(animateChange);
  }

  /** Lays the tiles out again where no host changed its size: the interface switched direction. */
  public relayout() {
    this.scheduleLayout(false);
  }

  private updateParticipant(participant: GroupCallParticipant, relayout = true) {
    const {instance} = this.options;
    const peerId = getPeerId(participant.peer);
    let peerTiles = this.peerTiles.get(peerId);
    let changed = false;

    TYPES.forEach((type) => {
      const tile = peerTiles?.get(type);
      const hasVideo = !participant.pFlags.left && !!participant[type];
      if(tile && hasVideo) {
        tile.updateParticipant(participant);
        return;
      } else if(tile) {
        peerTiles.delete(type);
        this.forgetTile(tile);
        tile.remove(liteMode.isAvailable('animations'));
        changed = true;
        return;
      } else if(!hasVideo) {
        return;
      }

      const result = instance.getVideoElementFromParticipantByType(participant, type);
      if(!result) {
        // its track has not arrived yet; hydrating it dispatches this participant again
        return;
      }

      const original = instance.getElement(result.source) as HTMLVideoElement;
      const created = new GroupCallVideoTile(
        result.source,
        type,
        participant,
        result.video,
        (animate) => this.scheduleLayout(animate),
        original?.videoWidth ? {width: original.videoWidth, height: original.videoHeight} : undefined,
        instance.accountNumber
      );
      created.setSpeaking(instance.isSpeaking(peerId));
      // The SFU can hand a source to a newcomer before the row saying its last owner left: that
      // owner's tile goes now, or it would stay on screen with nothing laying it out.
      const previous = this.tiles.get(created.source);
      if(previous) {
        const previousTiles = this.peerTiles.get(previous.peerId);
        previousTiles?.delete(previous.type);
        if(previousTiles && !previousTiles.size) this.peerTiles.delete(previous.peerId);
        this.forgetTile(previous);
        previous.remove(false);
      }

      if(!peerTiles) this.peerTiles.set(peerId, peerTiles = new Map());
      peerTiles.set(type, created);
      this.tiles.set(created.source, created);
      changed = true;
    });

    if(peerTiles && !peerTiles.size) {
      this.peerTiles.delete(peerId);
    }

    if(changed) {
      this.options.onCountChange(this.tiles.size);
      if(relayout) this.scheduleLayout(true);
    }
  }

  private forgetTile(tile: GroupCallVideoTile) {
    if(this.tiles.get(tile.source) === tile) {
      this.tiles.delete(tile.source);
    }

    this.landings.delete(tile);
  }

  private scheduleLayout(animate: boolean) {
    this.animateNextLayout ||= animate;
    if(this.layoutFrame !== undefined || this.destroyed) {
      return;
    }

    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = undefined;
      const animate = this.animateNextLayout;
      this.animateNextLayout = false;
      this.layout(animate);
    });
  }

  /**
   * In order: screencasts, then cameras, each as they arrived; in the narrow list an odd one out
   * gets a row of its own on top, which suits a landscape video best.
   */
  private getOrderedTiles() {
    const tiles = [...this.tiles.values()];
    return [
      ...tiles.filter((tile) => tile.type === 'presentation'),
      ...tiles.filter((tile) => tile.type === 'video')
    ];
  }

  private layout(animate: boolean) {
    if(this.destroyed) {
      return;
    }

    const {mode} = this;
    const pinned = this.pinnedTile;
    const ordered = this.getOrderedTiles();
    const others = ordered.filter((tile) => tile !== pinned);
    const placements: Array<{tile: GroupCallVideoTile, host: HTMLElement, rect: GroupCallTileRect, maxCrop: number}> = [];
    const isRTL = I18n.getIsRTL();
    const inDirection = (rects: GroupCallTileRect[], hostWidth: number) => isRTL ? mirrorRects(rects, hostWidth) : rects;

    let listHeight = 0;
    if(mode.wide) {
      const onStage = pinned ? [pinned] : ordered;
      const stageWidth = Math.max(0, this.stageSize.width - mode.columnWidth);
      // mirrored over the whole stage: the part the column leaves is on the right in RTL
      const stageRects = inDirection(layoutStage(onStage.map((tile) => tile.size), stageWidth, this.stageSize.height), this.stageSize.width);
      // alone on the stage — pinned or the only video — it is shown whole, as the large tile of a
      // narrow panel is, so pinning the only video changes nothing
      const maxCrop = onStage.length === 1 ? 0 : MAX_CROP_STAGE;
      onStage.forEach((tile, index) => {
        placements.push({tile, host: this.stage, rect: stageRects[index], maxCrop});
      });

      const inColumn = pinned ? others : [];
      const column = layoutColumn(inColumn.length, this.listWidth);
      inColumn.forEach((tile, index) => {
        placements.push({tile, host: this.list, rect: column.rects[index], maxCrop: MAX_CROP_LIST});
      });
      listHeight = column.height;
    } else {
      let inList = pinned ? [pinned, ...others] : ordered;
      if(!pinned && inList.length > 1 && inList.length % 2) {
        const wide = inList.find((tile) => tile.aspect > 1) ?? inList[0];
        inList = [wide, ...inList.filter((tile) => tile !== wide)];
      }

      const list = layoutList(inList.map((tile) => tile.size), this.listWidth, !!pinned);
      const listRects = inDirection(list.rects, this.listWidth);
      inList.forEach((tile, index) => {
        const isLarge = index === 0 && (!!pinned || inList.length === 1);
        placements.push({tile, host: this.list, rect: listRects[index], maxCrop: isLarge ? 0 : MAX_CROP_LIST});
      });
      listHeight = list.height;
    }

    // Only what changed moves: a layout that leaves a tile where it is going must not cut short
    // the move it is making there.
    const moves = placements.map(({tile, host, rect, maxCrop}) => {
      if(tile.type === 'presentation') {
        maxCrop = 0;
      }

      tile.setPinned(tile === pinned);
      // a tile in flight counts as already where it is landing
      const landing = this.landings.get(tile);
      const placed = landing ?? {host: tile.host, rect: tile.rect, maxCrop: tile.maxCrop};
      const unchanged = placed.host === host && placed.maxCrop === maxCrop && isSameRect(placed.rect, rect) && !tile.isReshaped;
      return !unchanged && {tile, host, rect, maxCrop};
    }).filter(Boolean);

    // * tiles fly to their places, and the list grows with them, with full animations only
    const shouldAnimate = animate && liteMode.isAvailable('motion');
    // read every start before writing anything: measured mid-flight when a move interrupts another
    const starts = shouldAnimate ? moves.map(({tile}) => tile.measure()) : [];
    const hostRects = shouldAnimate ? new Map([this.stage, this.list, this.flight].map((host) => [host, host.getBoundingClientRect()])) : undefined;
    moves.forEach(({tile}) => {
      tile.stopMoving();
      this.landings.delete(tile);
    });

    this.setListHeight(listHeight, hostRects?.get(this.list).height);

    moves.forEach(({tile, host, rect, maxCrop}, index) => {
      const start = starts[index];
      const wasPlaced = !!tile.host;
      if(!start) {
        tile.place(host, rect, maxCrop);
        if(animate && liteMode.isAvailable('animations') && !wasPlaced) {
          tile.appear();
        }

        return;
      }

      // Between the stage and the column a tile flies over both, from where it is on screen to
      // where it is going, and only then lands in its host.
      const crossing = tile.host !== host;
      const via = crossing ? this.flight : host;
      const viaRect = hostRects.get(via);
      const hostRect = hostRects.get(host);
      const target: GroupCallTileRect = crossing ? {
        ...rect,
        x: hostRect.left + rect.x - viaRect.left,
        y: hostRect.top + rect.y - viaRect.top
      } : rect;
      const animation = tile.place(via, target, maxCrop, {
        rect: {
          x: start.rect.left - viaRect.left,
          y: start.rect.top - viaRect.top,
          width: start.rect.width,
          height: start.rect.height
        },
        video: start.video
      });

      if(!crossing) {
        return;
      }

      const landing = {animation, host, rect, maxCrop};
      this.landings.set(tile, landing);
      animation.finished.then(() => {
        if(this.landings.get(tile) === landing && !this.destroyed) {
          this.landings.delete(tile);
          tile.place(host, rect, maxCrop);
        }
      }, () => {});
    });
  }

  /**
   * The participants below the list make room for its tiles, or take it back, as the tiles move —
   * from `from`, the height it has on screen now, when the change animates.
   */
  private setListHeight(height: number, from?: number) {
    const {list} = this;
    const value = height + 'px';
    // already there, or on its way
    if(list.style.height === value) {
      return;
    }

    this.listHeightAnimation?.cancel();
    this.listHeightAnimation = undefined;
    list.style.height = value;
    if(from !== undefined && Math.abs(from - height) >= 1) {
      this.listHeightAnimation = list.animate(
        [{height: from + 'px'}, {height: value}],
        {duration: GROUP_CALL_MOVE_DURATION, easing: GROUP_CALL_MOVE_EASING}
      );
    }
  }

  public destroy() {
    this.destroyed = true;
    if(this.layoutFrame !== undefined) {
      cancelAnimationFrame(this.layoutFrame);
    }

    this.resizeObserver.disconnect();
    this.tiles.forEach((tile) => tile.destroy());
    this.tiles.clear();
    this.peerTiles.clear();
  }
}
