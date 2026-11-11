import {createEffect, createMemo, createSignal, JSX, on, onCleanup, Show, untrack} from 'solid-js';
import classNames from '@helpers/string/classNames';
import liteMode from '@helpers/liteMode';
import themeController from '@helpers/themeController';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import rootScope from '@lib/rootScope';
import {onAppWindowChange, requestAppWindowFrame} from '@helpers/appWindow';
import {useObserveResize} from '@hooks/useObserveResize';
import useAnimationPlaying from '@hooks/useAnimationPlaying';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {computeFinalBackgroundColor} from '@components/messageSpoilerOverlay/utils';
import {createStar, isSupported, type Star, type StarKind} from '@vendor/telegram-3d-star/src/index';
import type {Look} from '@vendor/telegram-3d-star/src/options';
import {getStar3DFieldWidth, getStar3DLook, getStar3DMotion} from '@components/star3D/policy';
import {getStar3DPoster, loadStar3DAssets} from '@components/star3D/assets';
import styles from '@components/star3D/star3D.module.scss';

/**
 * The ancestor that clips the star's surroundings sideways (a scrollable, the popup), whose visible width the particle
 * field takes; the page's root when nothing does
 */
function findClip(element: HTMLElement): HTMLElement {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  for(let el = element.parentElement; el && el !== doc.body; el = el.parentElement) {
    if(view.getComputedStyle(el).overflowX !== 'visible') return el;
  }

  return doc.documentElement;
}

/**
 * The 3D star of Telegram Premium or Telegram Stars, decorative. Takes a `size` px box in the flow and draws the star
 * that big, turning in a box half as large again around it; a poster stands instead with animations off or no WebGL.
 * The live star has its particle field behind it: as wide as the box that clips it, twice the star's size tall,
 * centred on it and fading out below; it adds nothing to the flow and takes no input.
 */
