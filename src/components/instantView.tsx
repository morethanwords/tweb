import {JSX, For, createMemo, createEffect, createContext, useContext, onMount, createRenderEffect, Show} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {Document, Page, PageBlock, PageCaption, PageListOrderedItem, Photo, RichText} from '../layer';
import wrapTelegramRichText from '../lib/richTextProcessor/wrapTelegramRichText';
import styles from './instantView.module.scss';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import classNames from '../helpers/string/classNames';
import {PhotoTsx} from './wrappers/photo';
import GenericTable, {GenericTableRow} from './genericTable';
import {useHotReloadGuard} from '../lib/solidjs/hotReloadGuard';
import {formatDate, formatFullSentTime} from '../helpers/date';
import findUpClassName from '../helpers/dom/findUpClassName';
import cancelEvent from '../helpers/dom/cancelEvent';
import Scrollable from './scrollable2';
import fastSmoothScroll, {fastSmoothScrollToStart} from '../helpers/fastSmoothScroll';
import Animated from '../helpers/solid/animations';
import {unwrap} from 'solid-js/store';
import wrapUrl from '../lib/richTextProcessor/wrapUrl';
import documentFragmentToNodes from '../helpers/dom/documentFragmentToNodes';
import {CustomEmojiRendererElement} from '../lib/customEmoji/renderer';
import createMiddleware from '../helpers/solid/createMiddleware';

