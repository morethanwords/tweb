import {For, createEffect, createContext, useContext, Show, createSignal, Setter, onCleanup, createReaction} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {Document, Page, PageBlock, PageCaption, PageListOrderedItem, Photo, RichText} from '../layer';
import wrapTelegramRichText from '../lib/richTextProcessor/wrapTelegramRichText';
import styles from './instantView.module.scss';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import classNames from '../helpers/string/classNames';
import {IconTsx} from './iconTsx';
import GenericTable, {GenericTableRow} from './genericTable';
import {useHotReloadGuard} from '../lib/solidjs/hotReloadGuard';
import {formatDate, formatFullSentTime} from '../helpers/date';
import findUpClassName from '../helpers/dom/findUpClassName';
import cancelEvent from '../helpers/dom/cancelEvent';
import Scrollable, {ScrollableContext} from './scrollable2';
import fastSmoothScroll, {fastSmoothScrollToStart} from '../helpers/fastSmoothScroll';
import Animated from '../helpers/solid/animations';
import {unwrap} from 'solid-js/store';
import wrapUrl from '../lib/richTextProcessor/wrapUrl';
import documentFragmentToNodes from '../helpers/dom/documentFragmentToNodes';
import {CustomEmojiRendererElement} from '../lib/customEmoji/renderer';
import createMiddleware from '../helpers/solid/createMiddleware';
import MySuspense from '../helpers/solid/mySuspense';
import TelegramWebView from './telegramWebView';
import getWebFileLocation from '../helpers/getWebFileLocation';
import makeGoogleMapsUrl from '../helpers/makeGoogleMapsUrl';
import {GeoPoint} from '../layer';
import GeoPin from './geoPin';
import ScrollSaver from '../helpers/scrollSaver';
import {Message} from '../layer';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';

