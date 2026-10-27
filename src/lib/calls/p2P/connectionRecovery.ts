/*
 * Transport recovery for a 1-on-1 call: when the ICE path breaks (a network
 * switch, a NAT rebinding, a dropped Wi-Fi), restart ICE instead of hanging up.
 *
 * Native tgcalls never gives a failed transport a second chance through the
 * browser's own machinery — it gathers continually and watches the OS network
 * monitor — so this ports what a browser can do of it:
 * - restart ICE on `failed`, on a `disconnected` that lasts 2 s, when the
 *   browser comes back `online` and when `navigator.connection` reports a new
 *   network while ICE is disconnected or failed (InstanceV2ReferenceImpl.cpp
 *   maybeRestartIce / updateIsConnected). Chrome fires `change` on every
 *   downlink/rtt estimate update too, so where the connection type is known
 *   only a new type counts, and a first connection still checking is left to
 *   finish its checks;
 * - at most one restart per 5 s until the transport is back
 *   (minRestartIntervalMs there), and another every 5 s for as long as ICE
 *   stays failed or disconnected;
 * - give a call that never connected 20 s of failure before it is dropped
 *   (NativeNetworkingImpl.cpp checkConnectionTimeout). A call that did connect
 *   is ended by the controller's reconnect timeout instead.
 *
 * Either side may restart: a native V2 peer never does, so a callee whose own
 * network changed has to. A restart the callee merely infers from ICE state
 * waits a little for the caller's (which the callee then answers), so both
 * sides do not usually offer at once; glare is resolved by the signaling layer
 * anyway (the callee rolls its offer back).
 *
 * The class only decides WHEN; the restart itself (restartIce + a new offer)
 * and the hang-up are callbacks into CallInstance.
 */

import type {Logger} from '@lib/logger';

export const P2P_ICE_RESTART_MIN_INTERVAL_MS = 5000;
export const P2P_ICE_DISCONNECTED_RESTART_DELAY_MS = 2000;
export const P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS = 20000;
// How long the callee waits for the caller's restart before it restarts itself
// on an ICE-state trigger. Network-change triggers are local knowledge and
// restart at once on either side.
export const P2P_CALLEE_RESTART_DELAY_MS = 2000;
// A restart that cannot begin right now (an offer/answer in flight) is retried.
export const P2P_ICE_RESTART_RETRY_MS = 1000;

export type P2PRecoveryTrigger =
  'ice-failed' |
  'ice-disconnected' |
  'connection-failed' |
  'online' |
  'network-change';

type NetworkInformationLike = EventTarget & {type?: string, effectiveType?: string};

export type P2PConnectionRecoveryOptions = {
  isOutgoing: boolean,
  log: Logger,
  /**
   * Restart ICE now. `false`: the connection cannot start one at the moment
   * (a negotiation is in flight) — it is asked again shortly.
   */
  restart: (trigger: P2PRecoveryTrigger) => boolean,
  /** The transport has failed for 20 s and the call has never connected. */
  giveUp: () => void,
  /** Recovery events for the call's debug log. */
  onEvent?: (event: string) => void,
  now?: () => number,
  /** Where `online` is fired; `window` by default. */
  windowTarget?: EventTarget,
  /** `navigator.connection` by default (Chromium only). */
  networkInformation?: NetworkInformationLike
};

const ICE_TRIGGERS: ReadonlySet<P2PRecoveryTrigger> = new Set(['ice-failed', 'ice-disconnected', 'connection-failed']);

export default class P2PConnectionRecovery {
  private iceConnectionState: RTCIceConnectionState = 'new';
  private hasConnected = false;
  private isStopped = false;
  private isStarted = false;
  private lastRestartAt: number | undefined;
  private restartCount = 0;

  private disconnectedTimer: ReturnType<typeof setTimeout> | undefined;
  private failureTimer: ReturnType<typeof setTimeout> | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private restartTimerAt: number | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly windowTarget: EventTarget | undefined;
  private readonly networkInformation: NetworkInformationLike | undefined;
  // The connection type last seen (Chromium on Android/ChromeOS reports it).
  private networkType: string | undefined;

