import rootScope from '@lib/rootScope';
import type {MyMessage} from '@appManagers/appMessagesManager';

// Local-only, per-browser-session agent identity.
//
// Multiple human agents can share a single Telegram account, each signed in from
// a different session (browser / device). This module lets each session label the
// outgoing messages IT sent with a local agent name, so an agent can tell their
// own replies apart from those of the others. Nothing is written into the message
// itself — the name lives only in this browser's localStorage and is never sent.

const NAME_KEY = 'agent_name';
const SENT_KEY = 'agent_sent_mids';
const MAX_SENT = 10000;

function makeFullMid(peerId: PeerId, mid: number) {
  return `${peerId}_${mid}`;
}

class AgentIdentity {
  private name: string;
  private sentOrder: string[];
  private sentSet: Set<string>;
  private saveTimeout: number;

  constructor() {
    this.name = this.readName();
    this.sentOrder = this.readSent();
    this.sentSet = new Set(this.sentOrder);

    rootScope.addEventListener('message_sent', this.onMessageSent);
  }

  private readName() {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch{
      return '';
    }
  }

  private readSent(): string[] {
    try {
      const raw = localStorage.getItem(SENT_KEY);
      const parsed = raw && JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch{
      return [];
    }
  }

  private scheduleSave() {
    if(this.saveTimeout) return;
    this.saveTimeout = window.setTimeout(() => {
      this.saveTimeout = 0;
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify(this.sentOrder));
      } catch{}
    }, 1000);
  }

  private onMessageSent = ({message}: {message: MyMessage}) => {
    if(!message || message._ !== 'message' || !message.pFlags.out) return;
    this.markSent(makeFullMid(message.peerId, message.mid));
  };

  private markSent(fullMid: string) {
    if(this.sentSet.has(fullMid)) return;
    this.sentSet.add(fullMid);
    this.sentOrder.push(fullMid);
    if(this.sentOrder.length > MAX_SENT) {
      const removed = this.sentOrder.splice(0, this.sentOrder.length - MAX_SENT);
      removed.forEach((mid) => this.sentSet.delete(mid));
    }
    this.scheduleSave();
    // Defer so the bubbles' own 'message_sent' handler (which remaps temp -> real
    // mid) finishes first; otherwise the live re-tag can't find the bubble yet.
    Promise.resolve().then(() => rootScope.dispatchEvent('agent_message_tagged', {fullMid}));
  }

  public getName() {
    return this.name;
  }

  public setName(name: string) {
    this.name = (name || '').trim().slice(0, 32);
    try {
      if(this.name) localStorage.setItem(NAME_KEY, this.name);
      else localStorage.removeItem(NAME_KEY);
    } catch{}
    rootScope.dispatchEvent('agent_identity_update');
  }

  public wasSentByThisSession(peerId: PeerId, mid: number) {
    return this.sentSet.has(makeFullMid(peerId, mid));
  }
}

const agentIdentity = new AgentIdentity();
export default agentIdentity;
