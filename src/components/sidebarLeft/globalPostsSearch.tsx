import {batch, createEffect, createMemo, createSignal, Match, on, onMount, Show, Switch} from 'solid-js';
import {wrapSolidComponent} from '../../helpers/solid/wrapSolidComponent';
import {Middleware} from '../../helpers/middleware';

import styles from './globalPostsSearch.module.scss';
import {I18nTsx} from '../../helpers/solid/i18n';
import rootScope from '../../lib/rootScope';
import {Message, SearchPostsFlood} from '../../layer';
import Button from '../buttonTsx';
import {i18n} from '../../lib/langPack';
import PopupPremium from '../popups/premium';
import classNames from '../../helpers/string/classNames';
import {IconTsx} from '../iconTsx';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {NULL_PEER_ID, STARS_CURRENCY} from '../../lib/appManagers/constants';
import appDialogsManager, {DIALOG_LIST_ELEMENT_TAG} from '../../lib/appDialogsManager';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {PreloaderTsx} from '../putPreloader';
import findUpTag from '../../helpers/dom/findUpTag';
import appImManager from '../../lib/appImManager';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {createCurrentTime} from '../../helpers/solid/createCurrentTime';
import tsNow from '../../helpers/tsNow';
import {wrapLeftDuration} from '../wrappers/wrapDuration';
import usePremium from '../../stores/premium';
import {toastNew} from '../toast';

const renderHistoryResult = (options: {
  messages: (Message.message | Message.messageService)[]
  query: string
  middleware: Middleware
}) => {
  const promises = options.messages.map(async(message) => {
    const loadPromises: Promise<any>[] = [];
    const {dom} = appDialogsManager.addDialogAndSetLastMessage({
      peerId: message.peerId,
      container: false,
      avatarSize: 'bigger',
      message,
      query: options.query,
      wrapOptions: {
        middleware: options.middleware
      },
      loadPromises,
      autonomous: true
    });

    await Promise.all(loadPromises);
    return dom.containerEl;
  });

  return Promise.all(promises);
};

