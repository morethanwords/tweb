import {
  createMemo,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  on
} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {AvatarNewTsx} from '@components/avatarNew';
import {ChatBackground as ChatBackgroundLayer} from '@components/chat/bubbles/chatBackground';
import Section from '@components/section';
import {IconTsx} from '@components/iconTsx';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import themeController from '@helpers/themeController';
import {paintQrCode, buildTelegramUserQrUrl} from '@helpers/qrCode/paintQrCode';
import {getWallPaperColors, darkenToMaxLuminance} from '@helpers/color';
import roundRect from '@helpers/canvas/roundRect';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {toastNew} from '@components/toast';
import {copyTextToClipboard} from '@helpers/clipboard';
import classNames from '@helpers/string/classNames';
import {BaseTheme, Chat, Theme, User, WallPaper} from '@layer';
import {AppTheme, DEFAULT_THEME} from '@config/state';
import {useAppSettings} from '@stores/appSettings';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import ChatThemesPicker from '@components/chatThemesPicker';

import styles from './myQrCode.module.scss';
import {FontFamily, FontWeightBold} from '@config/font';
import Button from '@components/buttonTsx';

// Geometry numbers are lifted from Telegram-iOS' ChatQrCodeScreen.swift so the
// card layout matches the iOS sheet 1:1. Source lines are noted next to each
// constant below.
const QR_SIZE = 220;        // ChatQrCodeScreen.swift L1970: `imageSide = 220.0`
const AVATAR_SIZE = 100;    // ChatQrCodeScreen.swift L1968: `avatarSize = 100`

/**
 * Looks up the (wallpaper, accent_color) pair from a Theme for the popup-local
 * night mode. Cloud themes ship one ThemeSettings per `BaseTheme`; we pick the
 * entry that matches the popup's brightness toggle, falling back to the first
 * available. The accent color is what the username text and the QR logo
 * follow, so the picked theme owns its own brand colour end-to-end.
 */
function pickThemeSettingsForBase(theme: Theme, base: BaseTheme['_']) {
  if(!theme.settings?.length) return undefined;
  const exact = theme.settings.find((s) => s.base_theme?._ === base);
  return exact ?? theme.settings[0];
}

// ── QR / username ink darkening ──────────────────────────────────────────────
// The QR modules and the @username are painted in the wallpaper gradient on an
// always-white card. Telegram-iOS dims that gradient by a flat 30%/50% black
// (ChatQrCodeScreen.swift L1936), but several cloud *day* wallpapers ship a
// pure-WHITE gradient stop — even at 50% that's only ~3.95:1 against white,
// below what QR scanners reliably accept (and a near-white @username is
// unreadable). So instead of a flat dim we clamp each stop's relative luminance:
// already-dark (saturated / night) stops stay vibrant and untouched, while
// too-light stops are scaled toward black until the ink clears ≥~4.5:1 contrast.
// Without this the QR does not scan on light themes.
const QR_INK_MAX_LUMINANCE = 0.18; // ⇒ ≥ ~4.5:1 contrast on a white card

// Clamp the wallpaper stops toward black until each clears QR_INK_MAX_LUMINANCE,
// so the wallpaper-gradient ink always scans / reads on the white card. The
// generic luminance-clamp lives in @helpers/color; the threshold is the local
// QR-on-white-card policy documented above.
function darkenInkStops(stops: string[]): string[] {
  return stops.map((s) => darkenToMaxLuminance(s, QR_INK_MAX_LUMINANCE));
}

/**
 * Shared signals/memos used by every part of the popup. Created once in
 * `showMyQrCodePopup` and passed by reference into each slot — keeps the
 * brightness toggle, picker selection, QR-painter inputs and the copy
 * pipeline reading off the same source of truth without a wrapper component
 * tying them together.
 */
type QrPopupShared = ReturnType<typeof createSharedState>;

