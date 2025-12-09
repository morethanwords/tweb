import {JSX, For, createMemo, createEffect, createContext, useContext, onMount, createRenderEffect, Show} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {Document, Page, PageBlock, PageListOrderedItem, Photo, RichText} from '../layer';
import wrapTelegramRichText from '../lib/richTextProcessor/wrapTelegramRichText';
import styles from './instantView.module.scss';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import classNames from '../helpers/string/classNames';
import {PhotoTsx} from './wrappers/photo';
import {useHotReloadGuard} from '../lib/solidjs/hotReloadGuard';
import {formatDate, formatFullSentTime} from '../helpers/date';
import findUpClassName from '../helpers/dom/findUpClassName';
import cancelEvent from '../helpers/dom/cancelEvent';
import Scrollable from './scrollable2';
import fastSmoothScroll from '../helpers/fastSmoothScroll';
import Animated from '../helpers/solid/animations';
import {unwrap} from 'solid-js/store';
import wrapUrl from '../lib/richTextProcessor/wrapUrl';
import documentFragmentToNodes from '../helpers/dom/documentFragmentToNodes';

type InstantViewContextValue = {
  webPageId: Long,
  page: Page.page,
  randomId: string,
  openNewPage: (url: string) => void,
  collapse: () => void,
  scrollToAnchor: (anchor: string) => void
};

const InstantViewContext = createContext<InstantViewContextValue>();

function onClick(context: InstantViewContextValue, e: MouseEvent) {
  const anchor = findUpClassName(e.target, 'anchor-url') as HTMLAnchorElement;
  // if(anchor) {
  //   cancelEvent(e);
  //   context.openNewPage(anchor.href);
  //   return;
  // }
}

export function InstantView(props: {
  webPageId: Long,
  page: Page.page,
  openNewPage: (url: string) => void,
  collapse: () => void,
  needFadeIn?: boolean,
  anchor?: string // * expect it to be '#name'
}) {
  const value: InstantViewContextValue = {
    get webPageId() {
      return props.webPageId;
    },
    page: props.page,
    randomId: '' + (Math.random() * 1000 | 0),
    openNewPage: props.openNewPage,
    collapse: props.collapse,
    scrollToAnchor: (anchor) => {
      fastSmoothScroll({
        container: scrollableRef,
        element: document.getElementById(value.randomId + anchor.slice(1)) as HTMLElement,
        position: 'start',
        forceDuration: 0
      });
    }
  };

  console.log(props.page);

  if(props.anchor) {
    onMount(() => {
      queueMicrotask(() => {
        value.scrollToAnchor(props.anchor);
      });
    });
  }

  const {i18n, appImManager, rootScope} = useHotReloadGuard();
  let scrollableRef: HTMLDivElement;
  return (
    <InstantViewContext.Provider value={value}>
      <Animated type="cross-fade" appear={props.needFadeIn} mode="add-remove">
        <Scrollable ref={scrollableRef}>
          <div
            dir={props.page.pFlags.rtl ? 'auto' : undefined}
            class={classNames(styles.InstantView, 'text-overflow-wrap')}
            onClick={onClick.bind(null, value)}
          >
            <For each={props.page.blocks}>{(block) => (
              <Block block={block} />
            )}</For>
            <div
              dir="auto"
              class={classNames(styles.Section, styles.Meta, 'secondary')}
            >
              <Show when={props.page.views}>
                {i18n('Views', [props.page.views])}
                {` • `}
              </Show>
              <a
                class={styles.WrongLayout}
                href="#"
                onClick={async(e) => {
                  cancelEvent(e);
                  value.collapse();
                  const user = await rootScope.managers.appUsersManager.resolveUserByUsername('@previews');
                  const startParam = `webpage${value.webPageId}`;
                  appImManager.setInnerPeer({
                    peerId: user.id.toPeerId(false),
                    startParam
                  });
                }}
              >
                {i18n('InstantView.WrongLayout')}
              </a>
            </div>
          </div>
        </Scrollable>
      </Animated>
    </InstantViewContext.Provider>
  );
}

