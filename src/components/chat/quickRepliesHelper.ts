import type ChatInput from '@components/chat/input';
import Scrollable from '@components/scrollable';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {Middleware} from '@helpers/middleware';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import AutocompleteHelper from '@components/chat/autocompleteHelper';
import AutocompleteHelperController from '@components/chat/autocompleteHelperController';
import {AppManagers} from '@lib/managers';
import {QuickReply} from '@lib/quickReplies/types';
import rootScope from '@lib/rootScope';

type HelperReply = {
  id: string,
  title: string,
  text: string,
  source?: 'crm',
  // set for CRM templates that carry attached images, sent alongside the text
  crmTemplateId?: number,
  imageCount?: number
};

// * keep the combined local + CRM reply list warm so typing each `/` query doesn't re-hit the
// * CRM network (getTemplates / getFaqs are uncached). refreshed on a short TTL and on the
// * quick_replies_update event below.
const CACHE_TTL = 60_000;

export default class QuickRepliesHelper extends AutocompleteHelper {
  private static BASE_CLASS = 'quick-replies-helper';
  private static LIST_ELEMENT = QuickRepliesHelper.BASE_CLASS + '-list-element';

  private scrollable: Scrollable;
  // * the currently rendered, filtered replies — onSelect maps the chosen element back via its index
  private rendered: HelperReply[];

  private cache: HelperReply[];
  private cacheTime: number;
  private cachePromise: Promise<HelperReply[]>;

  constructor(
    appendTo: HTMLElement,
    controller: AutocompleteHelperController,
    private chatInput: ChatInput,
    private managers: AppManagers
  ) {
    super({
      appendTo,
      controller,
      listType: 'y',
      onSelect: (target) => {
        const index = +(target as HTMLElement).dataset.index;
        const reply = this.rendered?.[index];
        if(!reply) return;
        // * isHelper=true replaces the typed `/query` token with the reply text; an
        // * image-bearing CRM template additionally stages its images in the send-preview
        this.chatInput.insertQuickReply({
          text: reply.text,
          crmTemplateId: reply.crmTemplateId,
          hasImages: !!reply.imageCount,
          isHelper: true
        });
      }
    });

    this.container.classList.add(QuickRepliesHelper.BASE_CLASS);

    rootScope.addEventListener('quick_replies_update', this.invalidate);
  }

  public init() {
    this.list = document.createElement('div');
    this.list.classList.add(QuickRepliesHelper.BASE_CLASS + '-list');

    this.container.append(this.list);

    this.scrollable = new Scrollable(this.container);

    this.addEventListener('visible', () => {
      setTimeout(() => { // it is not rendered yet
        this.scrollable.scrollPosition = 0;
      }, 0);
    });
  }

  private invalidate = () => {
    this.cache = undefined;
    this.cacheTime = 0;
    this.cachePromise = undefined;
  };

  private getReplies(): Promise<HelperReply[]> {
    if(this.cache && (Date.now() - this.cacheTime) < CACHE_TTL) {
      return Promise.resolve(this.cache);
    }

    return this.cachePromise ??= Promise.all([
      this.managers.appQuickRepliesManager.getQuickReplies(),
      this.managers.appCrmManager.getTemplates(),
      this.managers.appCrmManager.getFaqs()
    ]).then(([local, templates, faqs]) => {
      const combined: HelperReply[] = [
        ...local.map((r: QuickReply) => ({id: r.id, title: r.title, text: r.text})),
        ...templates.map((t) => ({
          id: 'crm-t-' + t.id,
          title: t.name,
          text: t.text,
          source: 'crm' as const,
          crmTemplateId: t.id,
          imageCount: t.image_urls?.length || 0
        })),
        ...faqs.map((f) => ({id: 'crm-f-' + f.id, title: f.question, text: f.answer, source: 'crm' as const}))
      ];

      this.cache = combined;
      this.cacheTime = Date.now();
      this.cachePromise = undefined;
      return combined;
    }, (err) => {
      this.cachePromise = undefined;
      throw err;
    });
  }

  private static filter(replies: HelperReply[], query: string) {
    const q = query.trim().toLowerCase();
    if(!q) return replies;
    return replies.filter((reply) =>
      reply.title.toLowerCase().includes(q) || reply.text.toLowerCase().includes(q)
    );
  }

  public checkQuery(query: string) {
    // * `query` is the full autocomplete token including the leading slash
    const q = query.replace(/^\//, '');

    const middleware = this.getMiddleware();
    this.getReplies().then((replies) => {
      if(!middleware()) return;
      this.render(QuickRepliesHelper.filter(replies, q), middleware);
    }, () => {});

    return true;
  }

  public render(replies: HelperReply[], middleware: Middleware) {
    if(this.init) {
      if(!replies.length) {
        return;
      }

      this.init();
      this.init = null;
    }

    this.rendered = replies;

    if(!replies.length) {
      this.toggle(true);
      return;
    }

    this.list.replaceChildren();
    replies.forEach((reply, index) => {
      this.list.append(QuickRepliesHelper.listElement(reply, index));
    });

    this.toggle(false);
    this.scrollable.scrollPosition = 0;
  }

  private static listElement(reply: HelperReply, index: number) {
    const BASE = QuickRepliesHelper.LIST_ELEMENT;

    const div = document.createElement('div');
    div.classList.add(BASE);
    div.dataset.index = '' + index;

    const name = document.createElement('div');
    name.classList.add(BASE + '-name');
    setInnerHTML(name, wrapEmojiText(reply.title));

    if(reply.source === 'crm') {
      const badge = document.createElement('span');
      badge.classList.add(BASE + '-badge');
      badge.textContent = 'CRM';
      name.append(badge);
    }

    if(reply.imageCount) {
      const images = document.createElement('span');
      images.classList.add(BASE + '-images');
      images.textContent = (reply.imageCount > 1 ? reply.imageCount + ' ' : '') + '🖼';
      name.append(images);
    }

    const text = document.createElement('div');
    text.classList.add(BASE + '-text');
    setInnerHTML(text, wrapEmojiText(reply.text));

    div.append(name, text);

    return div;
  }
}
