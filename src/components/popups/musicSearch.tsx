import {createEffect, createMemo, createResource, createSignal, For, on, onCleanup, onMount, Show, untrack, useContext} from 'solid-js';
import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';

import Chat from '@components/chat/chat';
import SelectorSearch from '@components/selectorSearch';
import Section from '@components/section';
import wrapDocument from '@components/wrappers/document';
import createFakeAudioMessage from '@components/wrappers/fakeAudioMessage';
import LazyLoadQueue from '@components/lazyLoadQueue';
import type {AudioElement} from '@components/audio';
import {emptyMediaListLoaderFactory} from '@components/emptyMediaListLoader';
import {PreloaderTsx} from '@components/putPreloader';
import {PAYMENT_REJECTED} from '@components/chat/paidMessagesInterceptor';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {BotInlineResult, DocumentAttribute} from '@layer';
import {MyDocument} from '@appManagers/appDocsManager';
import generateQId from '@appManagers/utils/inlineBots/generateQId';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import ListenerSetter from '@helpers/listenerSetter';

import css from '@components/popups/musicSearch.module.scss';

export type MusicSearchPopupOptions = {
  chat: Chat
};

// The bot search is only worth a round-trip once the query is meaningful — same threshold Android
// uses before it starts hitting the inline bot.
const GLOBAL_SEARCH_MIN_LENGTH = 3;

type Track = {
  key: string,
  doc: MyDocument,
  // Only used to filter the playlist locally; the row itself is rendered by AudioElement.
  searchText: string,
  send: () => MaybePromise<void>
};