function onMediaResult(ref: HTMLDivElement) {
  const {width, height} = ref.style;
  ref.style.setProperty(
    '--aspect-ratio',
    '' + (parseInt(width) / parseInt(height))
  );
}

function Block(props: {block: PageBlock}) {
  const block = props.block;
  // if(block._ !== 'pageBlockRelatedArticles' && Math.random() !== undefined) {
  //   return;
  // }

  switch(block._) {
    case 'pageBlockTitle':
      return <h1 class={styles.Title}><RichTextRenderer text={block.text} /></h1>;
    case 'pageBlockSubtitle':
      return <h2 class={classNames(styles.Subtitle, 'secondary')}><RichTextRenderer text={block.text} /></h2>;
    case 'pageBlockHeader':
      return <h3 class={styles.Header}><RichTextRenderer text={block.text} /></h3>;
    case 'pageBlockSubheader':
      return <h4 class={styles.Subheader}><RichTextRenderer text={block.text} /></h4>;
    case 'pageBlockParagraph':
      return <p class={styles.Paragraph}><RichTextRenderer text={block.text} /></p>;
    case 'pageBlockPreformatted':
      return <pre class={styles.Preformatted}><RichTextRenderer text={block.text} /></pre>;
    case 'pageBlockFooter':
      return <footer class={styles.Footer}><RichTextRenderer text={block.text} /></footer>;
    case 'pageBlockDivider':
      return <hr class={styles.Divider} />;
    case 'pageBlockOrderedList':
    case 'pageBlockList':
      return (
        <Dynamic
          component={block._ === 'pageBlockOrderedList' ? 'ol' : 'ul'}
          class={classNames(styles.List, 'browser-default')}
        >
          <For each={block.items}>{(item, idx) => (
            <li value={+(item as PageListOrderedItem.pageListOrderedItemText).num || (idx() + 1)}>
              {item._ === 'pageListItemText' || item._ === 'pageListOrderedItemText' ? (
                <RichTextRenderer text={item.text} />
              ) : (
                <For each={item.blocks}>{(subBlock) => (
                  <Block block={subBlock} />
                )}</For>
              )}
            </li>
          )}</For>
        </Dynamic>
      );
    case 'pageBlockBlockquote':
      return (
        <blockquote class={styles.Blockquote}>
          <RichTextRenderer text={block.text} />
          {block.caption && <div class={styles.Caption}><RichTextRenderer text={block.caption} /></div>}
        </blockquote>
      );
    case 'pageBlockCover':
      return (
        <div class={styles.Cover}>
          <Block block={block.cover} />
        </div>
      );
    case 'pageBlockPhoto': {
      const context = useContext(InstantViewContext);
      const photo = unwrap(context.page.photos.find((photo) => photo.id === block.photo_id)) as Photo.photo;
      let ref: HTMLDivElement;
      return (
        <PhotoTsx
          ref={ref}
          class={styles.Media}
          photo={photo}
          withoutPreloader
          onResult={() => onMediaResult(ref)}
        />
      );
    }
    case 'pageBlockVideo': {
      const context = useContext(InstantViewContext);
      const {VideoTsx} = useHotReloadGuard();
      const doc = unwrap(context.page.documents.find((doc) => doc.id === block.video_id)) as Document.document;
      let ref: HTMLDivElement;
      return (
        <VideoTsx
          ref={ref}
          doc={doc}
          class={styles.Media}
          withoutPreloader
          withPreview
          noInfo
          onResult={() => onMediaResult(ref)}
        />
      );
    }
    case 'pageBlockChannel': {
      const {PeerTitleTsx, appImManager} = useHotReloadGuard();
      const {collapse} = useContext(InstantViewContext);
      const peerId = block.channel.id.toPeerId(true);
      return (
        <div class={styles.Section}>
          <div
            class={classNames(
              styles.SectionName,
              styles.Channel,
              'text-bold'
            )}
            onClick={() => {
              collapse();
              appImManager.setInnerPeer({peerId});
            }}
          >
            <PeerTitleTsx peerId={peerId} />
          </div>
        </div>
      );
    }
    case 'pageBlockAuthorDate':
      return (
        <div
          dir="auto"
          class={classNames(
            styles.AuthorDate,
            'secondary',
            useContext(InstantViewContext).page.pFlags.rtl && 'text-right'
          )}
        >
          <Show when={block.author._ !== 'textEmpty'}>
            <RichTextRenderer text={block.author} />
            {` • `}
          </Show>
          {block.published_date ?
            formatFullSentTime(block.published_date, true) :
            formatDate(new Date())}
        </div>
      );
    case 'pageBlockAnchor':
      return (
        <div
          class={styles.Anchor}
          id={useContext(InstantViewContext).randomId + block.name}
        />
      );
    case 'pageBlockRelatedArticles':
      return (
        <div class={styles.Section}>
          <div class={styles.SectionName}>
            {/* {useHotReloadGuard().i18n('InstantView.RelatedArticles')} */}
            <RichTextRenderer text={block.title} />
          </div>
          <For each={block.articles}>{(article, idx) => {
            const wrapped = wrapUrl('tg://iv?url=' + encodeURIComponent(article.url));
            const photo = article.photo_id ?
              unwrap(useContext(InstantViewContext).page.photos.find((photo) => photo.id === article.photo_id)) :
              undefined;
            return (
              <>
                {idx() && <div class={styles.RelatedArticleBorderTop} />}
                <a
                  href={wrapped.url}
                  class={classNames(
                    styles.RelatedArticle,
                    idx() && styles.BorderTop,
                    'hover-effect'
                  )}
                  // @ts-ignore
                  attr:onclick={wrapped.onclick + '(this)'}
                >
                  <div class={classNames(styles.RelatedArticleTitle, 'text-bold')}>
                    <RichTextRenderer text={{_: 'textPlain', text: article.title}} />
                  </div>
                  <div class={styles.RelatedArticleDescription}>
                    <RichTextRenderer text={{_: 'textPlain', text: article.description}} />
                  </div>
                  <div class={classNames(styles.RelatedArticleAuthor, 'secondary')}>
                    <Show when={article.author}>
                      <RichTextRenderer text={{_: 'textPlain', text: article.author}} />
                      {` • `}
                    </Show>
                    {formatFullSentTime(article.published_date, true)}
                  </div>
                  <Show when={photo}>
                    <PhotoTsx
                      photo={photo as Photo.photo}
                      class={styles.RelatedArticlePhoto}
                      boxWidth={100}
                      boxHeight={100}
                      withoutPreloader
                    />
                  </Show>
                </a>
              </>
            );
          }}</For>
        </div>
      );
    default:
      return <div class={styles.Unsupported}>Unsupported block: {block._}</div>;
  }
}

function RichTextRenderer(props: {text: RichText}) {
  const {text, entities} = wrapTelegramRichText(props.text);
  console.log({text, entities}, unwrap(props.text));
  const fragment = wrapRichText(text, {entities});
  return documentFragmentToNodes(fragment);
  // return (<span dir="auto">{fragment}</span>);
  // const textWithEntities = createMemo(() => wrapTelegramRichText(props.text));

  // let ref: HTMLSpanElement;
  // const ret = (<span ref={ref} />);

  // createRenderEffect(() => {
  //   if(ref) {
  //     const {text, entities} = textWithEntities();
  //     console.log(textWithEntities(), props.text);
  //     const wrapped = wrapRichText(text, {entities});
  //     ref.replaceChildren(wrapped);
  //   }
  // });

  // return ret;
}
