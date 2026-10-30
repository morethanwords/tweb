import {createEffect, createMemo, createResource, createSignal, For, Index, on, onCleanup, onMount, Show, untrack} from 'solid-js';
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
import {createExportActions, ExportCopyButton, ExportShareSaveButtons} from './myQrCode/exportButtons';
import classNames from '@helpers/string/classNames';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import {useMediaSizes} from '@helpers/mediaSizes';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {Chat, InputSavedStarGift, ShareTheme, ShareThemeBackdropOption, User} from '@layer';
import {backdropGradient, backdropToCss} from './myQrCode/backdrop';
import {Caption} from './myQrCode/caption';
import {QrCard} from './myQrCode/card';
import {backdropColors} from './myQrCode/colors';
import exportImage from './myQrCode/exportImage';
import {PatternField} from './myQrCode/field';
import {ExpiryPill, FeePill} from './myQrCode/feePill';
import createQrLink from './myQrCode/linkState';
import {Rect} from './myQrCode/fieldNodes';
import {openLayout, PILL_GAP, SHEET_BOTTOM, SHEET_INSET, sheetHeightFor, surfaceGeometry} from './myQrCode/layout';
import {appearanceToShareTheme, Appearance, giftToInput, isDefaultBackdrop, shareThemeToAppearance, ThemeEmoji, themeEmojiKey, withBackdrop, withEmojiToggled, withGift} from './myQrCode/theme';
import {createThemeSaver, getHeldTheme} from './myQrCode/themeSaver';
import {ColorsPanel} from './myQrCode/colorsPanel';
import {ChosenEmojiStrip, EmojiPanel} from './myQrCode/emojiPanel';
import {preloadAppliedEmoji} from './myQrCode/emojiPresets';
import {GiftsPanel, ThemeGift} from './myQrCode/giftsPanel';
import {showPremiumGiftsToast} from './myQrCode/premiumToast';
import styles from './myQrCode.module.scss';

const BACKDROP_FADE_MS = 350;

type BackdropLayer = {id: number, key: string, css: string, shown: boolean};

/** The backdrop: gradient layers one over the other, the newest fading in over the older ones */
function Backdrop(props: {css: () => string, colorsKey: () => string}) {
  const [layers, setLayers] = createSignal<BackdropLayer[]>([]);
  let counter = 0;
  const timers = new Set<number>();
  onCleanup(() => timers.forEach((timer) => clearTimeout(timer)));

  createEffect(() => {
    const css = props.css(), key = props.colorsKey();
    if(!css) return;

    const all = untrack(layers);
    const top = all[all.length - 1];
    // the same colours on another size: the layer is redrawn where it stands
    if(top?.key === key) {
      setLayers([...all.slice(0, -1), {...top, css}]);
      return;
    }

    if(!top || !liteMode.isAvailable('animations')) {
      setLayers([{id: ++counter, key, css, shown: true}]);
      return;
    }

    const layer: BackdropLayer = {id: ++counter, key, css, shown: false};
    setLayers([...all, layer]);
    requestAnimationFrame(() => {
      setLayers((current) => current.map((item) => item.id === layer.id ? {...item, shown: true} : item));
    });
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      setLayers((current) => current.filter((item) => item.id >= layer.id));
    }, BACKDROP_FADE_MS);
    timers.add(timer);
  });

  return (
    <Index each={layers()}>
      {(layer) => <div class={classNames(styles.backdrop, layer().shown && styles.backdropShown)} style={{'background-image': layer().css}} />}
    </Index>
  );
}