function createSharedState(self: User.user, peerId: PeerId = rootScope.myId, overrideUrl?: string) {
  const [appSettings, setAppSettings] = useAppSettings();
  const username = createMemo(() => getPeerActiveUsernames(self)[0]);
  // iOS shows a temporary `t.me/contact/<token>` for your OWN QR when you have no
  // username AND phone-discovery (AddedByPhone) is disabled — so the t.me/+phone
  // codeLink below wouldn't let a stranger add you (PeerInfoScreen.swift L4582-4585).
  // Fetch it lazily; until it resolves (or when not applicable) the codeLink is
  // shown — same order as iOS' setContactToken update. Only fetched for self with
  // no username (the source returns undefined → no request otherwise).
  const [contactTokenUrl] = createResource(
    () => (peerId === rootScope.myId && !username()) || undefined,
    async() => {
      try {
        const rules = await rootScope.managers.appPrivacyManager.getPrivacy('inputPrivacyKeyAddedByPhone');
        if(rules.some((rule) => rule._ === 'privacyValueAllowAll')) return undefined; // phone-discovery on → t.me/+phone is enough
        const token = await rootScope.managers.appUsersManager.exportContactToken();
        return token?.url;
      } catch{
        return undefined; // any failure → fall back to the codeLink, never break profileUrl
      }
    }
  );

  // `overrideUrl` is for peers whose link isn't a public username — e.g. a private
  // group's invite link, which PeerProfile.Link already resolved. Otherwise mirror
  // Telegram-iOS' QR codeLink (ChatQrCodeScreen.swift L1740-1748): username →
  // t.me/<username>; a user without one → t.me/+<phone>; a channel → t.me/c/<id>.
  const profileUrl = createMemo(() => {
    if(overrideUrl) return overrideUrl;
    const tokenUrl = contactTokenUrl();
    if(tokenUrl) return tokenUrl;
    if(username()) return buildTelegramUserQrUrl(username());
    if(peerId.isUser()) return `https://t.me/+${(self as User.user).phone ?? ''}`;
    return `https://t.me/c/${peerId.toChatId()}`;
  });

  // The fallback brightness must stay reactive to a GLOBAL theme change while the
  // popup is open (auto-night by schedule/system, another surface switching
  // theme). `themeController.isNight()` is a plain method, not a signal, so mirror
  // it into one off `theme_changed`.
  const [globalNight, setGlobalNight] = createSignal(themeController.isNight());
  subscribeOn(rootScope)('theme_changed', () => setGlobalNight(themeController.isNight()));

  // `appSettings.qrCode` is the persisted (across reloads and across accounts
  // via MTProto state sync) source of truth. `nightMode` falls back to the
  // global theme's brightness when never explicitly set so the very first open
  // matches what the user sees in chat. `selectedThemeId === ''` is the
  // DEFAULT_THEME sentinel — "use the current chat theme's wallpaper".
  const nightMode = (): boolean => appSettings.qrCode?.nightMode ?? globalNight();
  const selectedThemeId = (): string => appSettings.qrCode?.selectedThemeId ?? '';

  const setNightMode = (v: boolean) => setAppSettings('qrCode', 'nightMode', v);
  const setSelectedThemeId = (v: string) => setAppSettings('qrCode', 'selectedThemeId', v);

  // Mirror of the cloud-themes list so the popup can resolve the active theme's
  // wallpaper without re-fetching what the picker already loaded.
  const [allThemes] = createResource(() => rootScope.managers.appThemesManager.getThemes());

  // Base theme drives both the popup background and the picker thumbnails;
  // honors the popup-local night-mode toggle (without touching the global theme).
  const baseTheme = (): BaseTheme['_'] => nightMode() ? 'baseThemeNight' : 'baseThemeClassic';

  // (theme, wallPaper, accentColor) tuple. The wallpaper drives the
  // ChatBackground layer; the accent color drives the username text + QR
  // logo, so picking a tile recolors them in lockstep. Empty selection →
  // DEFAULT_THEME's day/night variant per the popup-local toggle; otherwise
  // look up by theme.id and pick the matching base variant.
  const activeWallPaper = createMemo<{
    theme: AppTheme | Theme,
    wallPaper?: WallPaper,
    /** Wallpaper gradient stops — drives the username CSS background-clip text. */
    wallpaperStops: string[]
  }>(() => {
    const id = selectedThemeId();
    const base = baseTheme();
    const resolve = (theme: Theme) => {
      const s = pickThemeSettingsForBase(theme, base);
      return {
        theme,
        wallPaper: s?.wallpaper,
        wallpaperStops: getWallPaperColors(s?.wallpaper)
      };
    };
    if(!id) return resolve(DEFAULT_THEME);
    const themes = allThemes() ?? [];
    const found = themes.find((t) => String(t.id ?? '') === id);
    return resolve(found ?? DEFAULT_THEME);
  });

  // qr-code-styling is lazy-loaded so the popup paints instantly and the QR
  // appears once the ~25KB library has finished loading.
  const [QRCodeStylingCtor] = createResource(() =>
    import('qr-code-styling' as any).then((m) => m.default)
  );

  return {
    self,
    peerId,
    username,
    profileUrl,
    nightMode,
    setNightMode,
    selectedThemeId,
    setSelectedThemeId,
    baseTheme,
    activeWallPaper,
    QRCodeStylingCtor
  };
}

// ────────────────────────────────────────────────────────────────────────────
// TopSection — single canvas hosting wallpaper, card, avatar, QR and username.
//
// Live `<ChatBackgroundLayer>` + `<AvatarNewTsx>` are mounted in a 0-size
// off-screen host so they keep rendering their canvases / loading the photo,
// and we sample them when repainting our visible canvas. Everything else is
// Canvas2D primitives — rounded rect for the card, arc for the avatar ring,
// `paintQrCode` for the QR (then mask through the wallpaper), `createLinear­
// Gradient` + `fillText` for the username. Copy becomes `canvas.toBlob()`.
// ────────────────────────────────────────────────────────────────────────────

// Geometry calibrated against Telegram-iOS' ChatQrCodeScreen.swift. iOS uses
// pt; we use px at 1:1 since both clients run on roughly the same logical
// canvas (iOS sheet 390pt × 844pt, tweb popup 376px wide).
//   • card  — 300×330pt rounded rectangle, 42pt corner radius (L2001-2003, L1634)
//   • avatar — 100pt diameter; 70% overhang above the card top edge (L1968, L2038)
//   • QR    — 220×220pt black ink on white (L1970, L1754)
//   • username — SF Pro Rounded Bold ~22-24pt black (L1679, L1683)
// iOS leaves the card UNshadowed and ALWAYS white, regardless of the global
// light/dark theme — only the wallpaper varies. We mirror that here so the
// QR + username stay maximally readable against any wallpaper.
//
// Two layouts are baked from the same paint logic:
//   • DISPLAY_LAYOUT — what we paint into the visible canvas inside the popup.
//     Compact (376×472 CSS px @ 2× DPR = 752×944) with the requested 2.5rem
//     top + 2rem bottom wallpaper rails.
//   • EXPORT_LAYOUT  — what we bake into the PNG blob handed to clipboard.
//     Matches iOS's `generateImage`: 390×844pt sheet at 3× scale (1170×2532px),
//     with the white card centered vertically in the sheet, avatar overhanging,
//     and the wallpaper filling the rest. Display dimensions don't follow this
//     because the user explicitly asked for a compact in-popup view.
type CanvasLayout = {
  canvasW: number;
  canvasH: number;
  dpr: number;
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  cardR: number;
  avatarCx: number;
  avatarCy: number;
  qrX: number;
  qrY: number;
  qrSize: number;
  usernameY: number;
};

