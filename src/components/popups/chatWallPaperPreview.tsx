import {createMemo, createResource, createSignal, onCleanup, Show} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {Theme, UserFull, WallPaper, WallPaperSettings} from '@layer';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {FakeBubbles} from '@components/chat/bubbles/fakeBubbles';
import {BubbleLayout} from '@components/chat/bubbles/bubbleLayout';
import {getChatBackgroundFromFullPeer, isSameWallPaper} from '@components/chat/chatTheme';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import Section from '@components/section';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RangeSettingSelector from '@components/rangeSettingSelector';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import ChatBackgroundStore from '@lib/chatBackgroundStore';
import themeController from '@helpers/themeController';
import setBooleanFlag from '@helpers/object/setBooleanFlag';
import copy from '@helpers/object/copy';
import throttle from '@helpers/schedulers/throttle';
import classNames from '@helpers/string/classNames';
import noop from '@helpers/noop';
import {GrowHeightReveal} from '@helpers/solid/animations';
import {useFullPeer} from '@stores/fullPeers';
import {useAppConfig} from '@stores/appState';
import I18n, {i18n} from '@lib/langPack';
import {I18nTsx} from '@helpers/solid/i18n';
import rootScope from '@lib/rootScope';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import type {AppManagers} from '@lib/managers';
import pickerStyles from '@components/popups/chatWallPaper.module.scss';
import serviceStyles from '@components/chat/bubbles/service.module.scss';
import styles from '@components/popups/chatWallPaperPreview.module.scss';

// * what tdesktop takes for a wallpaper that says nothing of its dimming
const DEFAULT_DIMMING = 50;

export type ChatWallPaperPreviewOptions = {
  peerId: PeerId,
  wallPaper: WallPaper,
  // * the message the other side set it in, to take it for this side too
  fromMessageId?: number,
  // * a picked image, prepared by `appDocsManager.prepareWallPaperUpload` and uploaded once applied
  upload?: boolean,
  // * the opener's, of the account the wallpaper is for
  managers?: AppManagers,
  onApplied?: () => void
};

/**
 * Who the wallpaper is for: this side, or both (Premium) — tdesktop's choice, asked in a popup of the app's
 * own: a close button in its header and the two choices as its footer's buttons.
 */
function ForWhom(props: {
  name: string,
  managers: AppManagers,
  onChoice: (choice?: 'me' | 'both') => void
}) {
  let chosen = false;
  const choose = (choice: 'me' | 'both') => {
    chosen = true;
    props.onChoice(choice);
  };

  return (
    <PopupElement class={styles.forWhom} managers={props.managers} closable onClose={() => chosen || props.onChoice()}>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="ApplyWallpaperForThisChat" />
      </PopupElement.Header>
      <PopupElement.Footer>
        <PopupElement.FooterButton langKey="ApplyWallpaperForMe" callback={() => choose('me')} />
        <PopupElement.FooterButton
          langKey="ApplyWallpaperForMeAndPeer"
          langArgs={[props.name]}
          iconRight={rootScope.premium ? undefined : 'premium_lock'}
          callback={() => {
            if(!rootScope.premium) {
              hotReloadGuard.showPremiumPopup({feature: 'wallpapers'});
              return false;
            }

            choose('both');
          }}
        />
      </PopupElement.Footer>
    </PopupElement>
  );
}

export async function chooseChatWallPaperForWhom(peerId: PeerId, managers: AppManagers) {
  const session = getManagersSession(managers);
  const name = await getPeerTitle({peerId, plainText: true, onlyFirstName: true});
  // * not over the account the tab has switched to meanwhile: nothing is chosen
  if(isSessionLeaving(session)) {
    return;
  }

  return new Promise<'me' | 'both' | void>((resolve) => {
    createPopup(() => <ForWhom name={name} managers={managers} onChoice={resolve} />);
  });
}

/** A picked image that is not applied: its prepared upload goes, and what the background kept of it. */
export function discardPickedWallPaper(wallPaper: WallPaper, managers: AppManagers) {
  const {slug} = wallPaper as WallPaper.wallPaper;
  // * a no-op once it has been uploaded; refused once the tab is on another account, which is fine
  managers.appDocsManager.discardWallPaperUpload(wallPaper.id).catch(noop);
  ChatBackgroundStore.deleteBackgroundUrlFromCache({slug});
  ChatBackgroundStore.deleteBackgroundUrlFromCache({slug, blur: true});
}

