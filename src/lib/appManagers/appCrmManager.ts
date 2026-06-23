import {AppManager} from '@appManagers/manager';
import {getDatabaseState} from '@config/databases/state';
import AppStorage from '@lib/storage';
import {
  CRM_API_PREFIX,
  CRM_CONFIG_STORAGE_KEY,
  CRM_ENDPOINTS,
  CrmConfig,
  CrmCustomer,
  CrmFaq,
  CrmTemplate,
  CrmTicketRef,
  CrmTicketStatus,
  CrmUser,
  EMPTY_CRM_CONFIG
} from '@lib/crm/types';

export default class AppCrmManager extends AppManager {
  private storage: AppStorage<Record<string, CrmConfig>, ReturnType<typeof getDatabaseState>>;
  private config: CrmConfig;
  private loadPromise: Promise<void>;

  protected after() {
    this.name = 'CRM';
    this.storage = new AppStorage(getDatabaseState(this.getAccountNumber()), 'session');
    this.config = {...EMPTY_CRM_CONFIG};

    this.loadPromise = this.load();
    return this.loadPromise;
  }

  private async load() {
    const stored = await this.storage.get(CRM_CONFIG_STORAGE_KEY);
    if(stored) {
      this.config = {...EMPTY_CRM_CONFIG, ...stored};
      // An older stored config may carry an empty baseUrl; fall back to the
      // production default so agents never face a blank field.
      if(!this.config.baseUrl) this.config.baseUrl = EMPTY_CRM_CONFIG.baseUrl;
    }
  }

  private async persist() {
    await this.storage.set({[CRM_CONFIG_STORAGE_KEY]: this.config});
    this.rootScope.dispatchEvent('crm_config_update');
  }

  public async getConfig(): Promise<CrmConfig> {
    await this.loadPromise;
    return {...this.config};
  }

  public async setConfig(config: Partial<Pick<CrmConfig, 'enabled' | 'baseUrl'>>): Promise<void> {
    await this.loadPromise;
    this.config = {
      ...this.config,
      ...config,
      baseUrl: (config.baseUrl ?? this.config.baseUrl).trim().replace(/\/+$/, '')
    };
    await this.persist();
  }

