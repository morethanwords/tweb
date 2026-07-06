export const CRM_CONFIG_STORAGE_KEY = 'crmConfig';

// Connection config for the Andropay CRM "Mobile API" (/api/mobile/*).
// Auth is a per-agent Sanctum bearer token obtained via the OTP login flow, so
// it is safe to keep client-side and is scoped to the signed-in agent.
export type CrmUser = {
  id: number,
  full_name?: string,
  display_name?: string,
  mobile?: string,
  avatar_url?: string,
  // Role flag from GET /auth/me (verify-otp doesn't return it — see
  // AppCrmManager.refreshMe). Gates admin-only UI; absent/false = regular agent.
  is_super_admin?: boolean
};

export type CrmConfig = {
  enabled: boolean,
  baseUrl: string, // e.g. https://andropay.xyzlocalhost:8000
  token: string,
  user?: CrmUser
};

// Production CRM. Agents connect to this by default; the base-url field is
// prefilled with it so they only need their mobile + OTP.
export const DEFAULT_CRM_BASE_URL = 'https://andropay.xyz';

export const EMPTY_CRM_CONFIG: CrmConfig = {
  enabled: false,
  baseUrl: DEFAULT_CRM_BASE_URL,
  token: ''
};

// All endpoints live under {baseUrl}/api/mobile — see routes/api.php in the CRM.
export const CRM_API_PREFIX = '/api/mobile';
export const CRM_ENDPOINTS = {
  config: '/config',
  sendOtp: '/auth/send-otp',
  verifyOtp: '/auth/verify-otp',
  logout: '/auth/logout',
  me: '/auth/me',
  templates: '/templates',
  templateImages: (id: number) => '/templates/' + id + '/images',
  faqs: '/faqs',
  agents: '/agents',
  customersSearch: '/customers/search',
  tickets: '/tickets'
};

// GET /config -> {data: {... , reverb: CrmReverbConfig}}. The public Reverb
// endpoint tweb opens a WebSocket to for realtime per-message attribution. The
// app key is a public client credential.
export type CrmReverbConfig = {
  key: string,
  host: string,
  port: number,
  scheme: string
};

// Everything the main-thread Reverb client needs: the public Reverb params plus
// the agent's base url + bearer token (for the /broadcasting/auth handshake).
export type CrmRealtimeConfig = {
  baseUrl: string,
  token: string,
  reverb: CrmReverbConfig
};

// GET /templates -> {data: CrmTemplate[]}
export type CrmTemplate = {
  id: number,
  name: string,
  text: string,
  // origin-relative /storage paths of attached images (prefix with the CRM
  // baseUrl to display). Empty/absent when the template has no images.
  image_urls?: string[]
};

// GET /templates/{id}/images -> {data: CrmTemplateImage[]}. The image bytes as
// base64 data URIs, fetched lazily when an image-bearing template is picked so
// they can be staged as Files in the send-preview.
export type CrmTemplateImage = {
  name: string,
  mime: string,
  data: string // data URI: data:<mime>;base64,<...>
};

// GET /faqs -> {data: CrmFaq[]}
export type CrmFaq = {
  id: number,
  department_id: number,
  question: string,
  answer: string
};

// GET /customers/search?q= -> {data: CrmCustomer[]}
export type CrmCustomer = {
  id: number,
  full_name?: string,
  display_name?: string,
  mobile?: string,
  avatar_url?: string
};

// GET /agents -> {data: CrmAgent[]}
export type CrmAgent = {
  id: number,
  name: string,
  open_ticket_count: number
};

export type CrmTicketStatus = 'open' | 'closed' | 'archived';

export type CrmTicketEventType = 'opened' | 'closed' | 'reopened';

export type CrmTicketEvent = {
  type: CrmTicketEventType,
  at: string // ISO8601
};

// GET /tickets/by-telegram/{chatId} -> {ticket: CrmTicketRef | null}
export type CrmTicketRef = {
  id: number,
  status: CrmTicketStatus,
  events?: CrmTicketEvent[]
};

// GET /tickets/by-telegram/{chatId}/attributions -> {data: CrmAttributionMap}
// Per-message author map: <telegram message id> -> {admin_id, name}. Lets every
// agent session label outbound bubbles with who replied, even though all agents
// share one department Telegram account.
export type CrmMessageAttribution = {
  admin_id: number,
  name: string
};

export type CrmAttributionMap = Record<string, CrmMessageAttribution>;
