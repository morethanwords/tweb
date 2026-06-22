import {AppManager} from '@appManagers/manager';
import {getDatabaseState} from '@config/databases/state';
import AppStorage from '@lib/storage';
import {
  QUICK_REPLIES_MAX,
  QUICK_REPLY_MAX_TEXT_LENGTH,
  QUICK_REPLY_MAX_TITLE_LENGTH,
  QUICK_REPLIES_STORAGE_KEY,
  QuickRepliesData,
  QuickReply
} from '@lib/quickReplies/types';

export default class AppQuickRepliesManager extends AppManager {
  private storage: AppStorage<Record<string, QuickRepliesData>, ReturnType<typeof getDatabaseState>>;
  private data: QuickRepliesData;
  private loadPromise: Promise<void>;

  protected after() {
    this.name = 'QR';
    this.storage = new AppStorage(getDatabaseState(this.getAccountNumber()), 'session');
    this.data = {replies: []};

    this.loadPromise = this.load();
    return this.loadPromise;
  }

  private async load() {
    const stored = await this.storage.get(QUICK_REPLIES_STORAGE_KEY);
    if(stored?.replies) {
      this.data = stored;
    }
  }

  private async save() {
    await this.storage.set({[QUICK_REPLIES_STORAGE_KEY]: this.data});
  }

  private sanitize(value: string, maxLength: number) {
    return (value || '').trim().slice(0, maxLength);
  }

  private dispatchUpdate() {
    this.rootScope.dispatchEvent('quick_replies_update');
  }

  public async getQuickReplies(): Promise<QuickReply[]> {
    await this.loadPromise;
    return this.data.replies.slice();
  }

  public async getQuickReply(id: string): Promise<QuickReply> {
    await this.loadPromise;
    return this.data.replies.find((reply) => reply.id === id);
  }

  public async addQuickReply(title: string, text: string): Promise<QuickReply> {
    await this.loadPromise;

    if(this.data.replies.length >= QUICK_REPLIES_MAX) {
      throw new Error('QUICK_REPLIES_LIMIT');
    }

    const reply: QuickReply = {
      id: '' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      title: this.sanitize(title, QUICK_REPLY_MAX_TITLE_LENGTH),
      text: this.sanitize(text, QUICK_REPLY_MAX_TEXT_LENGTH),
      date: Date.now()
    };

    this.data.replies.push(reply);
    await this.save();
    this.dispatchUpdate();
    return reply;
  }

  public async updateQuickReply(id: string, title: string, text: string): Promise<QuickReply> {
    await this.loadPromise;

    const reply = this.data.replies.find((reply) => reply.id === id);
    if(!reply) return;

    reply.title = this.sanitize(title, QUICK_REPLY_MAX_TITLE_LENGTH);
    reply.text = this.sanitize(text, QUICK_REPLY_MAX_TEXT_LENGTH);
    reply.date = Date.now();

    await this.save();
    this.dispatchUpdate();
    return reply;
  }

  public async deleteQuickReply(id: string): Promise<void> {
    await this.loadPromise;

    const index = this.data.replies.findIndex((reply) => reply.id === id);
    if(index === -1) return;

    this.data.replies.splice(index, 1);
    await this.save();
    this.dispatchUpdate();
  }
}