type InstantViewContextValue = {
  webPageId: Long,
  page: Page.page,
  randomId: string,
  openNewPage: (url: string) => void,
  collapse: () => void,
  scrollToAnchor: (anchor: string, instantly: boolean) => void,
  customEmojiRenderer: CustomEmojiRendererElement
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
    scrollToAnchor: (anchor, instantly) => {
      const forceDuration = instantly ? 0 : undefined;
      if(!anchor) {
        fastSmoothScrollToStart(scrollableRef, 'y', forceDuration);
        return;
      }

      fastSmoothScroll({
        container: scrollableRef,
        element: document.getElementById(value.randomId + anchor.slice(1)) as HTMLElement,
        position: 'start',
        forceDuration
      });
    },
    customEmojiRenderer: CustomEmojiRendererElement.create({
      textColor: 'primary-text-color',
      middleware: createMiddleware().get(),
      renderNonSticker: true
    })
  };

  console.log(props.page);

  let firstAnchor = true;
  createEffect(() => {
    const anchor = props.anchor;
    const _firstAnchor = firstAnchor;
    firstAnchor = false;
    if(_firstAnchor && !anchor) {
      return;
    }

    queueMicrotask(() => {
      value.scrollToAnchor(anchor, _firstAnchor);
    });
  });

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
            {value.customEmojiRenderer}
            <For each={props.page.blocks}>{(block) => (
              <Block block={block} paddings={1} />
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

function onMediaResult(ref: HTMLDivElement, paddings: number) {
  const {width, height} = ref.style;
  ref.style.setProperty(
    '--aspect-ratio',
    '' + (parseInt(width) / parseInt(height))
  );

  ref.style.setProperty(
    '--paddings',
    '' + (paddings > 1 ? paddings : 0)
  );
}

function Caption(props: {caption: PageCaption}) {
  const {caption} = props;
  const isTextEmpty = isRichTextEmpty(caption.text);
  const isCreditEmpty = isRichTextEmpty(caption.credit);
  return (
    <Show when={!isTextEmpty || !isCreditEmpty}>
      <div class={classNames(styles.Caption, 'secondary')}>
        <Show when={!isTextEmpty}>
          <div class={classNames(styles.CaptionText, 'text-bold')}>
            <RichTextRenderer text={caption.text} />
          </div>
        </Show>
        <Show when={!isCreditEmpty}>
          <div class={styles.CaptionCredit}>
            <RichTextRenderer text={caption.credit} />
          </div>
        </Show>
      </div>
    </Show>
  );
}

function Block(props: {block: PageBlock, paddings: number}) {
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
            <li
              class={styles.ListItem}
              value={+(item as PageListOrderedItem.pageListOrderedItemText).num || (idx() + 1)}
            >
              {item._ === 'pageListItemText' || item._ === 'pageListOrderedItemText' ? (
                <RichTextRenderer text={item.text} />
              ) : (
                <For each={item.blocks}>{(subBlock) => (
                  <Block block={subBlock} paddings={props.paddings + 1} />
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
          <Show when={!isRichTextEmpty(block.caption)}>
            <div class={styles.BlockquoteCaption}>
              <RichTextRenderer text={block.caption} />
            </div>
          </Show>
        </blockquote>
      );
    case 'pageBlockCover':
      return (
        <div class={styles.Cover}>
          <Block block={block.cover} paddings={props.paddings} />
        </div>
      );
    case 'pageBlockPhoto': {
      const context = useContext(InstantViewContext);
      const photo = unwrap(context.page.photos.find((photo) => photo.id === block.photo_id)) as Photo.photo;
      let ref: HTMLDivElement;
      return (
        <>
          <PhotoTsx
            ref={ref}
            class={styles.Media}
            photo={photo}
            withoutPreloader
            onResult={() => onMediaResult(ref, props.paddings)}
          />
          <Caption caption={block.caption} />
        </>
      );
    }
    case 'pageBlockVideo': {
      const context = useContext(InstantViewContext);
      const {VideoTsx} = useHotReloadGuard();
      const doc = unwrap(context.page.documents.find((doc) => doc.id === block.video_id)) as Document.document;
      let ref: HTMLDivElement;
      return (
        <>
          <VideoTsx
            ref={ref}
            doc={doc}
            class={styles.Media}
            withoutPreloader
            withPreview
            noInfo
            onResult={() => onMediaResult(ref, props.paddings)}
          />
          <Caption caption={block.caption} />
        </>
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
          <Show when={!isRichTextEmpty(block.author)}>
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
    case 'pageBlockTable': {
      const rows: GenericTableRow[] = block.rows.map((row) => ({
        cells: row.cells.map((cell) => ({
          content: cell.text ? <RichTextRenderer text={cell.text} /> : undefined,
          header: cell.pFlags.header,
          colspan: cell.colspan,
          rowspan: cell.rowspan,
          alignCenter: cell.pFlags.align_center,
          alignRight: cell.pFlags.align_right,
          valignMiddle: cell.pFlags.valign_middle,
          valignBottom: cell.pFlags.valign_bottom
        }))
      }));

      return (
        <div class={styles.TableWrapper}>
          <Show when={!isRichTextEmpty(block.title)}>
            <div class={styles.TableName}>
              <RichTextRenderer text={block.title} />
            </div>
          </Show>
          <div class={styles.Table}>
            <GenericTable
              rows={rows}
              bordered={block.pFlags.bordered}
              striped={block.pFlags.striped}
            />
          </div>
        </div>
      );
    }
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
                  dir="auto"
                  href={wrapped.url}
                  class={classNames(
                    styles.RelatedArticle,
                    photo && styles.WithPhoto,
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
                    <span dir="auto">{formatFullSentTime(article.published_date, true)}</span>
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
    case 'pageBlockKicker':
      return (
        <div class={classNames(styles.Kicker, 'text-bold')}>
          <RichTextRenderer text={block.text} />
        </div>
      );
    default:
      return <div class={styles.Unsupported}>Unsupported block: {block._}</div>;
  }
}

function isRichTextEmpty(text: RichText) {
  return text._ === 'textEmpty';
}

function RichTextRenderer(props: {text: RichText}) {
  const {webPageId, page, randomId, customEmojiRenderer} = useContext(InstantViewContext);
  const {text, entities} = wrapTelegramRichText(
    props.text,
    {webPageId, url: page.url, randomId}
  );

  console.log({text, entities}, unwrap(props.text));
  const fragment = wrapRichText(text, {entities, customEmojiRenderer});
  fragment.querySelectorAll('[onclick="tg_iv(this)"]').forEach((el) => {
    el.classList.add(styles.Anchor);
  });
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