export function GlobalPostsSearch(props: {
  query: string
  loadMoreRef?: (fn: () => void) => void
}) {
  const [flood, setFlood] = createSignal<SearchPostsFlood | null>(null)
  const [results, setResults] = createSignal<HTMLElement[]>([])
  const [placeholder, setPlaceholder] = createSignal(true)
  const [loading, setLoading] = createSignal(false)
  const [canShowButtonAfterEmpty, setCanShowButtonAfterEmpty] = createSignal(false)
  const middleware = createMiddleware()
  const isPremium = usePremium()

  let lastMessage: Message.message | Message.messageService | null = null
  let nextRate = 0
  const loadMore = (refetch = false, allowPaid = false) => {
    if(loading() && !refetch) return
    if(!props.query) return
    setLoading(true)

    const offsetId = lastMessage?.mid || 0
    const offsetPeerId = lastMessage?.peerId || NULL_PEER_ID

    rootScope.managers.appMessagesManager.getHistory({
      peerId: NULL_PEER_ID,
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      offsetId,
      offsetPeerId,
      nextRate,
      limit: 30,
      isPublicPosts: true,
      query: props.query,
      allowStars: allowPaid ? flood()?.stars_amount : 0
    }).then((res) => {
      if(allowPaid && !res.flood.pFlags.query_is_free) {
        toastNew({
          langPackKey: 'PostsSearch.StarsSpent',
          langPackArguments: [
            paymentsWrapCurrencyAmount(res.flood.stars_amount, STARS_CURRENCY, false, false, true)
          ]
        })
      }

      if(!res.messages) {
        setLoading(false);
        return;
      }
      nextRate = res.nextRate;
      lastMessage = res.messages[res.messages.length - 1];
      if(res.flood) setFlood(res.flood);
      renderHistoryResult({
        messages: res.messages,
        query: props.query,
        middleware: middleware.get()
      }).then((doms) => {
        batch(() => {
          setPlaceholder(false)
          setResults([...results(), ...doms]);
          setLoading(false);
        })
      }).catch((err) => {
        console.error(err);
        setLoading(false);
      })
    }).catch((err: ApiError) => {
      const m = (err.type as string ?? '').match(/^FLOOD_WAIT_(\d+)_OR_STARS_(\d+)$/)
      if(m) {
        setFlood({
          _: 'searchPostsFlood',
          pFlags: {},
          remains: 0,
          total_daily: flood()?.total_daily || 0,
          wait_till: tsNow(true) + parseInt(m[1]),
          stars_amount: parseInt(m[2])
        })
      }
      console.error(err)
      setLoading(false)
    })
  }
  props.loadMoreRef?.(loadMore)

  const loadFlood = () => {
    const myQuery = props.query
    rootScope.managers.apiManager.invokeApi('channels.checkSearchPostsFlood', {
      query: myQuery
    }).then((res) => {
      if(myQuery !== props.query) return
      setFlood(res)
      setCanShowButtonAfterEmpty(true)
      if(myQuery) {
        setResults([])
        setPlaceholder(true)
        if(res.pFlags.query_is_free) {
          loadMore(true)
        }
      }
    })
  }

  createEffect(on(() => props.query, (value, prev) => {
    // only show the button after we load flood, to avoid blinking for free queries
    if(prev === '') setCanShowButtonAfterEmpty(false)
    if(value === '') {
      setResults([])
      setPlaceholder(true)
    }
    lastMessage = null
    nextRate = 0
    loadFlood()
  }))

  const now = createCurrentTime({
    fn: () => tsNow(true),
    updateInterval: 1000
  })
  const remainingUntilReset = createMemo(() => {
    const flood$ = flood()
    if(!flood$?.wait_till) return null

    return wrapLeftDuration(flood$.wait_till - now())
  })

  const title = () => {
    if(!isPremium()) {
      return 'PostsSearch.Title'
    }
    if(flood()?.remains === 0) {
      return 'PostsSearch.TitleLimited'
    }
    return 'PostsSearch.Title'
  }

  const description = () => {
    if(!isPremium()) {
      return <I18nTsx key="PostsSearch.Description" class={styles.description} />
    }
    if(flood()?.remains === 0) {
      return (
        <I18nTsx
          key="PostsSearch.DescriptionLimited"
          args={[String(flood().total_daily)]}
          class={styles.description}
        />
      )
    }
    return <I18nTsx key="PostsSearch.Description" class={styles.description} />
  }

  const button = () => {
    if(!isPremium()) {
      return (
        <Button
          class={classNames('btn-primary btn-color-primary', styles.button)}
          onClick={() => PopupPremium.show()}
        >
          {i18n('PostsSearch.SubscribeToPremium')}
        </Button>
      )
    }

    if(!props.query || !canShowButtonAfterEmpty()) return null

    if(remainingUntilReset()) {
      return (
        <Button
          class={classNames('btn-primary btn-color-primary', styles.button, styles.buttonPaidSearch)}
          onClick={() => loadMore(true, true)}
        >
          <I18nTsx key="PostsSearch.SearchFor" args={[paymentsWrapCurrencyAmount(flood().stars_amount, STARS_CURRENCY)]} />
          <I18nTsx key="PostsSearch.FreeUnlocksIn" args={[remainingUntilReset()]} class={styles.remainingUntilReset} />
        </Button>
      )
    }

    return (
      <Button
        class={classNames('btn-primary btn-color-primary', styles.button)}
        onClick={() => loadMore(true)}
      >
        <IconTsx icon="search" />
        {i18n('Search')}
        <span class={styles.searchQuery}>
          {wrapEmojiText(props.query)}
        </span>
        <IconTsx icon="next" />
      </Button>
    )
  }

  const footer = () => {
    if(!isPremium()) {
      return (
        <I18nTsx key="PostsSearch.NeedPremium" class={styles.footer} />
      )
    }
    if(!flood() || flood().remains === 0) return null

    return (
      <I18nTsx
        key="PostsSearch.FreeSearches"
        args={[String(flood().remains)]}
        class={styles.footer}
      />
    )
  }

  return (
    <div>
      <Switch>
        <Match when={results().length}>
          <div
            class={styles.results}
            ref={(el) => {
              appDialogsManager.setListClickListener({
                list: el,
                autonomous: true
              })
            }}
          >
            {results()}
          </div>
        </Match>
        <Match when={loading() || !flood()}>
          <PreloaderTsx />
        </Match>
        <Match when={placeholder()}>
          <div class={styles.placeholder}>
            <I18nTsx key={title()} class={styles.title} />
            {description()}
            {button()}
            {footer()}
          </div>
        </Match>
        <Match when={true}>
          <div class={styles.placeholder}>
            {i18n('Chat.Search.NothingFound')}
          </div>
        </Match>
      </Switch>
    </div>
  )
}

export function wrapGlobalPostsSearch(options: {
  middleware: Middleware
  query: string
}) {
  const [query, setQuery] = createSignal(options.query);

  let loadMore!: () => void
  const dom = wrapSolidComponent(() => (
    <GlobalPostsSearch
      query={query()}
      loadMoreRef={fn => loadMore = fn}
    />
  ), options.middleware)

  return {
    dom,
    loadMore,
    setQuery
  }
}