// Shared iOS card dimensions (used by both layouts).
const CARD_W = 300;                         // iOS L2001
const CARD_H = 330;                         // iOS L2003 (300 × 1.1)
const CARD_R = 42;                          // iOS L1634
const AVATAR_RING = 4;                      // 4px white halo (user request)
const AVATAR_R = AVATAR_SIZE / 2;           // 50
const AVATAR_OVERHANG = Math.floor(AVATAR_SIZE * 0.7);  // 70 — L2038

// Display layout — the in-popup compact view.
const DISPLAY_CANVAS_W = 376;
const DISPLAY_TOP_PAD = 40;                 // 2.5rem rail above the avatar
const DISPLAY_BOTTOM_PAD = 32;              // 2rem rail below the card
const DISPLAY_CARD_Y = DISPLAY_TOP_PAD + AVATAR_OVERHANG;        // 110
const DISPLAY_LAYOUT: CanvasLayout = {
  canvasW: DISPLAY_CANVAS_W,
  canvasH: DISPLAY_CARD_Y + CARD_H + DISPLAY_BOTTOM_PAD,         // 472
  dpr: 2,
  cardX: (DISPLAY_CANVAS_W - CARD_W) / 2,                        // 38
  cardY: DISPLAY_CARD_Y,
  cardW: CARD_W,
  cardH: CARD_H,
  cardR: CARD_R,
  avatarCx: DISPLAY_CANVAS_W / 2,
  avatarCy: DISPLAY_CARD_Y - AVATAR_OVERHANG + AVATAR_R,         // 90
  qrX: (DISPLAY_CANVAS_W - QR_SIZE) / 2,                         // 78
  qrY: DISPLAY_CARD_Y + 50,                                      // 160
  qrSize: QR_SIZE,
  usernameY: DISPLAY_CARD_Y + 50 + QR_SIZE + 20                  // 400
};

// Export layout — iOS-faithful 390×844 sheet at 3× scale. Card centered
// vertically per ChatQrCodeScreen.swift L2003 (`(size.height - card) / 2`).
const EXPORT_CANVAS_W = 390;
const EXPORT_CANVAS_H = 844;
const EXPORT_CARD_Y = Math.floor((EXPORT_CANVAS_H - CARD_H) / 2);  // 257
const EXPORT_LAYOUT: CanvasLayout = {
  canvasW: EXPORT_CANVAS_W,
  canvasH: EXPORT_CANVAS_H,
  dpr: 3,
  cardX: (EXPORT_CANVAS_W - CARD_W) / 2,                          // 45
  cardY: EXPORT_CARD_Y,
  cardW: CARD_W,
  cardH: CARD_H,
  cardR: CARD_R,
  avatarCx: EXPORT_CANVAS_W / 2,                                  // 195
  avatarCy: EXPORT_CARD_Y - AVATAR_OVERHANG + AVATAR_R,           // 237
  qrX: (EXPORT_CANVAS_W - QR_SIZE) / 2,                           // 85
  qrY: EXPORT_CARD_Y + 50,                                        // 307
  qrSize: QR_SIZE,
  usernameY: EXPORT_CARD_Y + 50 + QR_SIZE + 20                    // 547
};

// Same system font stack the rest of the popup uses — no rounded override.
const USERNAME_FONT_FAMILY = FontFamily;
// Floor for the shrink-to-fit below; pathological lengths (e.g. a 64-char first
// name) ellipsize rather than shrink to an unreadable size.
const USERNAME_MIN_FONT = 12;

// iOS length buckets (ChatQrCodeScreen.swift L1973-1978) — used as the *starting*
// size. iOS then lays the text out in a fixed-width column, wrapping to 2 lines /
// truncating; our canvas paints a single centred line, so we shrink from this
// bucket to fit the same column width instead (see fitUsernameFontSize).
function pickUsernameFontSize(text: string): number {
  const n = text.length;
  if(n >= 18) return 16;
  if(n >= 12) return 22;
  return 24;
}

// Largest size ≤ the length bucket at which `text` fits `maxWidth` on one line,
// floored at USERNAME_MIN_FONT. Sets ctx.font to the chosen size as a side effect
// so the caller can measure/paint without re-assigning it.
function fitUsernameFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): number {
  let size = pickUsernameFontSize(text);
  while(size > USERNAME_MIN_FONT) {
    ctx.font = `${FontWeightBold} ${size}px ${USERNAME_FONT_FAMILY}`;
    if(ctx.measureText(text).width <= maxWidth) return size;
    size--;
  }
  ctx.font = `${FontWeightBold} ${USERNAME_MIN_FONT}px ${USERNAME_FONT_FAMILY}`;
  return USERNAME_MIN_FONT;
}