  constructor(private options: P2PConnectionRecoveryOptions) {
    this.windowTarget = options.windowTarget ?? (typeof(window) !== 'undefined' ? window : undefined);
    this.networkInformation = options.networkInformation ??
      (typeof(navigator) !== 'undefined' ? (navigator as Navigator & {connection?: NetworkInformationLike}).connection : undefined);
    this.networkType = this.networkInformation?.type;
  }

  public get restarts() {
    return this.restartCount;
  }

  private get isIceConnected() {
    return this.iceConnectionState === 'connected' || this.iceConnectionState === 'completed';
  }

  private now() {
    return this.options.now ? this.options.now() : performance.now();
  }

  private log(message: string, details?: Record<string, unknown>) {
    if(details) {
      this.options.log(message, details);
    } else {
      this.options.log(message);
    }
    this.options.onEvent?.(details ? `${message} ${JSON.stringify(details)}` : message);
  }

  public start() {
    if(this.isStarted || this.isStopped) return;
    this.isStarted = true;
    this.windowTarget?.addEventListener('online', this.onOnline);
    this.networkInformation?.addEventListener?.('change', this.onNetworkChange);
  }

  public stop() {
    if(this.isStopped) return;
    this.isStopped = true;
    this.windowTarget?.removeEventListener('online', this.onOnline);
    this.networkInformation?.removeEventListener?.('change', this.onNetworkChange);
    this.clearDisconnectedTimer();
    this.clearRestartTimer();
    this.clearRetryTimer();
    if(this.failureTimer !== undefined) {
      clearTimeout(this.failureTimer);
      this.failureTimer = undefined;
    }
  }

  public setIceConnectionState(state: RTCIceConnectionState) {
    if(this.isStopped || state === this.iceConnectionState) return;
    const previous = this.iceConnectionState;
    this.iceConnectionState = state;

    switch(state) {
      case 'connected':
      case 'completed': {
        const wasRecovering = previous === 'failed' || previous === 'disconnected' || this.restartTimer !== undefined;
        this.hasConnected = true;
        this.clearDisconnectedTimer();
        this.clearRestartTimer();
        this.clearRetryTimer();
        if(this.failureTimer !== undefined) {
          clearTimeout(this.failureTimer);
          this.failureTimer = undefined;
        }
        // Recovered: the next failure may restart at once.
        this.lastRestartAt = undefined;
        if(wasRecovering || this.restartCount) {
          this.log('transport recovered', {iceConnectionState: state, restarts: this.restartCount});
        }
        break;
      }

      case 'disconnected': {
        this.log('ICE disconnected');
        if(this.disconnectedTimer === undefined) {
          this.disconnectedTimer = setTimeout(() => {
            this.disconnectedTimer = undefined;
            if(this.iceConnectionState === 'disconnected') {
              this.requestRestart('ice-disconnected');
            }
          }, P2P_ICE_DISCONNECTED_RESTART_DELAY_MS);
        }
        break;
      }

      case 'failed': {
        this.clearDisconnectedTimer();
        this.log('ICE failed');
        this.onFailure();
        this.requestRestart('ice-failed');
        break;
      }

      case 'closed': {
        this.stop();
        break;
      }

      default:
        break;
    }
  }

  public setConnectionState(state: RTCPeerConnectionState, iceConnectionState = this.iceConnectionState) {
    if(this.isStopped || state !== 'failed') return;

    // The transport failed while ICE still connects: DTLS broke, which no ICE
    // restart can mend — end the call instead of reconnecting until the
    // controller's timeout.
    if(iceConnectionState === 'connected' || iceConnectionState === 'completed') {
      this.log('giving up: DTLS failed over a connected ICE path');
      this.options.giveUp();
      return;
    }

    this.onFailure();
    this.requestRestart('connection-failed');
  }