export default function Star3D(props: {
  kind: StarKind,
  /** The star's visible size in px */
  size: number,
  /** false holds it still (an inactive carousel slide) */
  active?: boolean,
  class?: string
}): JSX.Element {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  // * light or dark, and the colour painted behind it: known once it is laid out
  const [look, setLook] = createSignal<Look>(undefined, {
    equals: (a, b) => a?.theme === b?.theme && a?.background === b?.background
  });
  const [failed, setFailed] = createSignal(false);
  const [star, setStar] = createSignal<Star>();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [field, setField] = createSignal<HTMLCanvasElement>();
  // * the intersector's word: in sight and not under another popup
  const [playing, observePlaying] = useAnimationPlaying();
  // * the document the star lives in: the client can move to a Document PiP window and back with its popups open
  const [ownerDocument, setOwnerDocument] = createSignal<Document>();

  const motion = createMemo(() => getStar3DMotion(liteMode.getAnimationLevel()), undefined, {
    equals: (a, b) => a?.autoplay === b?.autoplay && a?.interactive === b?.interactive
  });
  const live = createMemo(() => !!motion() && !failed() && isSupported());
  // * a new colour behind it is a new look for the same star, not a new star
  const hasLook = createMemo(() => !!look());

  const readLook = () => {
    // * from the star up to the first box that is opaque, blended: a popup's `.night` comes through its variables
    setLook(getStar3DLook(computeFinalBackgroundColor(root(), Infinity), themeController.isNight()));
  };

  // * it can be built before its popup is in the page, or sit in a hidden slide: the colour is read once it has a size.
  // * No polling: one read as it is mounted, then whenever something says it may have become visible. Read by a frame
  // * of the app's window, once the layout of the moment is in
  let cancelRead: () => void;
  const scheduleRead = () => {
    if(cancelRead || untrack(look)) return;
    cancelRead = requestAppWindowFrame(() => {
      cancelRead = undefined;
      const element = untrack(root);
      if(element?.isConnected && element.offsetWidth) readLook();
    });
  };
  onCleanup(() => cancelRead?.());

  createEffect(() => {
    if(root()) scheduleRead();
  });
  createEffect(on(() => props.active, () => scheduleRead(), {defer: true}));
  useObserveResize(root, scheduleRead);

  createEffect(() => {
    const element = root();
    if(!element) return;
    setOwnerDocument(element.ownerDocument);
    // * the window is set before the app's nodes are moved: the document is read once they have been
    onCleanup(onAppWindowChange(() => {
      // * a frame requested from the old window dies with it: ask again in the new one
      cancelRead?.();
      cancelRead = undefined;
      scheduleRead();
      queueMicrotask(() => setOwnerDocument(untrack(root)?.ownerDocument));
    }));
  });

  subscribeOn(rootScope)('theme_changed', () => {
    if(untrack(look)) readLook();
  });

  // * the assets start loading as it is built, before it is laid out
  createEffect(() => {
    if(live()) loadStar3DAssets().catch(() => {});
  });

  // * the package takes its motion once: a new level is a new star, on a new canvas
  // * the package binds to the window of its canvas at creation: another document is a new star as well
  createEffect(on([live, motion, hasLook, ownerDocument], ([live, motion, hasLook, ownerDocument]) => {
    if(!live || !hasLook || !ownerDocument) return;

    const isCleaned = useIsCleaned();
    const element = ownerDocument.createElement('canvas');
    element.classList.add(styles.canvas);
    if(motion.interactive) element.classList.add(styles.interactive);
    element.setAttribute('aria-hidden', 'true');
    // * the particle field: a canvas of its own behind the star's, in the same document
    const particles = ownerDocument.createElement('canvas');
    particles.classList.add(styles.field);
    particles.setAttribute('aria-hidden', 'true');
    setField(particles);
    setCanvas(element);

    let created: Star;
    const {theme, background} = untrack(look);
    loadStar3DAssets()
    .then((assets) => isCleaned() ? undefined : createStar(element, {
      kind: untrack(() => props.kind),
      theme,
      background,
      assets,
      particles,
      ...motion
    }))
    .then((star) => {
      if(!star) return;
      if(isCleaned()) {
        star.destroy();
        return;
      }

      created = star;
      setStar(star);
    }, () => {
      if(!isCleaned()) setFailed(true);
    });

    onCleanup(() => {
      setStar(undefined);
      setCanvas(undefined);
      setField(undefined);
      created?.destroy();
    });
  }));

  createEffect(() => {
    const l = look(), s = star();
    if(s && l) s.setTheme(l.theme, l.background);
  });

  createEffect(() => {
    star()?.setKind(props.kind);
  });

  createEffect(() => {
    const s = star();
    if(!s) return;
    if(playing() && props.active !== false) s.resume();
    else s.pause();
  });

  // * held still as other animations are: out of sight, the window idle, under a popup opened over its own
  createEffect(() => {
    const element = root();
    if(!element) return;
    observePlaying({
      observeElement: element,
      controlled: true,
      type: 'star'
    });
  });

  // * the field follows the visible width of what clips it, so its canvas is never wider than what can be seen
  const clip = createMemo(() => field() && root() ? findClip(root()) : undefined);
  const fitField = () => {
    const element = untrack(field), box = untrack(root), clipElement = untrack(clip);
    if(!element || !box || !clipElement) return;
    const clipRect = clipElement.getBoundingClientRect(), starRect = box.getBoundingClientRect();
    const middle = clipRect.left + clipElement.clientLeft + clipElement.clientWidth / 2;
    let offset = starRect.left + starRect.width / 2 - middle;
    // * a star outside its clip is on its way in (a carousel slide): it will stand in the middle
    if(Math.abs(offset) > clipElement.clientWidth / 2) offset = 0;
    element.style.width = getStar3DFieldWidth(clipElement.clientWidth, offset) + 'px';
  };
  // * the first width is read here, in the owning window; the observer only reports later changes
  // * a replacement canvas (another animation level or window) is fitted at once, though its clip is the same
  createEffect(() => {
    if(field() && clip()) fitField();
  });
  useObserveResize(clip, fitField);

  const poster = createMemo(() => {
    const l = look();
    return l && !live() && getStar3DPoster(props.kind, l.theme);
  });

  return (
    <div
      ref={setRoot}
      class={classNames(styles.star, props.class)}
      style={{'--star-size': props.size + 'px'}}
      aria-hidden="true"
    >
      <Show when={poster()} fallback={<>{field()}{canvas()}</>}>
        <img
          class={styles.canvas}
          src={poster().src}
          srcset={poster().srcset}
          alt=""
          draggable={false}
        />
      </Show>
    </div>
  );
}