function trackSearchText(doc: MyDocument | undefined, fallbackTitle?: string, fallbackPerformer?: string) {
  const audioAttr = doc?.attributes?.find((a) => a._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio | undefined;
  return [
    audioAttr?.title || doc?.file_name || fallbackTitle,
    audioAttr?.performer || fallbackPerformer
  ].filter(Boolean).join(' ').toLowerCase();
}

export default function showMusicSearchPopup(options: MusicSearchPopupOptions): void {
  const {chat} = options;

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const managers = untrack(() => context.managers);

    const [query, setQuery] = createSignal('');
    const [globalLoading, setGlobalLoading] = createSignal(false);
    const [globalResults, setGlobalResults] = createSignal<BotInlineResult[]>([]);
    const [queryId, setQueryId] = createSignal<string | number | undefined>();
    const [botId, setBotId] = createSignal<BotId | null>(null);

    const lazyLoadQueue = new LazyLoadQueue();
    const listenerSetter = new ListenerSetter();
    onCleanup(() => {
      lazyLoadQueue.clear();
      listenerSetter.removeAll();
    });

    // Every send goes through the same paid-message gate; the popup only closes once the user has
    // actually cleared it.
    const withPayment = async(send: (sendingParams: ReturnType<Chat['getMessageSendingParams']>) => void) => {
      const confirmedPaymentResult = await chat.input.paidMessageInterceptor.prepareStarsForPayment(1);
      if(confirmedPaymentResult === PAYMENT_REJECTED) return;

      context.hide();
      send({...chat.getMessageSendingParams(), confirmedPaymentResult});
      chat.input.onMessageSent(false, true);
    };

    // ---- Profile playlist -------------------------------------------------
    const [savedMusic] = createResource(async() => {
      const page = await managers.appSavedMusicManager.getSavedMusic(rootScope.myId.toUserId(), 0, 50);
      return page.documents;
    });

    // A playlist track is a plain document, not an inline result — send it the same way forwarding
    // one out of the saved-music tab does.
    const sendDocument = (doc: MyDocument) => withPayment((sendingParams) => {
      managers.appMessagesManager.sendOther({
        ...sendingParams,
        inputMedia: {_: 'inputMediaDocument', id: getDocumentInput(doc), pFlags: {}}
      });
    });

    const savedTracks = createMemo<Track[]>(() => {
      const q = query().trim().toLowerCase();
      return (savedMusic() || []).map((doc) => ({
        key: 'saved-' + doc.id,
        doc,
        searchText: trackSearchText(doc),
        send: () => sendDocument(doc)
      // The playlist is already in memory, so it filters locally rather than round-tripping.
      })).filter((track) => !q || track.searchText.includes(q));
    });

    // ---- Global (inline bot) search ---------------------------------------
    let runId = 0;
    const runSearch = async(q: string) => {
      const myRun = ++runId;
      const bid = botId();
      if(!bid || q.length < GLOBAL_SEARCH_MIN_LENGTH) {
        setGlobalResults([]);
        setGlobalLoading(false);
        return;
      }

      setGlobalLoading(true);
      try {
        const botResults = await managers.appInlineBotsManager.getInlineResults(chat.peerId, bid, q, '');
        if(!middleware() || myRun !== runId) return;

        setQueryId(botResults.query_id);
        setGlobalResults(botResults.results.filter((r) => {
          return r._ === 'botInlineMediaResult' && (r.document as MyDocument | undefined)?.type === 'audio';
        }));
      } catch(err) {
        if(!middleware() || myRun !== runId) return;
        setGlobalResults([]);
      } finally {
        if(middleware() && myRun === runId) setGlobalLoading(false);
      }
    };

    const sendInlineResult = (item: BotInlineResult) => withPayment((sendingParams) => {
      const qid = queryId();
      const bid = botId();
      if(!bid || qid === undefined) return;

      managers.appInlineBotsManager.sendInlineResult(chat.peerId, bid, generateQId(qid, item.id), {
        ...sendingParams,
        clearDraft: false
      });
    });

    const globalTracks = createMemo<Track[]>(() => globalResults().map((item) => {
      const doc = (item as BotInlineResult.botInlineMediaResult).document as MyDocument;
      return {
        key: 'global-' + item.id,
        doc,
        searchText: trackSearchText(doc, item.title, item.description),
        send: () => sendInlineResult(item)
      };
    }));

    // The same search field every peer picker uses (forward, etc.) — it sticks to the top of the
    // scrollable, so it is rendered as part of the list rather than above it.
    const selectorSearch = new SelectorSearch({
      middlewareHelper: untrack(() => context.middlewareHelper),
      multiSelect: false,
      onInput: () => setQuery(selectorSearch.input.value),
      onChipClick: () => {}
    });
    onCleanup(() => selectorSearch.destroy());

    onMount(async() => {
      const {music_search_username} = await managers.apiManager.getAppConfig();
      if(!middleware() || !music_search_username) {
        return;
      }

      try {
        const user = await managers.appUsersManager.resolveUsername(music_search_username);
        if(!middleware() || user._ !== 'user' || !user.pFlags.bot) {
          return;
        }

        setBotId(user.id);
        runSearch(query());
      } catch(err) {}
    });

    createEffect(on(query, runSearch, {defer: true}));

    const loading = () => savedMusic.loading || globalLoading();
    const isEmpty = () => !loading() && !savedTracks().length && !globalTracks().length;

    // Tracks render as the app's regular audio rows (cover, play button, duration) rather than a
    // bespoke list — same component the profile playlist and shared media use.
    let fakeMid = 0;
    const TrackRow = (props: {track: Track}) => {
      const [element] = createResource(async() => {
        const message = await createFakeAudioMessage({
          doc: props.track.doc,
          peerId: rootScope.myId,
          mid: --fakeMid
        });

        const audio = await wrapDocument({
          message,
          middleware,
          fontWeight: 400,
          voiceAsMusic: true,
          clickable: true,
          lazyLoadQueue,
          autoDownloadSize: 0,
          getSize: () => 320
        }) as AudioElement;
        audio.classList.add('audio-48', 'search-super-item');
        // Preview playback is a one-off here — there is no playlist to advance through.
        audio.listLoaderFactory = emptyMediaListLoaderFactory;

        // AudioElement only binds a click on its toggle, so the rest of the row is free to mean
        // "send this one" — matching how the audio picker behaves on Android.
        attachClickEvent(audio, (e) => {
          if(findUpClassName(e.target as HTMLElement, 'audio-toggle')) {
            return;
          }

          props.track.send();
        }, {listenerSetter});

        return audio;
      });

      return <>{element()}</>;
    };

    const TrackSection = (props: {name: LangPackKey, tracks: Track[]}) => (
      <Show when={props.tracks.length}>
        <Section name={props.name} noDelimiter noShadow>
          <For each={props.tracks}>
            {(track) => <TrackRow track={track} />}
          </For>
        </Section>
      </Show>
    );

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="SharedMusicTab2" />
        </PopupElement.Header>
        {/* Scrollable is `position: absolute; inset: 0` — it needs this positioned box to fill,
            otherwise it covers the header. */}
        <PopupElement.Body class={css.body}>
          <PopupElement.Scrollable>
            {selectorSearch.gradient}
            {selectorSearch.section.container}
            <Show when={loading() && !savedTracks().length && !globalTracks().length}>
              <div class={css.loading}><PreloaderTsx /></div>
            </Show>
            <Show when={isEmpty()}>
              <div class={css.empty}>{i18n('Chat.Search.NothingFound')}</div>
            </Show>
            <TrackSection name="MusicSearch.Profile" tracks={savedTracks()} />
            <TrackSection name="MusicSearch.Global" tracks={globalTracks()} />
          </PopupElement.Scrollable>
        </PopupElement.Body>
      </>
    );
  }

  createPopup(() => (
    <PopupElement class={css.popup}>
      <Inner />
    </PopupElement>
  ));
}