  public async isConnected(): Promise<boolean> {
    await this.loadPromise;
    return this.config.enabled && !!this.config.baseUrl && !!this.config.token;
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: {body?: object, query?: Record<string, string>, auth?: boolean} = {}
  ): Promise<T> {
    await this.loadPromise;

    if(!this.config.baseUrl) throw new Error('CRM_NO_BASE_URL');
    if(options.auth !== false && !this.config.token) throw new Error('CRM_NO_TOKEN');

    let url = this.config.baseUrl + CRM_API_PREFIX + path;
    if(options.query) {
      const params = new URLSearchParams();
      for(const key in options.query) {
        if(options.query[key] != null) params.set(key, options.query[key]);
      }
      const qs = params.toString();
      if(qs) url += '?' + qs;
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    if(options.body) headers['Content-Type'] = 'application/json';
    if(options.auth !== false) headers['Authorization'] = 'Bearer ' + this.config.token;

    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if(!response.ok) {
      let serverMessage: string;
      try {
        const body = await response.json();
        serverMessage = body?.message;
      } catch{}
      const error = new Error(serverMessage || ('CRM_HTTP_' + response.status)) as Error & {status: number, serverMessage?: string};
      error.status = response.status;
      error.serverMessage = serverMessage;
      throw error;
    }

    if(response.status === 204) return undefined;
    return response.json();
  }

  private unwrap<T>(payload: {data?: T}): T {
    return (payload?.data ?? []) as T;
  }

  // ── Auth (per-agent OTP → Sanctum token) ──────────────────────────────────
  public async sendOtp(mobile: string): Promise<void> {
    await this.request('POST', CRM_ENDPOINTS.sendOtp, {body: {mobile: mobile.trim()}, auth: false});
  }

  public async verifyOtp(mobile: string, code: string): Promise<CrmUser> {
    const result = await this.request<{token: string, user: CrmUser}>('POST', CRM_ENDPOINTS.verifyOtp, {
      auth: false,
      body: {mobile: mobile.trim(), code: code.trim(), device_name: 'Telegram Web (tweb)'}
    });

    this.config.token = result.token;
    this.config.user = result.user;
    this.config.enabled = true;
    await this.persist();
    return result.user;
  }

  public async me(): Promise<CrmUser> {
    return this.request<CrmUser>('GET', CRM_ENDPOINTS.me);
  }

  public async disconnect(): Promise<void> {
    await this.loadPromise;
    if(this.config.token) {
      try {
        await this.request('DELETE', CRM_ENDPOINTS.logout);
      } catch{}
    }
    this.config.token = '';
    this.config.user = undefined;
    this.config.enabled = false;
    await this.persist();
  }

  // ── 1) FAQ / canned answers ───────────────────────────────────────────────
  public async getTemplates(): Promise<CrmTemplate[]> {
    if(!(await this.isConnected())) return [];
    try {
      return this.unwrap(await this.request<{data: CrmTemplate[]}>('GET', CRM_ENDPOINTS.templates));
    } catch(err) {
      this.log.error('getTemplates failed', err);
      return [];
    }
  }

  public async getFaqs(departmentId?: number): Promise<CrmFaq[]> {
    if(!(await this.isConnected())) return [];
    try {
      return this.unwrap(await this.request<{data: CrmFaq[]}>('GET', CRM_ENDPOINTS.faqs, {
        query: departmentId ? {department_id: '' + departmentId} : undefined
      }));
    } catch(err) {
      this.log.error('getFaqs failed', err);
      return [];
    }
  }

  // ── 3) Customer context ───────────────────────────────────────────────────
  public async searchCustomers(q: string): Promise<CrmCustomer[]> {
    if(!(await this.isConnected()) || (q || '').trim().length < 2) return [];
    try {
      return this.unwrap(await this.request<{data: CrmCustomer[]}>('GET', CRM_ENDPOINTS.customersSearch, {
        query: {q: q.trim()}
      }));
    } catch(err) {
      this.log.error('searchCustomers failed', err);
      return [];
    }
  }

  // ── Ticket lifecycle (open/close) for the chat's customer ─────────────────
  public async getTicketByTelegram(chatId: string): Promise<CrmTicketRef> {
    if(!(await this.isConnected()) || !chatId) return undefined;
    try {
      const result = await this.request<{ticket: CrmTicketRef}>('GET', `${CRM_ENDPOINTS.tickets}/by-telegram/${encodeURIComponent(chatId)}`);
      return result?.ticket || undefined;
    } catch(err) {
      this.log.error('getTicketByTelegram failed', err);
      return undefined;
    }
  }

  // Claim the customer's latest open ticket for THIS agent. Agents share one
  // department Telegram account, so the userbot can't tell them apart — but each
  // agent has their own CRM token, and that token is what authenticates this call.
  // The CRM binds the ticket to this agent (assigned_admin_id), which is what
  // outbound-message attribution and per-agent reports key off. Fire-and-forget.
  public async claimTicketByTelegram(chatId: string): Promise<void> {
    if(!(await this.isConnected()) || !chatId) return;
    try {
      await this.request('POST', `${CRM_ENDPOINTS.tickets}/by-telegram/${encodeURIComponent(chatId)}/claim`);
    } catch(err) {
      this.log.error('claimTicketByTelegram failed', err);
    }
  }

  // Stamp a single outbound message with THIS agent. The agent's CRM token (this
  // request's auth) identifies them; the Telegram message id ties it to the message
  // the CRM's userbot independently ingests — so attribution is exact per message,
  // even when several agents share the department Telegram session. Fire-and-forget.
  public async attributeOutboundMessage(chatId: string, messageId: number): Promise<void> {
    if(!(await this.isConnected()) || !chatId || !messageId) return;
    try {
      await this.request('POST', `${CRM_ENDPOINTS.tickets}/by-telegram/${encodeURIComponent(chatId)}/attribute`, {
        body: {message_id: messageId}
      });
    } catch(err) {
      this.log.error('attributeOutboundMessage failed', err);
    }
  }

  // ── 4) Records: act on an existing ticket ─────────────────────────────────
  public async sendTicketMessage(ticketId: number, text: string) {
    return this.request('POST', `${CRM_ENDPOINTS.tickets}/${ticketId}/message`, {body: {text}});
  }

  public async addTicketNote(ticketId: number, text: string) {
    return this.request('POST', `${CRM_ENDPOINTS.tickets}/${ticketId}/note`, {body: {text}});
  }

  public async updateTicketStatus(ticketId: number, status: CrmTicketStatus) {
    return this.request('PATCH', `${CRM_ENDPOINTS.tickets}/${ticketId}/status`, {body: {status}});
  }
}