function MyQrCodePopup(props: {
  managers: AppManagers,
  peerId: PeerId,
  peer: User.user,
  title: string,
  shareTheme?: ShareTheme,
  /** The own profile, or a public channel the user may change the info of: the theme can be set */
  canEdit?: boolean,
  /** An explicit link instead of `t.me/<username>`: a private group's invite link */
  url?: string
}) {
  const {managers, peerId, peer} = props;
  const mediaSizes = useMediaSizes();
  const isSelf = peerId === rootScope.myId;

  /* The theme: the cached one at once, the served one when it comes. What was chosen here stands in its place until
     the server has had it (and a moment after, `getHeldTheme`), so a full peer that left before the save does not undo it. */
  const account = getCurrentAccount();
  const accountManagers = bindManagersToAccount(rootScope.managers, account);
  const [shareTheme, setShareTheme] = createSignal(props.shareTheme);
  const showServedTheme = async() => {
    const theme = await managers.appProfileManager.getCachedShareTheme(peerId);
    if(!saver.hasPending && !getHeldTheme(account, peerId)) setShareTheme(theme);
  };

  subscribeOn(rootScope)('peer_full_update', (updated) => {
    if(updated === peerId) showServedTheme();
  });
  managers.appProfileManager.getProfileByPeerId(peerId).catch(noop);

  const [backdrops] = createResource(() => managers.appProfileManager.getShareThemeBackdrops().catch((): ShareThemeBackdropOption[] => undefined));
  const appearance = createMemo(() => shareThemeToAppearance(shareTheme(), backdrops()));
  const colors = createMemo(() => backdropColors(appearance().backdrop));

  /* The link and what is written under the code */
  const username = createMemo(() => getPeerActiveUsernames(peer)[0]);
  // the own profile: username, phone or a contact link, and the fee code; anyone else: a plain link
  const own = createQrLink({managers, peer: peer as User.user, enabled: isSelf && !props.url});
  const url = createMemo(() => {
    if(props.url) return props.url;
    if(own.enabled) return own.url();
    if(username()) return buildTelegramUserQrUrl(username());
    if(peerId.isUser()) return `https://t.me/+${peer.phone ?? ''}`;
    return `https://t.me/c/${peerId.toChatId()}`;
  });

  const caption = createMemo<Caption | undefined>(() => {
    if(own.enabled) return own.caption();
    if(!props.url && username()) return {text: '@' + username().toUpperCase(), kind: 'username'};
    if(!props.url && peerId.isUser() && peer.phone) return {text: '+' + peer.phone, kind: 'phone'};
    return {text: props.title.toUpperCase(), kind: 'name'};
  });

  /* The geometry, read once and on resize */
  const [size, setSize] = createSignal({width: 0, height: 0});
  let surfaceElement: HTMLDivElement;
  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect;
      setSize({width: Math.round(width), height: Math.round(height)});
    });
    observer.observe(surfaceElement);
    onCleanup(() => observer.disconnect());
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
    onError: () => {
      toastNew({langPackKey: 'Error.AnError'});
      // the manager has put the full peer back; so does the screen, unless this device holds on to the choice
      showServedTheme();
    }
  });

  // the colour a gift gives way to: the last one shown
  let lastColor: Appearance;
  createEffect(() => {
    const current = appearance();
    if(current.kind !== 'gift') {
      lastColor = {kind: isDefaultBackdrop(current.backdrop) ? 'default' : 'color', backdrop: current.backdrop, backdropId: current.backdropId, emojis: []};
    }
  });

  const commit = (next: Appearance, giftInput?: InputSavedStarGift) => {
    const toSave = appearanceToShareTheme(next, giftInput);
    if(toSave) {
      setShareTheme(toSave.shown);
      saver.schedule(toSave);
    } else if(next.kind === 'gift') {
      // a gift nothing names cannot be saved, and an earlier choice still waiting is outdated
      setShareTheme({_: 'shareThemeGift', stargift: next.gift});
      saver.cancel();
    }
  };

  const pickBackdrop = (option?: ShareThemeBackdropOption) => commit(withBackdrop(appearance(), backdrops(), option));
  const toggleEmoji = (emoji: ThemeEmoji) => commit(withEmojiToggled(appearance(), emoji, lastColor ?? withBackdrop(appearance(), backdrops())));
  const pickEmoji = (docId: DocId) => toggleEmoji({documentId: docId});
  const pickGift = ({gift, input}: ThemeGift) => {
    const next = withGift(gift);
    if(next) commit(next, giftToInput(gift, isSelf, input));
  };

  /* The panels: the island's buttons open one, the card makes room above it */
  type PanelId = 'colors' | 'emoji' | 'gifts';
  const PANELS: {id: PanelId, icon: Icon, iconClass: string, title: LangPackKey}[] = [
    {id: 'colors', icon: 'colorize', iconClass: styles.iconColors, title: 'QRCode.Colors'},
    {id: 'emoji', icon: 'smile', iconClass: styles.iconEmoji, title: 'QRCode.Emoji'},
    {id: 'gifts', icon: 'gift', iconClass: styles.iconGifts, title: 'QRCode.Gift'}
  ];
  const [panel, setPanel] = createSignal<PanelId>();
  // a panel is built when it is first opened, and kept: the emoji tab and the gifts are costly to build
  const [visited, setVisited] = createSignal<PanelId[]>([]);
  const buttons: {[id in PanelId]?: HTMLElement} = {};
  let sheetElement: HTMLDivElement;

  // the sheet is named after the panel on show; closed, it is hidden from everything
  const panelTitle = () => {
    const shown = PANELS.find((item) => item.id === panel());
    return shown && I18n.format(shown.title, true);
  };

  const sheetHeight = createMemo(() => sheetHeightFor(size().height, size().width));
  const sheetSize = createMemo(() => ({width: size().width - 2 * SHEET_INSET, height: sheetHeight()}));
  const cardLayout = createMemo(() => panel() ? openLayout({...surface(), pillExtra: 0}, sheetHeight()) : undefined);

  const navigationItem: NavigationItem = {
    type: 'dropdown',
    // Escape, and the back of a phone: the panel first, the popup after
    onPop: () => {
      closePanel(true);
    }
  };

  // The island grows into the sheet and back, Android's spring in a curve: the sheet's clip goes between their shapes
  let islandElement: HTMLDivElement;
  createEffect(on(() => !!panel(), (open, wasOpen) => {
    if(open === !!wasOpen || !liteMode.isAvailable('motion') || !islandElement) return;
    const sheet = sheetElement.getBoundingClientRect(), island = islandElement.getBoundingClientRect();
    const shapes = [
      `inset(${island.top - sheet.top}px ${sheet.right - island.right}px ${sheet.bottom - island.bottom}px ${island.left - sheet.left}px round 20px)`,
      'inset(0px round 28px)'
    ];
    sheetElement.animate(
      {clipPath: open ? shapes : shapes.reverse()},
      open ? {duration: 400, easing: 'cubic-bezier(.16, 1, .3, 1)'} : {duration: 240, easing: 'ease-in'}
    );
    // what stands in it comes once there is room for it, and goes first
    for(const child of sheetElement.children) {
      // the fade that held it hidden while it was closed must not outlive the closing
      child.getAnimations().forEach((animation) => animation.cancel());
      child.animate({opacity: open ? [0, 1] : [1, 0]}, open ? {duration: 220, delay: 90, fill: 'backwards'} : {duration: 100, fill: 'forwards'});
    }
  }, {defer: true}));

  function closePanel(fromNavigation?: boolean) {
    const opened = panel();
    if(!opened) return;

    setPanel(undefined);
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
    setVisited((all) => all.includes(id) ? all : [...all, id]);
    setPanel(id);
    if(!wasOpen) appNavigationController.pushItem(navigationItem);
    if(Modes.a11y) {
      // into the panel, onto the pressed one, else the first
      requestAnimationFrame(() => {
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
    isExpiring: own.isExpiring,
    expiringToast: () => own.fee.isExpiring() ? 'QRCode.NoPaid.Toast.Expiring' : 'QRCode.LinkExpiring'
  });

  const label = () => `${I18n.format('QRCode.Title', true)}: ${props.title}, ${url()}`;

  return (
    <PopupElement
      managers={managers}
      class={classNames(styles.popup, mediaSizes.isMobile && styles.fullscreen)}
      containerClass={styles.popupContainer}
      closable
      show={ready()}
      onClose={() => saver.flush()}
    >
      <div
        ref={surfaceElement}
        class={styles.surface}
        onPointerDown={onSurfacePointerDown}
        style={{
          '--qr-foreground': colors().foreground,
          '--qr-control': colors().control,
          '--qr-mid': colors().mid
        }}
      >
        <Backdrop
          css={() => ready() ? backdropToCss(gradient()) : ''}
          colorsKey={() => [colors().center, colors().mid, colors().edge, colors().vertical].join()}
        />
        <PatternField
          appearance={appearance}
          width={() => size().width}
          height={() => size().height}
          // the backdrop moves the pattern under a finger; the card, the panels and the buttons keep their presses, and an open panel its backdrop
          canDrag={(target) => !panel() && !target.closest(`.${styles.cardPlace}, .${styles.sheet}, .${styles.island}, .${styles.control}, .${styles.close}`)}
          fieldRef={(get) => { getField = get; }}
        />
        <div
          class={styles.cardPlace}
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
            qrRef={(get) => { getQr = get; }}
          />
          <Show when={own.fee.visible()} fallback={own.kind() === 'contact' && <ExpiryPill away={!!panel()} left={own.left} top={surface().card.height + PILL_GAP} />}>
            <FeePill away={!!panel()} fee={own.fee} top={surface().card.height + PILL_GAP} />
          </Show>
        </div>
        <PopupElement.CloseButton class={styles.close} />
        <Show when={props.canEdit}>
          <div
            class={classNames(styles.sheet, panel() && styles.sheetOpen)}
            ref={sheetElement}
            id="qr-sheet"
            role="region"
            aria-label={panelTitle()}
            style={{height: sheetHeight() + 'px', bottom: SHEET_BOTTOM + 'px', 'inset-inline': SHEET_INSET + 'px'}}
          >
            <For each={visited()}>
              {(id) => (
                <div class={styles.sheetPanel} data-panel={id} hidden={panel() !== id}>
                  {id === 'colors' && (
                    <ColorsPanel
                      backdrops={backdrops}
                      selectedId={() => appearance().kind === 'gift' ? undefined : appearance().backdropId}
                      onPick={pickBackdrop}
                    />
                  )}
                  {id === 'emoji' && (
                    <EmojiPanel
                      managers={managers}
                      emojis={() => appearance().emojis}
                      size={sheetSize}
                      onPick={pickEmoji}
                    />
                  )}
                  {id === 'gifts' && (
                    <GiftsPanel
                      managers={managers}
                      ownerId={peerId}
                      isSelf={isSelf}
                      selectedId={() => appearance().gift?.id as string}
                      onPick={pickGift}
                    />
                  )}
                </div>
              )}
            </For>
          </div>
          <Show when={panel() === 'emoji' && appearance().emojis.length}>
            <ChosenEmojiStrip emojis={() => appearance().emojis} onRemove={toggleEmoji} />
          </Show>
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
        <ExportCopyButton actions={exportActions} class={classNames(styles.control, styles.copy, styles.iconCopy, panel() && styles.controlAway)} />
        <div class={styles.bar}>
          <ExportShareSaveButtons actions={exportActions} class={classNames(styles.control, panel() && styles.controlAway)} shareClass={styles.iconShare} saveClass={styles.iconSave} groupClass={styles.barGroup} />
        </div>
      </div>
    </PopupElement>
  );
}

/**
 * Opens the QR-code popup. Defaults to the current user (the Settings entry); pass a `peerId` to show another peer's
 * QR (the PeerProfile username/link rows), and `options.url` to encode an explicit link instead of `t.me/<username>`
 * (a private group's invite link, which PeerProfile.Link already resolved).
 */
export default async function showMyQrCodePopup(peerId: PeerId = rootScope.myId, options?: {url?: string}) {
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
      canEdit={canEdit && !options?.url}
      url={options?.url}
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
