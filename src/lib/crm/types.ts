export const CRM_CONFIG_STORAGE_KEY = 'crmConfig';

// Connection config for the Andropay CRM "Mobile API" (/api/mobile/*).
// Auth is a per-agent Sanctum bearer token obtained via the OTP login flow, so
// it is safe to keep client-side and is scoped to the signed-in agent.
export type CrmUser = {
  id: number,
  full_name?: string,
  display_name?: string,
  mobile?: string,
  avatar_url?: string
};

export type CrmConfig = {
  enabled: boolean,
  baseUrl: string, // e.g. http://localhost:8000
  token: string,
  user?: CrmUser
};

export const EMPTY_CRM_CONFIG: CrmConfig = {
  enabled: false,
  baseUrl: '',
  token: ''
};

// All endpoints live under {baseUrl}/api/mobile — see routes/api.php in the CRM.
export const CRM_API_PREFIX = '/api/mobile';
export const CRM_ENDPOINTS = {
  sendOtp: '/auth/send-otp',
  verifyOtp: '/auth/verify-otp',
  logout: '/auth/logout',
  me: '/auth/me',
  templates: '/templates',
  faqs: '/faqs',
  agents: '/agents',
  customersSearch: '/customers/search',
  tickets: '/tickets'
};

// GET /templates -> {data: CrmTemplate[]}
export type CrmTemplate = {
  id: number,
  name: string,
  text: string
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