  /**
   * The peer restarted ICE (an InitialSetup with new credentials): answering
   * its offer restarts our side too, so a pending local restart is dropped and
   * the throttle window starts now.
   */
  public onRemoteRestart() {
    if(this.isStopped) return;
    this.lastRestartAt = this.now();
    if(this.restartTimer !== undefined) {
      this.log('local ICE restart superseded by the peer');
      this.clearRestartTimer();
    }
  }

  private onOnline = () => {
    this.log('network online');
    this.requestRestart('online');
  };

  private onNetworkChange = () => {
    const {type, effectiveType} = this.networkInformation || {};
    const previousType = this.networkType;
    this.networkType = type;
    if(this.iceConnectionState !== 'disconnected' && this.iceConnectionState !== 'failed') {
      return;
    }

    // An estimate update on the same network, not a switch.
    if(type !== undefined && type === previousType) {
      return;
    }

    this.log('network changed', {type, effectiveType, iceConnectionState: this.iceConnectionState});
    this.requestRestart('network-change');
  };

  private onFailure() {
    if(this.hasConnected || this.failureTimer !== undefined) {
      return;
    }

    this.failureTimer = setTimeout(() => {
      this.failureTimer = undefined;
      if(this.isStopped || this.hasConnected) return;
      this.log('giving up: no connection', {timeout: P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS, restarts: this.restartCount});
      this.options.giveUp();
    }, P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS);
  }

  private shouldSkip(trigger: P2PRecoveryTrigger) {
    // Nothing to recover before ICE has even begun.
    if(this.iceConnectionState === 'new') {
      return true;
    }

    // A browser that has just come back online restarts even over a pair ICE
    // still calls connected: the old network is gone, it has not noticed yet.
    return trigger !== 'online' && this.isIceConnected;
  }

  private requestRestart(trigger: P2PRecoveryTrigger) {
    if(this.isStopped || this.shouldSkip(trigger)) return;

    const now = this.now();
    let at = now;
    if(this.lastRestartAt !== undefined) {
      at = Math.max(at, this.lastRestartAt + P2P_ICE_RESTART_MIN_INTERVAL_MS);
    }
    if(!this.options.isOutgoing && ICE_TRIGGERS.has(trigger)) {
      at = Math.max(at, now + P2P_CALLEE_RESTART_DELAY_MS);
    }

    if(at <= now) {
      this.attemptRestart(trigger);
      return;
    }

    if(this.restartTimer !== undefined && this.restartTimerAt <= at) {
      return;
    }

    this.scheduleRestart(trigger, at - now);
    this.log('ICE restart scheduled', {trigger, delay: Math.round(at - now)});
  }

  private scheduleRestart(trigger: P2PRecoveryTrigger, delay: number) {
    this.clearRestartTimer();
    this.restartTimerAt = this.now() + delay;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.restartTimerAt = undefined;
      this.attemptRestart(trigger);
    }, delay);
  }

  private attemptRestart(trigger: P2PRecoveryTrigger) {
    // Whatever was scheduled, this attempt stands for it.
    this.clearRestartTimer();
    if(this.isStopped || this.shouldSkip(trigger)) return;

    if(!this.options.restart(trigger)) {
      this.scheduleRestart(trigger, P2P_ICE_RESTART_RETRY_MS);
      return;
    }

    this.lastRestartAt = this.now();
    ++this.restartCount;
    this.log('ICE restarted', {trigger, restarts: this.restartCount});

    // A restart that leads nowhere may not change the ICE state again (no
    // network, no candidates): keep trying while it reads failed or
    // disconnected. One still checking is left to finish.
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if(this.iceConnectionState === 'failed') {
        this.requestRestart('ice-failed');
      } else if(this.iceConnectionState === 'disconnected') {
        this.requestRestart('ice-disconnected');
      }
    }, P2P_ICE_RESTART_MIN_INTERVAL_MS);
  }

  private clearRetryTimer() {
    if(this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private clearDisconnectedTimer() {
    if(this.disconnectedTimer !== undefined) {
      clearTimeout(this.disconnectedTimer);
      this.disconnectedTimer = undefined;
    }
  }

  private clearRestartTimer() {
    if(this.restartTimer !== undefined) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
      this.restartTimerAt = undefined;
    }
  }
}