/**
 * A wallpaper shown on the chat it would go to, with the chat's theme and fake messages, before it
 * is applied — tdesktop's BackgroundPreviewBox for one chat.
 */
function WallPaperPreview(options: ChatWallPaperPreviewOptions & {managers: AppManagers}) {
  const {peerId, fromMessageId, upload, managers} = options;
  // * a copy: what comes from the full peer store is a proxy the worker can't take, and changes later
  const wallPaper = copy(unwrap(options.wallPaper));
  const slug = (wallPaper as WallPaper.wallPaper).slug;
  const settings: WallPaperSettings = wallPaper.settings || {_: 'wallPaperSettings', pFlags: {}};
  const isImage = wallPaper._ === 'wallPaper' && !wallPaper.pFlags.pattern;

  const fullPeer = useFullPeer(peerId);
  // * someone who charges for messages is not told they could apply it: as tdesktop, just the date
  const [starsAmount] = createResource(() => {
    return fromMessageId || peerId === rootScope.myId ?
      0 :
      managers.appPeersManager.getStarsAmount(peerId).catch((): number => 0);
  });
  const [isNight, setIsNight] = createSignal(themeController.isNight());
  const [blur, setBlur] = createSignal(!!settings.pFlags.blur);
  // * a picked image is drawn blurred once its blurred copy is made; applied, it is as asked at once
  const [drawnBlur, setDrawnBlur] = createSignal(blur());
  const [dimming, setDimming] = createSignal(settings.intensity ?? DEFAULT_DIMMING);
  // * the background redrawn at a pace a slider's drag doesn't choke on
  const [drawnDimming, setDrawnDimming] = createSignal(dimming());
  const drawDimming = throttle(setDrawnDimming, 100);

  // * the colours are the chat's: its theme, or the app's own for the side of the day picked here
  const theme = createMemo(() => {
    const current = themeController.getTheme();
    const appTheme = themeController.isNightThemeName(current.name) === isNight() ?
      current :
      themeController.getTheme(isNight() ? 'night' : 'day');
    const chatTheme = getChatBackgroundFromFullPeer(fullPeer()).theme as Theme;
    if(!chatTheme) {
      return appTheme;
    }

    // * on the app's side of the day the chat's theme goes as the chat applies it (`Chat.applyContainerTheme`), under
    // * the app's theme - a palette of its own (tinted) included; on the other side, under that side's
    return appTheme === current ? chatTheme : {...chatTheme, name: appTheme.name} as unknown as Theme;
  });

  const getSettings = (dimmingValue: number, blurValue: boolean): WallPaperSettings => {
    const adjustedSettings: WallPaperSettings = {...settings, pFlags: {...settings.pFlags}};
    if(isImage) {
      setBooleanFlag(adjustedSettings.pFlags, 'blur', blurValue);
      adjustedSettings.intensity = dimmingValue;
    }

    return adjustedSettings;
  };

  const drawn = createMemo((): WallPaper => ({...wallPaper, settings: getSettings(drawnDimming(), drawnBlur())} as WallPaper));

  // * a picked image has no file on the server yet to blur: blurred here instead
  let blurredUpload: Promise<void>;
  let blurChange = 0;
  const onBlurChange = async(value: boolean) => {
    setBlur(value);
    const change = ++blurChange;
    if(value && upload) {
      await (blurredUpload ??= Promise.resolve(ChatBackgroundStore.getBackground({slug})).then(async(url) => {
        const blurred = await ChatBackgroundStore.blurWallPaperImage(url);
        // * not kept for an image the preview has let go of meanwhile
        if(!disposed) ChatBackgroundStore.setBackgroundUrlToCache({slug, url: blurred, blur: true});
      }));
    }

    // * toggled back meanwhile
    if(change === blurChange) setDrawnBlur(value);
  };

  // * closed (and later gone) while applying waited for the user or the upload: nothing is applied then
  let closed = false, disposed = false;
  onCleanup(() => {
    disposed = true;
    if(upload) discardPickedWallPaper(wallPaper, managers);
  });

  const apply = async() => {
    const paper = {...wallPaper, settings: getSettings(dimming(), blur())} as WallPaper;
    const current = unwrap((fullPeer() as UserFull.userFull)?.wallpaper);
    // * the one the chat has already, as it has it: as tdesktop, nothing to send
    if(!upload && current && isSameWallPaper(current, paper)) {
      options.onApplied?.();
      return;
    }

    let forBoth = false;
    // * a wallpaper taken from the other side's message, nobody to offer Premium to, or no other side
    // * at all (Saved Messages): just this side
    if(!fromMessageId && !useAppConfig().premium_purchase_blocked && peerId !== rootScope.myId) {
      const choice = await chooseChatWallPaperForWhom(peerId, managers);
      if(!choice || closed) return false;
      forBoth = choice === 'both';
    }

    let uploaded: WallPaper;
    if(upload) {
      try {
        uploaded = await managers.appDocsManager.uploadWallPaper(wallPaper.id, {forChat: true, settings: paper.settings});
      } catch(err) {
        // * the picked image is spent: it has to be picked again
        console.error('chat wallpaper: cannot upload', err);
        if(!closed) toastNew({langPackKey: 'Error.AnError'});
        return;
      }

      if(closed) {
        return;
      }
    }

    // * the popups go first, and the chat takes the wallpaper once they are gone: drawing it there (a picture
    // * to decode, to blur) would hold up their fade, and a timer would take them away in one frame instead
    applyOnClose = () => {
      managers.appThemesManager.setChatWallPaper(peerId, {
        wallPaper: uploaded ? {...uploaded, settings: paper.settings} as WallPaper : paper,
        forBoth,
        fromMessageId,
        justUploaded: !!uploaded
      }).catch((err) => {
        console.error('chat wallpaper: cannot apply', err);
        toastNew({langPackKey: 'Error.AnError'});
      });
    };

    options.onApplied?.();
  };
  let applyOnClose: () => void;

  return (
    // * sized as the picker it opens from: the body scrolls within the window
    <PopupElement
      class={pickerStyles.popup}
      managers={managers}
      closable
      onClose={() => closed = true}
      onCloseAfterTimeout={() => applyOnClose?.()}
    >
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="WallpaperPreview" />
        {/* * one glyph, lit while it is pressed, as the app's other toggles in a header */}
        <ButtonIconTsx
          class={classNames(styles.night, isNight() && 'active')}
          icon="darkmode"
          aria-label={I18n.format('DarkMode', true)}
          aria-pressed={isNight()}
          onClick={() => setIsNight(!isNight())}
        />
      </PopupElement.Header>
      <PopupElement.Body>
        <PopupElement.Scrollable>
          <FakeBubbles class={styles.preview} contentClass={styles.messages} theme={theme()} wallPaper={drawn()}>
            <Show when={!starsAmount.loading}>
              <div class={classNames(serviceStyles.text, styles.service)}>
                {fromMessageId || peerId === rootScope.myId || starsAmount() ?
                  // * the fake messages are today's, as the chat's own date would say — and nobody else is to
                  // * take it in Saved Messages
                  <I18nTsx key="Date.Today" /> :
                  <I18nTsx key="ChatBackgroundHint" args={<PeerTitleTsx peerId={peerId} onlyFirstName />} />}
              </div>
            </Show>
            <BubbleLayout text={I18n.format('BackgroundColorSinglePreviewLine3', true)} tail group="single" />
            <BubbleLayout text={I18n.format('BackgroundPreviewLooksGood', true)} tail out group="single" />
          </FakeBubbles>
          <Show when={isImage}>
            <Section noShadow noMarginBottom>
              <Row>
                <Row.CheckboxFieldToggle>
                  <CheckboxFieldTsx
                    name="wallpaper-blur"
                    checked={blur()}
                    toggle
                    onChange={onBlurChange}
                  />
                </Row.CheckboxFieldToggle>
                <Row.Title>{i18n('BackgroundBlurred')}</Row.Title>
              </Row>
              <GrowHeightReveal when={isNight()} appear={false}>
                <RangeSettingSelector
                  textLeft={i18n('WallpaperDimming')}
                  textRight={(value) => value + '%'}
                  step={1}
                  value={dimming()}
                  minValue={0}
                  maxValue={100}
                  onChange={(value) => {
                    setDimming(value);
                    drawDimming(value);
                  }}
                />
              </GrowHeightReveal>
            </Section>
          </Show>
        </PopupElement.Scrollable>
      </PopupElement.Body>
      <PopupElement.Footer>
        <PopupElement.FooterButton langKey="ApplyWallpaperForThisChat" callback={apply} preloader />
      </PopupElement.Footer>
    </PopupElement>
  );
}

export default function showChatWallPaperPreviewPopup(options: ChatWallPaperPreviewOptions) {
  // * the account it is asked on, or the opener's: it does not open once the tab is on another
  const managers = bindManagersToSession(options.managers || rootScope.managers);
  createPopup(() => <WallPaperPreview {...options} managers={managers} />);
}
