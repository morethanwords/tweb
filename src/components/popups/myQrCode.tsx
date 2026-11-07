import {batch, createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show, untrack} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import Button from '@components/buttonTsx';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import I18n, {LangPackKey} from '@lib/langPack';
import Modes from '@config/modes';
import rootScope from '@lib/rootScope';
import bindManagersToAccount, {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {AppManagers} from '@lib/managers';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {buildTelegramUserQrUrl} from '@helpers/qrCode/paintQrCode';
import {useObserveResize} from '@hooks/useObserveResize';
import {getMiddleware} from '@helpers/middleware';
import {flashControl} from '@lib/settingsSearch/highlight';
import {createExportActions, ExportCopyButton, ExportShareSaveButtons} from '@components/popups/myQrCode/exportButtons';
import classNames from '@helpers/string/classNames';
import liteMode from '@helpers/liteMode';
import {lerp} from '@helpers/lerp';
import noop from '@helpers/noop';
import {nodeFrame} from '@helpers/schedulers';
import {useMediaSizes} from '@helpers/mediaSizes';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {Chat, InputSavedStarGift, ShareTheme, ShareThemeBackdropOption, User} from '@layer';
import {backdropGradient, backdropToCss} from '@components/popups/myQrCode/backdrop';
import {Caption} from '@components/popups/myQrCode/caption';
import {QrCard} from '@components/popups/myQrCode/card';
import {backdropColors} from '@components/popups/myQrCode/colors';
import exportImage from '@components/popups/myQrCode/exportImage';
import {PatternField} from '@components/popups/myQrCode/field';
import {ExpiryPill, FeePill} from '@components/popups/myQrCode/feePill';
import createQrLink from '@components/popups/myQrCode/linkState';
import createLayerStack from '@components/popups/myQrCode/layerStack';
import {BUILT_IN_BACKDROPS, usableBackdrops} from '@components/popups/myQrCode/backdropTable';
import {buildPhoneUrl, linkCaption} from '@components/popups/myQrCode/link';
import {Rect} from '@components/popups/myQrCode/fieldNodes';
import {openLayout, PILL_GAP, SHEET_BOTTOM, SHEET_INSET, sheetHeightFor, surfaceGeometry} from '@components/popups/myQrCode/layout';
import {appearanceToShareTheme, Appearance, giftToInput, isDefaultBackdrop, shareThemeToAppearance, ThemeEmoji, themeEmojiKey, withBackdrop, waitsForServedId, withEmojiToggled, withGift} from '@components/popups/myQrCode/theme';
import {createThemeSaver, getHeldTheme} from '@components/popups/myQrCode/themeSaver';
import {ColorsPanel} from '@components/popups/myQrCode/colorsPanel';
import {ChosenEmojiStrip, EmojiPanel} from '@components/popups/myQrCode/emojiPanel';
import {preloadAppliedEmoji} from '@components/popups/myQrCode/emojiPresets';
import {GiftsLayout, GiftsPanel, giftsSheetHeight, ThemeGift} from '@components/popups/myQrCode/giftsPanel';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {showPremiumGiftsToast} from '@components/popups/myQrCode/premiumToast';
import {OPEN_MS, revealOpening, sampledKeyframes, SHEET_CLOSE_MS, SHEET_EASING, SHEET_OPEN_MS, sheetEase} from '@components/popups/myQrCode/reveal';
import styles from '@components/popups/myQrCode.module.scss';

// `QrShareView`'s wave: a new colour spreads from the card over 600 ms, quick at first and gliding long (1 - (1 - t)^2.4)
const WAVE_MS = 600;
const WAVE_EASING = 'cubic-bezier(.2, .65, .35, 1)';
// … past the farthest corner by this much, so its soft edge leaves the screen
const WAVE_OVERSHOOT = 60;
// the island's buttons fade into the sheet as it starts growing, and back as it ends shrinking
const ISLAND_FADE_MS = 90;
// the sheet's content rises this far into place with it (`drawSheet`), and goes over this time as it closes
const SHEET_CONTENT_RISE = 14, SHEET_CONTENT_OUT_MS = 170;
// at the reduced level the sheet fades (the stylesheet's time)
const SHEET_FADE_MS = 200;

type WaveOrigin = {x: number, y: number, width: number, height: number};

/**
 * The backdrop: gradient layers one over the other. A colour the user picks spreads from the card as a growing circle
 * with a light ring at its front (Android's wave); one that comes otherwise fades in over the old one.
 */
function Backdrop(props: {
  css: () => string,
  colorsKey: () => string,
  /** Where the wave starts (the card's middle), in the surface's box */
  origin: () => WaveOrigin,
  /** The ring's colour: the new centre, most of the way to white */
  ringColor: () => string,
  wave: () => boolean
}) {
  const host = (<div class={styles.backdrop} />) as HTMLDivElement;

  const reveal = (layer: HTMLElement) => {
    if(!untrack(props.wave) || !liteMode.isAvailable('motion')) return;
    const {x, y, width, height} = untrack(props.origin);
    const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + WAVE_OVERSHOOT;
    const timing: KeyframeAnimationOptions = {duration: WAVE_MS, easing: WAVE_EASING};

    const ring = document.createElement('div');
    ring.className = styles.waveRing;
    Object.assign(ring.style, {
      left: x - radius + 'px',
      top: y - radius + 'px',
      width: radius * 2 + 'px',
      height: radius * 2 + 'px'
    });
    ring.style.setProperty('--wave-color', untrack(props.ringColor));
    host.append(ring);
    ring.animate([
      {transform: 'scale(0)', opacity: .38},
      {opacity: .38, offset: .38},
      {transform: 'scale(1)', opacity: 0}
    ], timing).finished.finally(() => ring.remove());

    return layer.animate({
      clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
    }, timing);
  };
  const stack = createLayerStack(host, {keepCovered: true});
  onCleanup(() => stack.destroy());
  let shownKey: string;

  createEffect(() => {
    const css = props.css(), key = props.colorsKey();
    if(!css) return;

    // the same colours on another size: the layer is redrawn where it stands
    if(stack.current && key === shownKey) {
      stack.current.style.backgroundImage = css;
      return;
    }

    shownKey = key;
    const layer = document.createElement('div');
    layer.style.backgroundImage = css;
    // the first one comes with the screen, at once
    stack.set(layer, {instant: !stack.current, reveal});
  });

  return host;
}

/** Once the popup has faded in: its own `opacity` transition has ended, or its time is out (one that did not run) */
function fadedIn(popup: HTMLElement) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      popup.removeEventListener('transitionend', onEnd);
      resolve();
    };
    const onEnd = (event: TransitionEvent) => event.target === popup && event.propertyName === 'opacity' && done();
    const timer = window.setTimeout(done, parseFloat(getComputedStyle(popup).transitionDuration) * 1000 + 100);
    popup.addEventListener('transitionend', onEnd);
  });
}