// Trim `text` (at the already-set ctx.font) to the longest prefix that fits
// `maxWidth` with a trailing ellipsis. No-op when it already fits.
function ellipsizeToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if(ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0, hi = text.length;
  while(lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if(ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

function TopSection(props: {
  shared: QrPopupShared,
  /** Returns the latest pre-baked PNG blob of the captured canvas, or undefined
   *  if no paint has completed yet. Used by FooterSlot's copy handler so the
   *  click can stay fully synchronous — no toBlob round-trip on the click. */
  blobRef: (getter: () => Blob | undefined) => void,
  onWallpaperReady?: () => void
}) {
  const {activeWallPaper, nightMode, profileUrl, QRCodeStylingCtor, username, self} = props.shared;

  let canvas!: HTMLCanvasElement;
  let wallpaperHost!: HTMLDivElement;
  let avatarHost!: HTMLDivElement;

  let qrRepaintId = 0;
  let latestBlob: Blob | undefined;
  let blobRepaintId = 0;
  props.blobRef(() => latestBlob);
  let wallpaperReady = false;
  let disposed = false;

  // QR canvas is generated asynchronously by qr-code-styling. We bake it into
  // a signal so the main canvas repaint stays synchronous — that's what kills
  // the race where a second effect fire would reset the canvas mid-paint of
  // a first one that's still awaiting paintQrCode.
  const [inkQrCanvas, setInkQrCanvas] = createSignal<HTMLCanvasElement | undefined>(undefined);

  const regenerateQr = async() => {
    const ctor = QRCodeStylingCtor();
    if(!ctor) return;
    const id = ++qrRepaintId;
    const scratch = document.createElement('div');
    // iOS uses solid black QR ink on the white card (ChatQrCodeScreen.swift
    // L1754 `color: .black`) and a solid-black logo circle (L2044-2058
    // `generateFilledCircleImage(... color: .black)`). No theme dependence.
    await paintQrCode({
      data: profileUrl(),
      size: QR_SIZE,
      host: scratch,
      background: 'rgba(0,0,0,0)',
      foreground: '#000000',
      logoColor: '#000000',
      // One QR bitmap feeds both the display (2×) and the 1170×2532 export (3×).
      // Bake it at ≥3× so the export PNG stays crisp on 1×/2× displays.
      pixelRatio: Math.max(window.devicePixelRatio, EXPORT_LAYOUT.dpr),
      QRCodeStylingCtor: ctor
    });
    if(id !== qrRepaintId) return;
    const inkQr = scratch.lastChild;
    if(inkQr instanceof HTMLCanvasElement) setInkQrCanvas(inkQr);
  };

  // The offscreen canvas we render the export-sized image into. Display and
  // export share `paintTo` — only the layout differs.
  const exportCanvas = document.createElement('canvas');

  // SYNC paint to an arbitrary canvas + layout. No awaits inside; the QR
  // canvas comes pre-baked from `inkQrCanvas()`.
  // Layering:
  //   wallpaper → white card (no shadow, iOS L1633-1637) → 4px white ring +
  //   avatar (iOS uses no ring, we add a 4px halo per design request) → QR
  //   (wallpaper-gradient-masked, luminance-clamped for scannability) →
  //   username (same luminance-clamped wallpaper-gradient text).
  // The card is white regardless of the popup's night-mode toggle (mirrors
  // iOS) — night mode only flips the wallpaper variant + the popup's bottom
  // chrome.
  const paintTo = (target: HTMLCanvasElement, layout: CanvasLayout) => {
    const ctx = target.getContext('2d');
    if(!ctx) return;

    const stops = activeWallPaper().wallpaperStops;

    // canvas.width/height assignment also clears + resets the backing store —
    // do this every paint so DPR changes / first-paint sizing work the same.
    target.width = layout.canvasW * layout.dpr;
    target.height = layout.canvasH * layout.dpr;
    ctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
    ctx.clearRect(0, 0, layout.canvasW, layout.canvasH);

    // 1. Wallpaper
    drawWallpaper(ctx, wallpaperHost, layout.canvasW, layout.canvasH);

    // 2. Card — always-white, no shadow.
    ctx.save();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, layout.cardX, layout.cardY, layout.cardW, layout.cardH, layout.cardR, true);
    ctx.restore();

    // 3. Avatar — 4px white ring + circular photo (or initials fallback).
    drawAvatar(ctx, avatarHost, layout.avatarCx, layout.avatarCy);

    // 4. QR — black ink baked by qr-code-styling, then re-tinted by masking
    // through a flat linear gradient built from the wallpaper's stop palette.
    // We mask the gradient instead of the wallpaper itself so the pattern
    // doodles don't bleed through and leave the dots see-through.
    const qr = inkQrCanvas();
    if(qr) {
      const maskedQr = composeQrWithGradient(qr, stops, '#000000');
      ctx.drawImage(maskedQr, layout.qrX, layout.qrY, layout.qrSize, layout.qrSize);
    }

    // 5. Username — luminance-clamped wallpaper gradient (same darkenInkStops as
    // the QR ink), so the text reads dark on the white card on every theme.
    // @username for public peers; else the user's first name or the chat title
    // (channels/groups have `title`, not `first_name`).
    const text = username() ?
      '@' + username().toUpperCase() :
      (self.first_name || (self as unknown as Chat.channel).title || '');
    if(text) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      // Available text column, mirroring iOS L2032: cardW − floor(qrInsetX × 1.2)
      // (= 300 − 48 = 252 on the standard card). Shrink the font to fit it on one
      // line, then ellipsize if even the min size overflows — a long @username or
      // 64-char first name must never bleed past the card onto the wallpaper.
      const qrInsetX = (layout.cardW - layout.qrSize) / 2;
      const maxTextWidth = layout.cardW - Math.floor(qrInsetX * 1.2);
      const size = fitUsernameFontSize(ctx, text, maxTextWidth); // sets ctx.font
      const shown = ellipsizeToWidth(ctx, text, maxTextWidth);
      const width = ctx.measureText(shown).width;
      const dark = darkenInkStops(stops);
      if(dark.length >= 2) {
        const grad = ctx.createLinearGradient(
          layout.avatarCx - width / 2, layout.usernameY,
          layout.avatarCx + width / 2, layout.usernameY + size
        );
        for(let i = 0; i < dark.length; i++) {
          grad.addColorStop(i / (dark.length - 1), dark[i]);
        }
        ctx.fillStyle = grad;
        ctx.fillText(shown, layout.avatarCx, layout.usernameY);
      } else {
        ctx.fillStyle = dark[0] ?? '#000000';
        ctx.fillText(shown, layout.avatarCx, layout.usernameY);
      }
      ctx.restore();
    }
  };

  const paint = () => {
    // `disposed` guards the late avatar-`load` listener (and any stray callback)
    // from painting into a detached canvas after the popup closes.
    if(disposed || !canvas) return;
    // 1. Paint the visible compact canvas.
    paintTo(canvas, DISPLAY_LAYOUT);

    // 2. Re-paint the offscreen iOS-dimensioned canvas, then pre-bake its PNG
    // blob. The Copy click handler ships THIS blob to `clipboard.write` —
    // synchronously, in the same JS tick as the click event — so we never
    // race the user-activation / focus window that Chrome enforces for
    // `clipboard.write`. Each paint bumps `blobRepaintId` so any in-flight
    // toBlob from a previous frame is discarded. iOS uses 390×844pt @ 3× =
    // 1170×2532px (ChatQrCodeScreen.swift L1909-1914) — we match exactly.
    paintTo(exportCanvas, EXPORT_LAYOUT);
    const id = ++blobRepaintId;
    exportCanvas.toBlob((b) => {
      if(id !== blobRepaintId) return;
      latestBlob = b ?? undefined;
    }, 'image/png');
  };

  // Async: regenerate QR canvas whenever its inputs change. NOT nightMode — the
  // QR is baked with solid #000000 ink; the night/day recolor happens in the
  // sync repaint below via composeQrWithGradient. Including nightMode here would
  // needlessly re-run the async qr-code-styling + logo fetch on every toggle.
  createEffect(on(
    [QRCodeStylingCtor, profileUrl],
    () => {
      regenerateQr();
    }
  ));

  // Sync: repaint whenever any visible signal changes (incl. the new QR canvas).
  createEffect(on(
    [nightMode, username, inkQrCanvas,
      () => activeWallPaper().wallpaperStops.join(',')],
    () => {
      paint();
    }
  ));

  // ChatBackgroundLayer fires onReady after its gradient + pattern canvases
  // are actually painted — push a fresh sync paint so the wallpaper mask
  // catches the latest pixels (state-change effect runs before the canvas is
  // ready on first mount). Only AFTER this does the popup get to fade in:
  // firing the gate from `paint()` would unfreeze the open transition while
  // the canvas still has no wallpaper, defeating the "match the iOS reveal"
  // behaviour we want.
  const onLayerReady = () => {
    paint();
    if(!wallpaperReady) {
      wallpaperReady = true;
      props.onWallpaperReady?.();
    }
  };

  // Safety net: if ChatBackgroundLayer's onReady is ever late or lost (e.g. a
  // wallpaper build that never settles), reveal the popup anyway rather than
  // leaving it permanently invisible. onLayerReady is idempotent (guarded by
  // `wallpaperReady`), so an early real onReady makes this a no-op.
  const readyFallbackTimer = setTimeout(onLayerReady, 600);

  // Avatar photo loads asynchronously (blob URL gets assigned after the
  // AvatarNewTsx mount), so the first paint paints the ring with no photo
  // inside. Watch the host for img mutations and repaint once the photo's
  // `load` event fires. Same for the avatar gradient swap (no-photo →
  // photo) when AvatarNewTsx swaps its child.
  let avatarObserver: MutationObserver | undefined;
  const attachAvatarPhotoListener = () => {
    if(!avatarHost) return;
    const photo = avatarHost.querySelector('img.avatar-photo') as HTMLImageElement | null;
    if(!photo) return;
    if(photo.complete && photo.naturalWidth > 0) {
      paint();
      return;
    }
    photo.addEventListener('load', () => paint(), {once: true});
  };
  // Solid mounts the host before AvatarNewTsx writes the img; observe child
  // mutations so we catch the late img addition without busy-polling.
  const startAvatarObserver = () => {
    if(!avatarHost || avatarObserver) return;
    attachAvatarPhotoListener();
    avatarObserver = new MutationObserver(() => attachAvatarPhotoListener());
    avatarObserver.observe(avatarHost, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']});
  };
  onCleanup(() => {
    disposed = true;
    clearTimeout(readyFallbackTimer);
  });
  // Defer to a microtask so refs are populated.
  queueMicrotask(startAvatarObserver);
  onCleanup(() => avatarObserver?.disconnect());

  return (
    <>
      {/* Off-DOM hosts: ChatBackground keeps mounting / repainting wallpaper
          canvases, AvatarNew keeps loading the photo. We never display them
          directly — we just sample their internal canvas / img via `wallpaper­
          Host` / `avatarHost` refs during repaint. */}
      <div
        ref={wallpaperHost}
        class={styles.hiddenHost}
        style={{width: EXPORT_LAYOUT.canvasW + 'px', height: EXPORT_LAYOUT.canvasH + 'px'}}
      >
        {/* Sized for the larger (export) layout so the gradient + pattern
            canvases render high-enough resolution for both display sampling
            AND the iOS-sized export. drawWallpaper scales them down for the
            smaller display layout. */}
        <ChatBackgroundLayer
          theme={activeWallPaper().theme as AppTheme}
          wallPaper={activeWallPaper().wallPaper}
          transition="instant"
          width={EXPORT_LAYOUT.canvasW}
          height={EXPORT_LAYOUT.canvasH}
          onReady={onLayerReady}
        />
      </div>
      <div
        ref={avatarHost}
        class={styles.hiddenHost}
        style={{width: AVATAR_SIZE + 'px', height: AVATAR_SIZE + 'px'}}
      >
        <AvatarNewTsx peerId={props.shared.peerId} size={AVATAR_SIZE} isBig />
      </div>

      <canvas
        ref={(el) => { canvas = el; }}
        class={styles.captureCanvas}
        style={{width: DISPLAY_LAYOUT.canvasW + 'px', height: DISPLAY_LAYOUT.canvasH + 'px'}}
      />
    </>
  );
}

// Safari < 17's 2D canvas exposes `ctx.filter` but silently ignores it. Detect
// once by setting a known filter and checking it stuck.
let _canvasFilterSupported: boolean | undefined;
function supportsCanvasFilter(): boolean {
  if(_canvasFilterSupported === undefined) {
    const probe = document.createElement('canvas').getContext('2d');
    if(probe) {
      probe.filter = 'invert(1)';
      _canvasFilterSupported = probe.filter === 'invert(1)';
    } else {
      _canvasFilterSupported = false;
    }
  }
  return _canvasFilterSupported;
}

// Manual `filter: invert(1)` equivalent: draw `src` (with the already-computed
// object-fit-cover crop) into a w×h buffer and invert its RGB. For browsers
// whose canvas ignores ctx.filter, so dark-pattern wallpapers still render.
function invertLayer(
  src: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number,
  w: number, h: number
): HTMLCanvasElement {
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  const image = tctx.getImageData(0, 0, w, h);
  const d = image.data;
  for(let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  tctx.putImageData(image, 0, 0);
  return tmp;
}

/**
 * Walks the hidden wallpaper host and composites every active-slot canvas
 * onto `ctx`, honouring CSS opacity / mix-blend-mode / filter so the result
 * matches what ChatBackgroundLayer paints on-screen for its visible peers
 * (gradient + soft-light pattern overlay etc).
 */
function drawWallpaper(ctx: CanvasRenderingContext2D, host: HTMLElement, w: number, h: number) {
  // Slot backdrop (e.g. IsPattern paints black so dark-pattern designs land on
  // solid black; IsImage falls back to body bg).
  const slots = host.querySelectorAll('[class*="Slot"]');
  for(const slot of slots) {
    if(!(slot as HTMLElement).className.match(/Active/)) continue;
    const bg = window.getComputedStyle(slot as HTMLElement).backgroundColor;
    if(bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      ctx.save();
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    for(const layer of slot.querySelectorAll('canvas, img')) {
      const isCanvas = layer.tagName === 'CANVAS';
      const isImg = layer.tagName === 'IMG';
      if(isCanvas) {
        const c = layer as HTMLCanvasElement;
        if(c.width === 0 || c.height === 0) continue;
      }
      if(isImg) {
        const i = layer as HTMLImageElement;
        if(!i.complete || i.naturalWidth === 0) continue;
      }
      const style = window.getComputedStyle(layer as HTMLElement);
      const alpha = parseFloat(style.opacity || '1');
      const mix = style.mixBlendMode;
      const filter = style.filter;
      const srcW = isCanvas ? (layer as HTMLCanvasElement).width : (layer as HTMLImageElement).naturalWidth;
      const srcH = isCanvas ? (layer as HTMLCanvasElement).height : (layer as HTMLImageElement).naturalHeight;
      // Mimic CSS object-fit: cover so the doodle pattern aspect ratio survives
      // the source→destination scale.
      let sx = 0, sy = 0, sw = srcW, sh = srcH;
      const srcA = srcW / srcH, dstA = w / h;
      if(srcA > dstA) {
        sw = srcH * dstA;
        sx = (srcW - sw) / 2;
      } else if(srcA < dstA) {
        sh = srcW / dstA;
        sy = (srcH - sh) / 2;
      }
      ctx.save();
      ctx.globalAlpha = isNaN(alpha) ? 1 : alpha;
      if(mix && mix !== 'normal') ctx.globalCompositeOperation = mix as GlobalCompositeOperation;
      const isInvert = filter && /invert\(\s*(1|100%)\s*\)/.test(filter);
      if(isInvert && !supportsCanvasFilter()) {
        // Safari's 2D canvas silently ignores ctx.filter, so a dark-pattern's
        // `invert(1)` would be dropped — invert manually via an offscreen buffer.
        ctx.drawImage(invertLayer(layer as CanvasImageSource, sx, sy, sw, sh, w, h), 0, 0);
      } else {
        if(filter && filter !== 'none') ctx.filter = filter;
        ctx.drawImage(layer as CanvasImageSource, sx, sy, sw, sh, 0, 0, w, h);
      }
      ctx.restore();
    }
  }
}

/**
 * White ring + circle-clipped avatar photo (or initials+gradient fallback) at
 * the supplied (cx, cy) centre. The ring matches the card surface so the
 * avatar visually "punches" through the wallpaper rail above and into the
 * card below. Caller picks the centre to match its layout (display vs export).
 */
function drawAvatar(ctx: CanvasRenderingContext2D, host: HTMLElement, cx: number, cy: number) {
  // 4px white ring around the avatar — same colour as the card surface.
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR_R + AVATAR_RING, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const photo = host.querySelector('img.avatar-photo') as HTMLImageElement | null;
  if(photo && photo.complete && photo.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, AVATAR_R, 0, Math.PI * 2);
    ctx.clip();
    // object-fit: cover from src to (cx-r, cy-r, 2r, 2r)
    const src = photo;
    const srcA = src.naturalWidth / src.naturalHeight;
    let sx = 0, sy = 0, sw = src.naturalWidth, sh = src.naturalHeight;
    if(srcA > 1) {
      sw = src.naturalHeight;
      sx = (src.naturalWidth - sw) / 2;
    } else if(srcA < 1) {
      sh = src.naturalWidth;
      sy = (src.naturalHeight - sh) / 2;
    }
    ctx.drawImage(src, sx, sy, sw, sh, cx - AVATAR_R, cy - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
    ctx.restore();
    return;
  }

  // Fallback: gradient tile + initials, mirroring AvatarNew's no-photo state.
  // AvatarNewTsx paints the placeholder via `.avatar-gradient { background:
  // linear-gradient(--color-top, --color-bottom) }` (so background-COLOR is
  // transparent, not the fill) and renders the initials as a bare text node (no
  // `.avatar-abbreviation` class). So read the resolved gradient off
  // `background-image` and the initials off the element's text.
  const avatarEl = host.querySelector('.avatar') as HTMLElement | null;
  const cs = avatarEl ? window.getComputedStyle(avatarEl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR_R, 0, Math.PI * 2);
  ctx.clip();
  const gradientColors: string[] = cs ? (cs.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi) ?? []) : [];
  if(gradientColors.length >= 2) {
    const grad = ctx.createLinearGradient(cx, cy - AVATAR_R, cx, cy + AVATAR_R);
    grad.addColorStop(0, gradientColors[0]);
    grad.addColorStop(1, gradientColors[gradientColors.length - 1]);
    ctx.fillStyle = grad;
  } else {
    const bg = cs?.backgroundColor;
    ctx.fillStyle = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ? bg : 'rgb(51, 144, 236)';
  }
  ctx.fillRect(cx - AVATAR_R, cy - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
  const abbreviation = avatarEl?.textContent?.trim() ?? '';
  if(abbreviation) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.round(AVATAR_R * 0.8)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(abbreviation, cx, cy);
  }
  ctx.restore();
}

/**
 * Compose the QR ink with a SOLID linear gradient built from the wallpaper's
 * stop palette — NOT the full ChatBackground rendering. The pattern overlay
 * (doodle outlines, mix-blend modes) would otherwise punch holes through every
 * QR dot, leaving them mostly black on dark themes and producing the "the QR
 * is see-through" look. By rebuilding the gradient on a flat canvas first and
 * `destination-in`'ing the QR onto it, every ink pixel reads as a pure
 * gradient colour at full opacity — matching the iOS "QR + logo painted in
 * the wallpaper's accent gradient" feel the user asked for.
 */
/**
 * Build the QR ink overlay: a luminance-clamped wallpaper-gradient fill (see
 * darkenInkStops — guarantees the modules clear ≥~4.5:1 on the white card so the
 * code actually scans), masked against the QR canvas so only the dots / squares
 * / logo show through.
 */
function composeQrWithGradient(
  inkQrCanvas: HTMLCanvasElement,
  stops: string[],
  fallback: string
): HTMLCanvasElement {
  const masked = document.createElement('canvas');
  masked.width = inkQrCanvas.width;
  masked.height = inkQrCanvas.height;
  const mctx = masked.getContext('2d');
  if(!mctx) return inkQrCanvas;
  // Clamp the wallpaper stops to a scannable luminance (see darkenInkStops) —
  // this replaces the old flat 20% dim, which left light-theme QRs at ~1.6:1
  // contrast and unscannable.
  const dark = darkenInkStops(stops);
  if(dark.length >= 2) {
    // Diagonal sweep so multi-stop gradients still read as a sweep across the
    // QR rather than a horizontal band — same direction as the wallpaper's
    // own gradient renderer.
    const g = mctx.createLinearGradient(0, 0, masked.width, masked.height);
    for(let i = 0; i < dark.length; i++) {
      g.addColorStop(i / (dark.length - 1), dark[i]);
    }
    mctx.fillStyle = g;
  } else {
    mctx.fillStyle = dark[0] ?? fallback;
  }
  mctx.fillRect(0, 0, masked.width, masked.height);
  mctx.globalCompositeOperation = 'destination-in';
  mctx.drawImage(inkQrCanvas, 0, 0);
  return masked;
}

/**
 * Re-scopes the popup container's CSS variables to the popup-local selected
 * theme + night-mode. Without this the COPY button keeps the globally-applied
 * `--primary-color` even after the user picks a green/blue/pink theme, so the
 * pill stays purple on every tile. Mounted invisibly inside the body; uses
 * `closest('.popup-container')` so it finds the outer popup container the
 * PopupElement renders us into, then drives `applyTheme` reactively.
 *
 * We don't pass an isNight override to `themeController.applyTheme` —
 * modifying the controller's signature would risk breaking the global
 * theme-switch View Transition. Instead we build a *virtual* theme: clone the
 * picked theme, pin its `name` to 'night'/'day' (so applyTheme's internal
 * `themeName` / `isNightThemeName` / `baseColors` lookups all land on the
 * popup-local brightness), and trim `settings[]` to the entry matching the
 * requested base. applyTheme then takes the right path through its normal
 * resolution and CSS variables land on the popup container.
 */
function PopupThemeApplier(props: {
  theme: () => AppTheme | Theme,
  isNight: () => boolean
}) {
  let sentinel!: HTMLDivElement;
  onMount(() => {
    const container = sentinel.closest('.popup') as HTMLElement | null;
    if(!container) return;
    createEffect(() => {
      const theme = props.theme();
      const isNight = props.isNight();
      const base: BaseTheme['_'] = isNight ? 'baseThemeNight' : 'baseThemeClassic';
      const settings = Array.isArray((theme as Theme).settings) ?
        (theme as Theme).settings :
        undefined;
      const entry = settings?.find((s) => s.base_theme._ === base) ?? settings?.[0];
      const virtualTheme = {
        ...theme,
        name: isNight ? 'night' : 'day',
        settings: entry ? [entry] : (theme as Theme).settings
      } as unknown as Theme;
      themeController.applyTheme(virtualTheme, container);
    });
  });
  return <div ref={sentinel} style={{display: 'none'}} />;
}

/**
 * Body slot — header row (close + title + brightness toggle) lives inside the
 * body, not in `<PopupElement.Header>`, so it sits on the same surface as the
 * picker and footer (the registered Header slot is transparent by default,
 * which broke our seamless lower-panel look). Below the row is a Section with
 * the reusable ChatThemesPicker.
 */
function BodySlot(props: {shared: QrPopupShared}) {
  const {
    selectedThemeId, setSelectedThemeId, baseTheme, nightMode, setNightMode,
    activeWallPaper
  } = props.shared;

  return (
    <PopupElement.Body>
      <PopupThemeApplier
        theme={() => activeWallPaper().theme}
        isNight={nightMode}
      />
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title class={styles.title}>{i18n('QRCode.Title')}</PopupElement.Title>
        <Button.Icon
          icon={nightMode() ? 'darkmode_filled' : 'darkmode'}
          onClick={() => setNightMode(!nightMode())}
        />
      </PopupElement.Header>

      <Section class={styles.bottomSection} noShadow noMarginBottom>
        <ChatThemesPicker
          class={styles.themePicker}
          selectedId={selectedThemeId}
          onSelect={(theme) => setSelectedThemeId(String(theme.id ?? ''))}
          baseTheme={baseTheme}
        />
      </Section>
    </PopupElement.Body>
  );
}

/**
 * Footer slot — standard PopupElement.FooterButton with the Copy action.
 *
 * `clipboard.write` is permissive about the *type* of data inside a
 * ClipboardItem (it accepts a Promise<Blob>) but strict about the *click
 * context*: the write must be issued in the same JS tick as the user
 * activation, with the document still focused. The previous "encode PNG, then
 * call write" pipeline lost that race — `toBlob` is async, and by the time
 * the encoded Blob landed Chrome had already revoked the activation, throwing
 * `NotAllowedError: Document is not focused`.
 *
 * We sidestep the race by **pre-baking** the blob: TopSection calls
 * `canvas.toBlob` after every paint and stashes the resulting PNG via the
 * `blobRef` getter. By the time the user clicks Copy, the blob is already
 * sitting in memory — the click handler ships it straight to `clipboard.write`
 * synchronously, no `await` between the activation and the write call.
 */
function FooterSlot(props: {shared: QrPopupShared, getBlob: () => Blob | undefined}) {
  const {profileUrl} = props.shared;

  const onCopyClick = async() => {
    const blob = props.getBlob();
    if(blob) {
      try {
        await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
        toastNew({langPackKey: 'QRCode.Copied'});
        return;
      } catch(err) {
        // Image-write may still fail on Safari (no `image/png` write support)
        // or if the user denied clipboard permission at the OS / Chrome
        // policy level. Fall through to the link copy.
        console.error('QRCode image copy failed', err);
      }
    }

    // No blob baked yet (first frame still in flight) OR write was rejected —
    // copy the profile link instead. `copyTextToClipboard` wraps
    // `clipboard.writeText` with a `document.execCommand('copy')` fallback,
    // so this path works even when the modern API is blocked.
    try {
      await copyTextToClipboard(profileUrl());
      toastNew({langPackKey: 'QRCode.CopiedLink'});
    } catch(fallbackErr) {
      console.error('QRCode link copy failed', fallbackErr);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  return (
    <PopupElement.Footer>
      <PopupElement.FooterButton
        class={styles.copyBtn}
        iconLeft="copy"
        langKey="QRCode.Copy"
        callback={async() => {
          await onCopyClick();
        }}
      />
    </PopupElement.Footer>
  );
}

/**
 * Opens the QR-code popup. Defaults to the current user (the Settings entry);
 * pass a `peerId` to show another peer's QR (the PeerProfile username/link rows),
 * and `options.url` to encode an explicit link instead of `t.me/<username>` (used
 * for a private group's invite link, which PeerProfile.Link already resolved).
 */
export default async function showMyQrCodePopup(peerId: PeerId = rootScope.myId, options?: {url?: string}) {
  const self = peerId === rootScope.myId ?
    await rootScope.managers.appUsersManager.getSelf() :
    await rootScope.managers.appPeersManager.getPeer(peerId);
  if(!self) return;

  createPopup(() => {
    const shared = createSharedState(self as User.user, peerId, options?.url);
    let getBlob: () => Blob | undefined = () => undefined;

    // Defer the popup's open animation until the captured canvas has painted
    // its first frame (wallpaper + card + avatar + QR). PopupElement's slide+
    // fade transition is ~150ms — without the gate the popup snaps in against
    // an empty canvas, with the wallpaper popping in a beat later. The first
    // TopSection repaint signals readiness via `onWallpaperReady`.
    const [show, setShow] = createSignal(false);
    const onWallpaperReady = () => {
      if(show()) return;
      setShow(true);
    };

    return (
      <PopupElement
        class={styles.popup}
        containerClass={styles.popupContainer}
        closable
        old
        show={show()}
      >
        <TopSection
          shared={shared}
          blobRef={(getter) => { getBlob = getter; }}
          onWallpaperReady={onWallpaperReady}
        />
        <BodySlot shared={shared} />
        <FooterSlot shared={shared} getBlob={() => getBlob()} />
      </PopupElement>
    );
  });
}