type InstantViewContextValue = {
  webPageId: Long,
  page: Page.page,
  randomId: string,
  openNewPage: (url: string) => void,
  collapse: () => void,
  scrollToAnchor: (anchor: string, instantly: boolean) => void,
  customEmojiRenderer: CustomEmojiRendererElement,
  details: WeakMap<HTMLElement, Setter<boolean>>,
  ready: boolean,
  savingScroll: boolean
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
  anchor?: string, // * expect it to be '#name'
  onReady?: () => void
}) {
  const [ready, setReady] = createSignal(false);
  const value: InstantViewContextValue = {
    get webPageId() {
      return props.webPageId;
    },
    get ready() {
      return ready();
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

      const element = document.getElementById(value.randomId + anchor.slice(1)) as HTMLElement;
      let detailsElement: HTMLElement = element;
      do {
        detailsElement = findUpClassName(detailsElement, styles.Details);
        if(!detailsElement) {
          break;
        }

        value.details.get(detailsElement)(true);
        detailsElement = detailsElement.parentElement;
      } while(true);

      fastSmoothScroll({
        container: scrollableRef,
        element,
        position: 'start',
        forceDuration
      });
    },
    customEmojiRenderer: CustomEmojiRendererElement.create({
      textColor: 'primary-text-color',
      middleware: createMiddleware().get(),
      renderNonSticker: true
    }),
    details: new WeakMap(),
    savingScroll: false
  };

  console.log(props.page);

  let firstAnchor = true;
  createEffect(() => {
    if(!ready()) {
      return;
    }

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
    <Animated type="cross-fade" appear={props.needFadeIn} mode="add-remove">
      <MySuspense
        onReady={() => {
          setReady(true);
          props.onReady?.();
        }}
      >
        <InstantViewContext.Provider value={value}>
          <Scrollable ref={scrollableRef}>
            <div
              dir={props.page.pFlags.rtl ? 'auto' : undefined}
              class={classNames(styles.InstantView, 'text-overflow-wrap')}
              onClick={onClick.bind(null, value)}
            >
              {value.customEmojiRenderer}
              <div class={styles.InstantViewContent}>
                <For each={props.page.blocks}>{(block) => (
                  <Block block={block} paddings={1} />
                )}</For>
              </div>
              <div
                dir="auto"
                class={classNames(styles.InstantViewFooter, 'secondary')}
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
        </InstantViewContext.Provider>
      </MySuspense>
    </Animated>
  );
}

function _onMediaResult(
  ref: HTMLElement,
  width: number,
  height: number,
  paddings: number
) {
  ref.style.setProperty(
    '--aspect-ratio',
    '' + (width / height)
  );

  ref.style.setProperty(
    '--paddings',
    // '' + (paddings > 1 ? paddings + 1 : 0)
    '' + (paddings > 1 ? paddings : 0)
  );
}

function onMediaResult(ref: HTMLDivElement, paddings: number) {
  const {width, height} = ref.style;
  _onMediaResult(ref, parseInt(width), parseInt(height), paddings);
}

function Caption(props: {caption: PageCaption}) {
  const {caption} = props;
  const isTextEmpty = isRichTextEmpty(caption.text);
  const isCreditEmpty = isRichTextEmpty(caption.credit);
  return (
    <Show when={!isTextEmpty || !isCreditEmpty}>
      <div class={classNames(styles.Padding, styles.Caption, 'secondary')}>
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
      return <h1 class={classNames(styles.Padding, styles.Title)}><RichTextRenderer text={block.text} /></h1>;
    case 'pageBlockSubtitle':
      return <h2 class={classNames(styles.Padding, styles.Subtitle, 'secondary')}><RichTextRenderer text={block.text} /></h2>;
    case 'pageBlockHeader':
      return <h3 class={classNames(styles.Padding, styles.Header)}><RichTextRenderer text={block.text} /></h3>;
    case 'pageBlockSubheader':
      return <h4 class={classNames(styles.Padding, styles.Subheader)}><RichTextRenderer text={block.text} /></h4>;
    case 'pageBlockParagraph':
      return <p class={classNames(styles.Padding, styles.Paragraph)}><RichTextRenderer text={block.text} /></p>;
    case 'pageBlockPreformatted':
      return <pre class={classNames(styles.Preformatted)}><RichTextRenderer text={block.text} /></pre>;
    case 'pageBlockFooter':
      return <footer class={classNames(styles.Padding, styles.Footer, 'secondary')}><RichTextRenderer text={block.text} /></footer>;
    case 'pageBlockDivider':
      return <div class={styles.Divider} />;
    case 'pageBlockOrderedList':
    case 'pageBlockList': {
      // * own numbers cannot be perfectly vertical aligned if children is not plain text
      const isOrdered = block._ === 'pageBlockOrderedList';
      const shouldHaveOwnNumbers = isOrdered && block.items.some((item) => item.num && !item.num.match(/^\d+$/));
      const {wrapEmojiText} = useHotReloadGuard();
      return (
        <Dynamic
          component={isOrdered ? 'ol' : 'ul'}
          class={classNames(
            styles.List,
            shouldHaveOwnNumbers && styles.ListOrdered,
            'browser-default'
          )}
        >
          <For each={block.items}>{(item, idx) => (
            <li class={styles.ListItem}>
              {shouldHaveOwnNumbers && (
                <span class={styles.ListItemNumber}>
                  {(item as PageListOrderedItem.pageListOrderedItemText).num ?
                    wrapEmojiText((item as PageListOrderedItem.pageListOrderedItemText).num) :
                    idx() + 1}
                  {`. `}
                </span>
              )}
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
    }
    case 'pageBlockBlockquote':
      return (
        <div class={classNames(styles.Padding, styles.BlockquoteWrapper)}>
          <blockquote class={styles.Blockquote}>
            <div class={styles.BlockquoteBorder} />
            <RichTextRenderer text={block.text} />
            <Show when={!isRichTextEmpty(block.caption)}>
              <div class={styles.BlockquoteCaption}>
                <RichTextRenderer text={block.caption} />
              </div>
            </Show>
          </blockquote>
        </div>
      );
    case 'pageBlockCover':
      return (
        <div class={styles.Cover}>
          <Block block={block.cover} paddings={props.paddings} />
        </div>
      );
    case 'pageBlockPhoto': {
      const context = useContext(InstantViewContext);
      const {PhotoTsx} = useHotReloadGuard();
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
    case 'pageBlockAudio': {
      const context = useContext(InstantViewContext);
      const {DocumentTsx} = useHotReloadGuard();
      const doc = unwrap(context.page.documents.find((doc) => doc.id === block.audio_id)) as Document.document;

      const message: Message.message = {
        _: 'message',
        id: (Number(block.audio_id) || 0) as number, // Fake ID
        peer_id: {_: 'peerUser', user_id: 0},
        date: 0,
        message: '',
        media: {
          _: 'messageMediaDocument',
          document: doc,
          pFlags: {}
        },
        pFlags: {},
        mid: (Number(block.audio_id) || 0) as number, // Fake MID
        peerId: NULL_PEER_ID
      };

      return (
        <>
          <DocumentTsx
            class={classNames(styles.Padding, styles.Audio)}
            message={message}
            withTime={false}
            autoDownloadSize={10 * 1024 * 1024} // 10MB auto-download limit
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
      );
    }
    case 'pageBlockAuthorDate':
      return (
        <div
          dir="auto"
          class={classNames(
            styles.Padding,
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
    case 'pageBlockRelatedArticles': {
      const {PhotoTsx} = useHotReloadGuard();
      return (
        <>
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
                {idx() && <div class={styles.Border} />}
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
                    <Show when={article.published_date}>
                      <span dir="auto">{formatFullSentTime(article.published_date, true)}</span>
                    </Show>
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
        </>
      );
    }
    case 'pageBlockEmbed': {
      const context = useContext(InstantViewContext);
      const {PhotoTsx} = useHotReloadGuard();
      const isFullWidth = block.pFlags?.full_width;
      const posterPhoto = block.poster_photo_id ?
        unwrap(context.page.photos.find((photo) => photo.id === block.poster_photo_id)) as Photo.photo :
        undefined;

      const [height, setHeight] = createSignal(0);
      const webView = block.html || block.url ?
        new TelegramWebView({html: block.html, url: block.url}) :
        undefined;
      if(webView) {
        webView.iframe.classList.add(styles.EmbedIframe);
        webView.iframe.scrolling = block.pFlags?.allow_scrolling ? 'yes' : 'no';
        webView.iframe.allowFullscreen = true;

        if(block.url) {
          webView.iframe.style.width = '100%';
          webView.iframe.style.height = '100%';
          webView.iframe.style.border = '0';
        }

        createEffect(() => {
          if(!context.ready) {
            return;
          }

          queueMicrotask(() => {
            if(!cleaned) {
              webView.onMount();
            }
          });
        });

        let cleaned = false;
        onCleanup(() => {
          cleaned = true;
          webView.destroy();
        });

        const scrollableContext = useContext(ScrollableContext);
        webView.addEventListener('resize_frame', ({height}) => {
          if(!height) {
            return;
          }

          const scrollSaver = context.savingScroll ? undefined : new ScrollSaver(scrollableContext, undefined, false);
          if(scrollSaver) {
            context.savingScroll = true;
            scrollSaver.save();
          }

          setHeight(height);
          if(scrollSaver) queueMicrotask(() => {
            queueMicrotask(() => {
              context.savingScroll = false;
              scrollSaver.restore();
            });
          });
        });
      }

      return (
        <>
          <div
            ref={(ref) => {
              _onMediaResult(
                ref,
                block.w || 4,
                block.h || 3,
                Math.max(isFullWidth ? 0 : 2, props.paddings)
              );
            }}
            class={classNames(
              styles.Media,
              styles.Embed,
              isFullWidth ? styles.EmbedFullWidth : styles.EmbedAutoWidth,
              height() && styles.EmbedHasHeight
            )}
            style={{
              '--height': height() && height() + 'px'
            }}
          >
            <Show when={!webView} fallback={webView.iframe}>
              <Show when={posterPhoto}>
                <PhotoTsx
                  photo={posterPhoto}
                  withoutPreloader
                />
              </Show>
            </Show>
          </div>
          <Caption caption={block.caption} />
        </>
      );
    }
    case 'pageBlockEmbedPost': {
      const context = useContext(InstantViewContext);
      const {Row, PhotoTsx} = useHotReloadGuard();
      const authorPhoto = block.author_photo_id ?
        unwrap(context.page.photos.find((photo) => photo.id === block.author_photo_id)) as Photo.photo :
        undefined;

      return (
        <div class={styles.Post}>
          <div class={styles.PostBorder} />
          <Row class={styles.PostAuthor}>
            <Row.Title class="text-bold">
              <RichTextRenderer text={{_: 'textPlain', text: block.author}} />
            </Row.Title>
            <Row.Subtitle>
              {formatFullSentTime(block.date, true)}
            </Row.Subtitle>
            <Row.Media size="abitbigger">
              <PhotoTsx
                class={styles.PostAuthorPhoto}
                photo={authorPhoto}
                withoutPreloader
                boxWidth={42}
                boxHeight={42}
              />
            </Row.Media>
          </Row>
          <div class={styles.PostContent}>
            <For each={block.blocks}>{(subBlock) => (
              <Block block={subBlock} paddings={props.paddings + 2} />
            )}</For>
          </div>
        </div>
      );
    }
    case 'pageBlockMap': {
      const geo = block.geo as GeoPoint.geoPoint;
      const url = makeGoogleMapsUrl(geo);
      const location = getWebFileLocation(geo, block.w, block.h, block.zoom);
      const {PhotoTsx} = useHotReloadGuard();

      return (
        <>
          <a
            ref={(ref) => {
              _onMediaResult(
                ref,
                block.w,
                block.h,
                props.paddings
              );
            }}
            href={url}
            target="_blank"
            class={styles.Map}
            style={{'--max-height': block.h + 'px'}}
          >
            <PhotoTsx
              photo={location}
              class={styles.Media}
              withoutPreloader
            />
            <GeoPin />
          </a>
          <Caption caption={block.caption} />
        </>
      );
    }
    case 'pageBlockKicker':
      return (
        <div class={classNames(styles.Padding, styles.Kicker, 'text-bold')}>
          <RichTextRenderer text={block.text} />
        </div>
      );
    case 'pageBlockPullquote':
      return (
        <div class={styles.Pullquote}>
          <RichTextRenderer text={block.text} />
          <Show when={!isRichTextEmpty(block.caption)}>
            <div class={styles.BlockquoteCaption}>
              <RichTextRenderer text={block.caption} />
            </div>
          </Show>
        </div>
      );
    case 'pageBlockDetails': {
      const [open, setOpen] = createSignal(!!block.pFlags.open);
      const detailsMap = useContext(InstantViewContext).details;
      return (
        <div
          ref={(ref) => {detailsMap.set(ref, setOpen)}}
          class={classNames(styles.Details)}
        >
          <div
            class={classNames(styles.DetailsSummary, 'hover-effect')}
            onClick={() => setOpen(!open())}
          >
            <IconTsx
              icon="down"
              class={classNames(styles.DetailsIcon, open() && styles.DetailsIconOpen)}
            />
            <div class={classNames(styles.DetailsTitle, 'text-bold')}>
              <RichTextRenderer text={block.title} />
            </div>
          </div>
          <div class={styles.Border} />
          <div
            class={classNames(
              styles.DetailsContent,
              open() && styles.DetailsContentOpen
            )}
          >
            <div class={styles.DetailsContentInner}>
              <For each={block.blocks}>{(subBlock) => (
                <Block block={subBlock} paddings={props.paddings} />
              )}</For>
            </div>
          </div>
        </div>
      );
    }
    default:
      return (
        <div class={classNames(styles.Padding, styles.Unsupported)}>
          Unsupported block: {block._}
        </div>
      );
  }
}

function isRichTextEmpty(text: RichText) {
  return text._ === 'textEmpty' || (text._ === 'textPlain' && !text.text.trim());
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