function MyQrCodePopup(props: {
  managers: AppManagers,
  peerId: PeerId,
  peer: User.user,
  title: string,
  shareTheme?: ShareTheme,
  /** The own profile, or a public channel the user may change the info of: the theme can be set */
  canEdit?: boolean,
  /** `tg://settings/qr-code/share`: the Share button flashes once the screen is up, the way tdesktop points at it */
  highlightShare?: boolean
}) {
  const {managers, peerId, peer} = props;
  const mediaSizes = useMediaSizes();
  const isSelf = peerId === rootScope.myId;

  /* The theme: the cached one at once, the served one when it comes. What was chosen here stands in its place until
     the server has had it (and a moment after, `getHeldTheme`), so a full peer that left before the save does not undo it. */
  const account = getCurrentAccount();
  const accountManagers = bindManagersToAccount(rootScope.managers, account);
  const [shareTheme, setShareTheme] = createSignal(props.shareTheme);
  // once the user has chosen here, the server's theme no longer replaces what is shown, for as long as the screen is
  // open (`QrShareServer.themeChangedByUser`)
  let changedByUser = false;
  const showServedTheme = async() => {
    const theme = await managers.appProfileManager.getCachedShareTheme(peerId);
    if(!changedByUser && !saver.hasPending && !getHeldTheme(account, peerId)) setShareTheme(theme);
  };

  subscribeOn(rootScope)('peer_full_update', (updated) => {
    if(updated === peerId) showServedTheme();
  });
  managers.appProfileManager.getProfileByPeerId(peerId).catch(noop);

  const [backdrops] = createResource(() => managers.appProfileManager.getShareThemeBackdrops().catch((): ShareThemeBackdropOption[] => undefined));
  // the served colours, else Android's built-in table (`backdropTable`)
  const palette = createMemo(() => usableBackdrops(backdrops()));
  const appearance = createMemo(() => shareThemeToAppearance(shareTheme(), palette()));
  const colors = createMemo(() => backdropColors(appearance().backdrop));

  /* The link and what is written under the code */
  const username = createMemo(() => getPeerActiveUsernames(peer)[0]);
  // the own profile: username, phone or a contact link, and the fee code; anyone else: a plain link
  const own = createQrLink({managers, peer: peer as User.user, enabled: isSelf});
  const url = createMemo(() => {
    if(own.enabled) return own.url();
    if(username()) return buildTelegramUserQrUrl(username());
    if(peerId.isUser()) return buildPhoneUrl(peer.phone ?? '');
    return `https://t.me/c/${peerId.toChatId()}`;
  });

  const caption = createMemo<Caption | undefined>(() => {
    if(own.enabled) return own.caption();
    if(username()) return linkCaption('username', username());
    if(peerId.isUser() && peer.phone) return linkCaption('phone', peer.phone);
    return {text: props.title.toUpperCase(), kind: 'name'};
  });

  /* The geometry, read once and on resize */
  const [size, setSize] = createSignal({width: 0, height: 0});
  let surfaceElement: HTMLDivElement;
  useObserveResize(() => surfaceElement, (entry) => {
    const {width, height} = entry.contentRect;
    setSize({width: Math.round(width), height: Math.round(height)});
  });

  const ready = () => size().width > 0;
  // the fee pill, or for a contact link the time left, stands under the card
  const pillShown = () => own.fee.visible() || own.kind() === 'contact';
  const surface = createMemo(() => surfaceGeometry(size().width, size().height, {captioned: !!caption(), pill: pillShown()}));
  const cardRect = createMemo<Rect>(() => {
    const {width, card, cardTop} = surface();
    return {left: (width - card.width) / 2, top: cardTop, width: card.width, height: card.height};
  });
  const gradient = createMemo(() => backdropGradient(colors(), surface()));

  /* Editing: a choice shows at once and is saved after a pause (`themeSaver`) */
  const saver = createThemeSaver({
    account,
    peerId,
    save: ({theme, shown}) => accountManagers.appProfileManager.setShareTheme(peerId, theme, shown),
    // the manager has put the full peer back; the screen keeps the choice, as on Android
    onError: () => toastNew({langPackKey: 'Error.AnError'})
  });

  // the colour a gift gives way to: the last one shown
  let lastColor: Appearance;
  createEffect(() => {
    const current = appearance();
    if(current.kind !== 'gift') {
      lastColor = {kind: isDefaultBackdrop(current.backdrop) ? 'default' : 'color', backdrop: current.backdrop, backdropId: current.backdropId, emojis: []};
    }
  });

  // a colour of the built-in table has no server id: it shows at once, and is saved once the served list has come, by
  // its name (`QrShareServer.backdropWaitsForIds`)
  let waitsForIds = false;
  const commit = (next: Appearance, giftInput?: InputSavedStarGift) => {
    changedByUser = true;
    // a built-in colour remembered from before the served list came (the colour a gift gives way to) is the served one
    // of its name by now
    const list = palette();
    if(waitsForServedId(next) && list !== BUILT_IN_BACKDROPS) {
      next = withBackdrop(next, list, list.find((option) => option.name === next.backdrop.name));
    }

    const toSave = appearanceToShareTheme(next, giftInput);
    waitsForIds = waitsForServedId(next);
    if(waitsForIds) {
      setShareTheme(toSave.shown);
      saver.cancel();
    } else if(toSave) {
      setShareTheme(toSave.shown);
      saver.schedule(toSave);
    } else if(next.kind === 'gift') {
      // a gift nothing names cannot be saved, and an earlier choice still waiting is outdated
      setShareTheme({_: 'shareThemeGift', stargift: next.gift});
      saver.cancel();
    }
  };

  // the served list has come: the colour waiting for it is saved by its id, or, missing from it, becomes the default
  createEffect(on(palette, (list) => {
    if(!waitsForIds || list === BUILT_IN_BACKDROPS) return;
    const current = untrack(appearance);
    commit(withBackdrop(current, list, list.find((option) => option.name === current.backdrop.name)));
  }, {defer: true}));

  // the screen goes away with a built-in colour still waiting: it is saved by its name once the served list has come, on
  // the account it was chosen on
  const saveWhenServed = () => {
    if(!waitsForIds) return;
    const waiting = untrack(appearance);
    saver.sendWhenReady(untrack(shareTheme), accountManagers.appProfileManager.getShareThemeBackdrops().then((served) => {
      const list = usableBackdrops(served);
      if(list === BUILT_IN_BACKDROPS) return;
      return appearanceToShareTheme(withBackdrop(waiting, list, list.find((option) => option.name === waiting.backdrop.name)));
    })).catch(noop);
  };

  const pickBackdrop = (option?: ShareThemeBackdropOption) => commit(withBackdrop(appearance(), palette(), option));
  const toggleEmoji = (emoji: ThemeEmoji) => commit(withEmojiToggled(appearance(), emoji, lastColor ?? withBackdrop(appearance(), palette())));
  const pickEmoji = (docId: DocId) => toggleEmoji({documentId: docId});
  const pickGift = ({gift, input}: ThemeGift) => {
    // the gift on show tapped again goes, and the last colour comes back, as on Android
    if(appearance().kind === 'gift' && appearance().gift?.id === gift.id) {
      commit(lastColor ?? withBackdrop(appearance(), palette()));
      return;
    }

    const next = withGift(gift);
    if(next) commit(next, giftToInput(gift, isSelf, input));
  };

  /* The panels: the island's buttons open one, the card makes room above it */
  type PanelId = 'colors' | 'emoji' | 'gifts';
  const PANELS: {id: PanelId, icon: Icon, iconClass: string, title: LangPackKey}[] = [
    {id: 'colors', icon: 'colorize', iconClass: styles.iconColors, title: 'QRCode.Colors'},
    {id: 'emoji', icon: 'smile', iconClass: styles.iconEmoji, title: 'Emoji'},
    {id: 'gifts', icon: 'gift', iconClass: styles.iconGifts, title: 'StarGiftTitle'}
  ];
  const [panel, setPanel] = createSignal<PanelId>();
  // what the sheet holds: the panel open, and the one it closes with until it has shrunk into the island
  const [shownPanel, setShownPanel] = createSignal<PanelId>();
  // a panel is built when it is first opened, and kept: the emoji tab and the gifts are costly to build
  const [visited, setVisited] = createSignal<PanelId[]>([]);
  const buttons: {[id in PanelId]?: HTMLElement} = {};
  let sheetElement: HTMLDivElement;

  // the sheet is named after the panel on show; closed, it is hidden from everything
  const panelTitle = () => {
    const shown = PANELS.find((item) => item.id === panel());
    return shown && I18n.format(shown.title, true);
  };

  const fullSheetHeight = createMemo(() => sheetHeightFor(size().height, size().width));
  const sheetSize = createMemo(() => ({width: size().width - 2 * SHEET_INSET, height: fullSheetHeight()}));
  // the gifts shrink the sheet to one row for up to three, and to the empty state for none (`QrShareView.updateSheetH`)
  const [giftsLayout, setGiftsLayout] = createSignal<GiftsLayout>();
  const sheetHeight = createMemo(() => {
    const full = fullSheetHeight();
    const gifts = shownPanel() === 'gifts' && giftsSheetHeight(giftsLayout(), sheetSize().width);
    return gifts ? Math.min(full, Math.round(gifts)) : full;
  });
  const cardLayout = createMemo(() => panel() ? openLayout({...surface(), pillExtra: 0}, sheetHeight()) : undefined);

  const navigationItem: NavigationItem = {
    type: 'dropdown',
    // Escape, and the back of a phone: the panel first, the popup after
    onPop: () => {
      closePanel(true);
    }
  };

  /* The island grows into the sheet and back, as on Android (`stepSheet`, `drawSheet`): the sheet's clip goes between
     their shapes on one quick-then-soft curve, 420 ms open and 360 ms closed. The island's buttons give way to the
     sheet as it starts and come back as it ends; the content comes with the sheet, rising 14 px into place, and goes
     first as it closes, over 170 ms. A turn midway starts from where the shape stands. */
  let islandElement: HTMLDivElement;
  let morph: Animation[] = [], closeTimer: number;
  // the card moves for a panel over its transition, and only then: the screen's geometry changing (its first measure as
  // it opens, a pill or a caption that comes later, a resize) puts it in its place at once
  const [cardMoving, setCardMoving] = createSignal(false);
  // the panel on show, and the card's move to make room for it: together, so that the move has its transition
  const changePanel = (id: PanelId | undefined) => batch(() => {
    setCardMoving(liteMode.isAvailable('motion'));
    setPanel(id);
  });
  const stopMorph = () => {
    morph.forEach((animation) => animation.cancel());
    morph = [];
  };
  const finishClose = () => {
    stopMorph();
    if(!panel()) setShownPanel(undefined);
  };
  createEffect(on(() => !!panel(), (open, wasOpen) => {
    if(open === !!wasOpen) return;
    clearTimeout(closeTimer);
    if(!liteMode.isAvailable('motion') || !islandElement) {
      stopMorph();
      // at the reduced level the sheet fades, its content in it
      if(!open) closeTimer = window.setTimeout(finishClose, liteMode.isAvailable('animations') ? SHEET_FADE_MS : 0);
      return;
    }

    const sheet = sheetElement.getBoundingClientRect(), island = islandElement.getBoundingClientRect();
    const islandShape = `inset(${island.top - sheet.top}px ${sheet.right - island.right}px ${sheet.bottom - island.bottom}px ${island.left - sheet.left}px round 20px)`;
    const sheetShape = 'inset(0px round 28px)';
    const from = morph.length ? getComputedStyle(sheetElement).clipPath : open ? islandShape : sheetShape;
    const content = sheetElement.querySelector<HTMLElement>(`[data-panel="${untrack(shownPanel)}"]`);
    stopMorph();
    if(open) {
      morph.push(
        sheetElement.animate({clipPath: [from, sheetShape]}, {duration: SHEET_OPEN_MS, easing: SHEET_EASING}),
        sheetElement.animate({opacity: [0, 1]}, {duration: ISLAND_FADE_MS}),
        islandElement.animate({opacity: [1, 0]}, {duration: ISLAND_FADE_MS, fill: 'forwards'})
      );
      // the content with the sheet: whole once it is 80% of the way
      if(content) morph.push(content.animate(sampledKeyframes((u) => {
        const shown = Math.min(1, sheetEase(u) / 0.8);
        return {opacity: shown, transform: `translateY(${(1 - shown) * SHEET_CONTENT_RISE}px)`};
      }), SHEET_OPEN_MS));
      morph[0].finished.then(stopMorph, noop);
      return;
    }

    if(content) morph.push(content.animate(sampledKeyframes((u) => ({opacity: (1 - u) ** 1.7})), {duration: SHEET_CONTENT_OUT_MS, fill: 'forwards'}));
    // the last of it, where the shapes are one, hands over to the island
    const handover = {duration: SHEET_CLOSE_MS, fill: 'forwards'} as const;
    const shape = sheetElement.animate({clipPath: [from, islandShape]}, {...handover, easing: SHEET_EASING});
    morph.push(
      shape,
      sheetElement.animate({opacity: [1, 1, 0], offset: [0, 0.6, 1]}, handover),
      islandElement.animate({opacity: [0, 0, 1], offset: [0, 0.6, 1]}, handover)
    );
    shape.finished.then(finishClose, noop);
  }, {defer: true}));

  function closePanel(fromNavigation?: boolean) {
    const opened = panel();
    if(!opened) return;

    changePanel(undefined);
    if(!fromNavigation) appNavigationController.removeItem(navigationItem);
    // the focus goes back to the button that opened it
    if(Modes.a11y) buttons[opened]?.focus();
  }

  const togglePanel = (id: PanelId) => {
    if(panel() === id) {
      closePanel();
      return;
    }

    // collectibles as a theme are for Premium; the colours and the preset emoji are for everyone
    if(id === 'gifts' && !rootScope.premium) {
      showPremiumGiftsToast();
      return;
    }

    const wasOpen = !!panel();
    batch(() => {
      setVisited((all) => all.includes(id) ? all : [...all, id]);
      setShownPanel(id);
      changePanel(id);
    });
    if(!wasOpen) appNavigationController.pushItem(navigationItem);
    if(Modes.a11y) {
      // into the panel, onto the pressed one, else the first
      nodeFrame(sheetElement, () => {
        const target = sheetElement.querySelector<HTMLElement>(`[data-panel="${id}"] [aria-pressed="true"]`) || sheetElement.querySelector<HTMLElement>(`[data-panel="${id}"] button`);
        target?.focus();
      });
    }
  };

  // a press on the backdrop puts the panel away
  const onSurfacePointerDown = (event: PointerEvent) => {
    if(!panel()) return;
    const target = event.target as HTMLElement;
    if(target.closest(`.${styles.sheet}, .${styles.island}, .${styles.control}, .${styles.close}`)) return;
    closePanel();
  };

  onCleanup(() => {
    appNavigationController.removeItem(navigationItem);
    clearTimeout(closeTimer);
  });

  if(props.canEdit) preloadAppliedEmoji(managers);

  /* Copy: the picture is made at the click, from what the screen holds */
  let getQr: () => HTMLCanvasElement | undefined = noop as any;
  let getField: () => HTMLCanvasElement | undefined = noop as any;
  let cached: {key: string, qr: HTMLCanvasElement, field: HTMLCanvasElement | undefined, image: Promise<Blob>};

  const makeImage = () => {
    const qr = getQr(), field = getField();
    if(!qr) return;

    const a = appearance();
    const key = [url(), a.kind, a.backdropId, a.gift?.id, a.emojis.map(themeEmojiKey).join(), colors().ink, caption()?.text, size().width, size().height].join('|');
    if(cached?.key === key && cached.qr === qr && cached.field === field) return cached.image;

    const image = exportImage({
      surface: surface(),
      gradient: gradient(),
      ink: colors().ink,
      shadow: colors().shadow,
      caption: caption(),
      qr,
      field
    });
    cached = {key, qr, field, image};
    return image;
  };

  const exportActions = createExportActions({
    makeImage,
    url,
    fileName: () => username() || props.title,
    expires: own.expires,
    expiringToast: () => own.fee.isExpiring() ? 'QRCode.NoPaid.Toast.Expiring' : 'QRCode.LinkExpiring'
  });

  // the backdrop's wave goes for a new colour; the card itself stands still, at its size, whatever changes (Android
  // bounces it for a pick)
  const colorsKey = () => [colors().center, colors().mid, colors().edge, colors().vertical].join();
  // the card's middle on screen, with a panel's lift and shrink
  const cardMiddle = () => cardRect().top + (cardLayout()?.shift ?? 0) + surface().card.height * (cardLayout()?.scale ?? 1) / 2;
  let cardPlace: HTMLDivElement;

  // the export buttons step back for a panel, and while the free code runs on its minute: such a code is not one to
  // hand out, as on Android; nor is one of the other kind, still on screen while the code asked for is on its way
  const exportAway = () => !!panel() || own.fee.mode() === 'temporary' || own.fee.pending();

  let shareButton: HTMLElement;
  if(props.highlightShare) {
    const middleware = getMiddleware();
    onCleanup(() => middleware.destroy());
    createEffect(on(ready, (isReady) => {
      if(isReady) flashControl(shareButton, middleware.get());
    }, {defer: true}));
  }

  const label = () => `${I18n.format('QRCode.Title', true)}: ${props.title}, ${url()}`;

  /* The screen's open, as on Android (`QrShareView.setReveal`) but where it stands: the popup fades in, the controls
     grow from 0.85 on a spring (860 ms), the code builds itself in its place once the screen is in, and the emoji pop
     in once it is open. Android also raises the screen 64 px and grows the card: here the code does not fly in. The
     close is the popup's fade. Below the full level everything is there at once. */
  // when the code's build began (0: it builds nothing), and when the open ended, for the emoji
  const [introStart, setIntroStart] = createSignal<number>();
  const [opened, setOpened] = createSignal<number>();
  const growControls = () => {
    // what is on show of the controls, and the pill under the card
    const controls = [
      ...surfaceElement.querySelectorAll<HTMLElement>(`.${styles.close}, .${styles.copy}, .${styles.bar} .${styles.control}, .${styles.island}`),
      ...[...cardPlace.children].slice(1) as HTMLElement[]
    ].filter((element) => getComputedStyle(element).visibility !== 'hidden');
    return Promise.all(controls.map((element) => element.animate(sampledKeyframes((u) => {
      const x = revealOpening(u);
      return {opacity: x, transform: `scale(${lerp(0.85, 1, x)})`};
    }), {duration: OPEN_MS}).finished));
  };

  const onShow = () => {
    const now = performance.now();
    if(!liteMode.isAvailable('motion')) {
      batch(() => {
        setIntroStart(0);
        setOpened(now);
      });
      return;
    }

    // the code builds once the screen has faded in: half of the build is in its first tenth, which a screen still
    // fading in would hide
    fadedIn(surfaceElement.closest<HTMLElement>('.popup')).then(() => setIntroStart(performance.now()));
    growControls().then(() => setOpened(performance.now()), noop);
  };

  return (
    <PopupElement
      managers={managers}
      class={classNames(styles.popup, mediaSizes.isMobile && styles.fullscreen)}
      containerClass={styles.popupContainer}
      containerProps={{'aria-label': I18n.format('QRCode.Title', true)}}
      closable
      show={ready()}
      onShow={onShow}
      onClose={() => {
        saver.flush();
        saveWhenServed();
      }}
    >
      <div
        ref={surfaceElement}
        class={styles.surface}
        onPointerDown={onSurfacePointerDown}
        style={{
          '--qr-foreground': colors().foreground,
          '--qr-control': colors().control,
          '--qr-mid': colors().mid,
          '--qr-ink': colors().ink,
          // what reads on a pill of the foreground's colour: the ink, made for white, or white on the dark foreground
          '--qr-on-foreground': colors().foreground === '#ffffff' ? colors().ink : '#ffffff'
        }}
      >
        <Backdrop
          css={() => ready() ? backdropToCss(gradient()) : ''}
          colorsKey={colorsKey}
          origin={() => ({x: size().width / 2, y: cardMiddle(), width: size().width, height: size().height})}
          ringColor={() => `color-mix(in oklab, ${colors().center} 45%, #fff)`}
          wave={() => changedByUser}
        />
        <PatternField
          appearance={appearance}
          width={() => size().width}
          height={() => size().height}
          focus={() => ({x: size().width / 2, y: cardMiddle()})}
          opened={opened}
          // the backdrop moves the pattern under a finger; the card, the panels and the buttons keep their presses, and an open panel its backdrop
          canDrag={(target) => !panel() && !target.closest(`.${styles.cardPlace}, .${styles.sheet}, .${styles.island}, .${styles.control}, .${styles.close}`)}
          fieldRef={(get) => { getField = get; }}
        />
        <div
          ref={cardPlace}
          class={classNames(styles.cardPlace, cardMoving() && styles.cardPlaceMoving)}
          // a move a newer one interrupts is cancelled, not ended: the newer one's end ends it
          onTransitionEnd={(event) => event.target === event.currentTarget && setCardMoving(false)}
          style={{
            left: cardRect().left + 'px',
            // the card's top is a part of the transform, so that it moves with the compositor, not by layout
            transform: `translateY(${cardRect().top + (cardLayout()?.shift ?? 0)}px) scale(${cardLayout()?.scale ?? 1})`
          }}
        >
          <QrCard
            geometry={() => surface().card}
            ink={() => colors().ink}
            shadow={() => colors().shadow}
            url={url}
            caption={caption}
            label={label}
            introStart={introStart}
            qrRef={(get) => { getQr = get; }}
          />
          <Show when={own.fee.visible()} fallback={own.kind() === 'contact' && <ExpiryPill away={!!panel()} left={own.left} top={surface().card.height + PILL_GAP} />}>
            <FeePill away={!!panel()} fee={own.fee} top={surface().card.height + PILL_GAP} foreground={() => colors().foreground} />
          </Show>
        </div>
        <PopupElement.CloseButton class={styles.close} />
        <Show when={props.canEdit}>
          <div
            class={classNames(styles.sheet, panel() && styles.sheetOpen, !panel() && shownPanel() && styles.sheetClosing)}
            // what is shrinking away is out of reach already
            inert={Modes.a11y && !panel() && !!shownPanel()}
            ref={sheetElement}
            id="qr-sheet"
            role="region"
            aria-label={panelTitle()}
            style={{height: sheetHeight() + 'px', bottom: SHEET_BOTTOM + 'px', 'inset-inline': SHEET_INSET + 'px'}}
          >
            <For each={visited()}>
              {(id) => (
                <div class={styles.sheetPanel} data-panel={id} hidden={shownPanel() !== id}>
                  {id === 'colors' && (
                    <ColorsPanel
                      backdrops={palette}
                      selectedId={() => appearance().kind === 'gift' ? undefined : appearance().backdropId}
                      onPick={pickBackdrop}
                    />
                  )}
                  {id === 'emoji' && (
                    <>
                      <EmojiPanel
                        managers={managers}
                        emojis={() => appearance().emojis}
                        size={sheetSize}
                        onPick={pickEmoji}
                      />
                      <ChosenEmojiStrip managers={managers} emojis={() => appearance().emojis} onRemove={toggleEmoji} />
                    </>
                  )}
                  {id === 'gifts' && (
                    <GiftsPanel
                      managers={managers}
                      ownerId={peerId}
                      isSelf={isSelf}
                      selected={() => appearance().kind === 'gift' ? appearance().gift : undefined}
                      width={() => sheetSize().width}
                      onPick={pickGift}
                      onBrowse={isSelf ? () => hotReloadGuard.showSendGiftPopup({peerId, category: 'Collectibles'}) : undefined}
                      onLayout={setGiftsLayout}
                    />
                  )}
                </div>
              )}
            </For>
          </div>
          <div ref={islandElement} class={classNames(styles.island, panel() && styles.islandAway)} role="group" aria-label={I18n.format('QRCode.Title', true)}>
            <For each={PANELS}>
              {(item) => (
                <Button.Icon
                  ref={(element) => buttons[item.id] = element}
                  class={classNames('btn-icon', styles.control, item.iconClass)}
                  icon={item.icon}
                  aria-label={I18n.format(item.title, true)}
                  aria-expanded={panel() === item.id}
                  aria-controls="qr-sheet"
                  onClick={() => togglePanel(item.id)}
                />
              )}
            </For>
          </div>
        </Show>
        <ExportCopyButton actions={exportActions} class={classNames(styles.control, styles.copy, styles.iconCopy, exportAway() && styles.controlAway)} />
        <div class={styles.bar}>
          <ExportShareSaveButtons actions={exportActions} class={classNames(styles.control, exportAway() && styles.controlAway)} shareClass={styles.iconShare} saveClass={styles.iconSave} groupClass={styles.barGroup} shareRef={(element) => shareButton = element} />
        </div>
      </div>
    </PopupElement>
  );
}

/**
 * Opens the QR-code popup. Defaults to the current user (the Settings entry); pass a `peerId` to show another peer's
 * QR (the PeerProfile username and public link rows).
 */
export default async function showMyQrCodePopup(peerId: PeerId = rootScope.myId, options?: {highlightShare?: boolean}) {
  const managers = bindManagersToSession(rootScope.managers);
  const [peer, cachedTheme, title, canEdit] = await Promise.all([
    peerId === rootScope.myId ? managers.appUsersManager.getSelf() : managers.appPeersManager.getPeer(peerId),
    managers.appProfileManager.getCachedShareTheme(peerId),
    getPeerTitle({peerId, plainText: true}),
    canEditShareTheme(managers, peerId)
  ]);
  if(!peer) return;

  createPopup(() => (
    <MyQrCodePopup
      managers={managers}
      peerId={peerId}
      peer={peer as User.user}
      title={title}
      shareTheme={getHeldTheme(getCurrentAccount(), peerId) ?? cachedTheme}
      canEdit={canEdit}
      highlightShare={options?.highlightShare}
    />
  ));
}

/** The own profile, or a channel with a public username whose info the user may change (the server takes no other) */
async function canEditShareTheme(managers: AppManagers, peerId: PeerId) {
  if(peerId === rootScope.myId) return true;
  if(peerId.isUser()) return false;

  const chatId = peerId.toChatId();
  const [chat, canChangeInfo] = await Promise.all([
    managers.appChatsManager.getChat(chatId) as Promise<Chat>,
    managers.appChatsManager.hasRights(chatId, 'change_info')
  ]);
  return chat?._ === 'channel' && canChangeInfo && !!getPeerActiveUsernames(chat)[0];
}
