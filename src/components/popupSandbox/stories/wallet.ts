/*
 * The wallet window: every screen against made-up chain data. The engine (WebAssembly) still loads for real —
 * address formatting needs it — but nothing reaches the chain: the provider proxy is refused, so fee quotes and
 * the engine's own refresh fail the way an offline provider would.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import {defineStories} from '../registry';
import {
  walletSandboxAddress,
  walletSandboxGiftBySlug,
  walletSandboxManagers,
  walletSandboxNfts,
  walletSandboxOtherAddress,
  walletSandboxParkedRecord,
  walletSandboxPublicKey,
  walletSandboxRotatedWords,
  walletSandboxRotationFee,
  walletSandboxTransactions,
  walletSandboxUserId,
  walletSandboxWords
} from '../fixtures';
import pause from '@helpers/schedulers/pause';
import type {PopupStoryContext} from '../context';
import type {Message, WalletTransaction} from '@layer';
import type {WalletPendingTransfer} from '@components/wallet/store';
import type {WalletTransactionLive} from '@components/wallet/transactionPopup';
import {createSignal} from 'solid-js';

/** Lays `values` over `target`'s own properties; the returned call puts back what was there. */
function overlay<T extends object>(target: T, values: Partial<T>) {
  const previous = Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(target, key)] as const);
  Object.assign(target, values);
  return () => previous.forEach(([key, descriptor]) => {
    if(descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key as keyof T];
  });
}

/**
 * The tab-side session keeps the device's keys itself, out of the managers' reach: an old wallet's key is laid
 * over its vault for the story — read, revealed and dropped there, the real vault never touched — and taken off
 * when the sandbox closes the story.
 */
async function overlayParkedWallet() {
  const {default: WalletSession} = await import('@lib/wallet/walletSession');
  const session = WalletSession.get();
  const vault = session.vault;
  let records = [walletSandboxParkedRecord];
  const isFixture = (secretRef: string) => records.some((record) => record.secretRef === secretRef);
  const hasSecret = vault.hasSecret.bind(vault), deleteSecret = vault.deleteSecret.bind(vault);
  const restoreVault = overlay(vault, {
    getParkedCustody: async() => records.slice(),
    hasSecret: async(secretRef: string) => isFixture(secretRef) || hasSecret(secretRef),
    deleteSecret: async(secretRef: string) => isFixture(secretRef) ? undefined : deleteSecret(secretRef),
    deleteParkedCustody: async(recordId: string) => {
      records = records.filter((record) => record.recordId !== recordId);
    }
  });
  const restoreSession = overlay(session, {revealParked: async() => walletSandboxWords.slice()});
  return () => {
    restoreVault();
    restoreSession();
  };
}

/** The collectible's fresh emulation, answered: the provider is refused in the sandbox. */
async function overlayNftPreview() {
  const {default: WalletSession} = await import('@lib/wallet/walletSession');
  return overlay(WalletSession.get(), {
    previewNftTransfer: async() => ({
      messages: [],
      validUntil: 0,
      messageBocBase64: '',
      emulation: {
        mcBlockSeqno: 0,
        walletFeesNanograms: '3200000',
        traceFeesNanograms: '31400000',
        transactionCount: 3,
        actions: [],
        transactions: [],
        traceSucceeded: true,
        isIncomplete: false
      }
    })
  });
}

/** A Gram transfer's fee quote, answered (`fee`) or never answered (still loading): the provider is refused here. */
async function overlayFeePreview(fee?: string) {
  const {default: WalletSession} = await import('@lib/wallet/walletSession');
  return overlay(WalletSession.get(), {
    previewSend: () => fee === undefined ? new Promise<never>(() => {}) : Promise.resolve({
      messages: [],
      validUntil: 0,
      messageBocBase64: '',
      emulation: {
        mcBlockSeqno: 0,
        walletFeesNanograms: fee,
        traceFeesNanograms: fee,
        transactionCount: 1,
        actions: [],
        transactions: [],
        traceSucceeded: true,
        isIncomplete: false
      }
    })
  });
}

/** The recipient picker with `query` typed into its search, once the picker is there */
async function showWalletRecipientQuery(query: string) {
  const {default: showWalletPopup} = await import('@components/wallet');
  await showWalletPopup({screen: 'recipient', params: {}});
  for(let i = 0; i < 100; ++i) {
    const input = document.querySelector<HTMLInputElement>('.popup .selector-search-input-container input');
    if(input) {
      input.value = query;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      return;
    }

    await pause(50);
  }
}

/** The amount screen for the sandbox's user (or a bare address), with what a link would bring */
async function showWalletAmount(ctx: PopupStoryContext, options: {address?: boolean, nanograms?: string, comment?: string} = {}) {
  const {default: showWalletPopup} = await import('@components/wallet');
  showWalletPopup({screen: 'amount', params: {
    recipient: options.address ?
      {address: walletSandboxOtherAddress, bounce: true} :
      {address: walletSandboxOtherAddress, bounce: false, userId: ctx.peer('private').toUserId(), publicKey: walletSandboxPublicKey},
    nanograms: options.nanograms,
    comment: options.comment
  }});
}

defineStories('Wallet', [
  {
    // * not a popup: transfer cards the way a chat shows them, two of them settling a moment after opening
    id: 'wallet/chatCards',
    fixtureOnly: true,
    title: 'Wallet: transfer cards in a chat',
    surface: '[data-wallet-chat-cards]',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {mountWalletChatCards} = await import('../walletChatCards');
      return mountWalletChatCards({
        peerId: ctx.peer('private'),
        selfId: ctx.peer('self'),
        address: walletSandboxOtherAddress
      });
    }
  },
  {
    // * not a popup: an incoming transfer comes while the chat is open — its card rises in, its glyphs lift
    id: 'wallet/chatCardArrival',
    fixtureOnly: true,
    title: 'Wallet: a transfer arrives in a chat',
    surface: '[data-wallet-chat-cards]',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {mountWalletChatCards} = await import('../walletChatCards');
      return mountWalletChatCards({
        peerId: ctx.peer('private'),
        selfId: ctx.peer('self'),
        address: walletSandboxOtherAddress,
        scene: 'arrival'
      });
    }
  },
  {
    // * not a popup: a send from the chat — the gem flies into the transfer's new card
    id: 'wallet/chatCardFlight',
    fixtureOnly: true,
    title: 'Wallet: the gem flies into a chat',
    surface: '[data-wallet-chat-cards]',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {mountWalletChatCards} = await import('../walletChatCards');
      return mountWalletChatCards({
        peerId: ctx.peer('private'),
        selfId: ctx.peer('self'),
        address: walletSandboxOtherAddress,
        scene: 'flight'
      });
    }
  },
  ...([['', undefined], ['/eur', 'EUR']] as const).map(([suffix, currency]) => ({
    // * not a popup: a transfer's words outside its card — the service line, the chat list, a notification, a
    // * reaction — its fiat in the wallet's currency
    id: `wallet/chatTexts${suffix}`,
    fixtureOnly: true,
    title: `Wallet: a transfer's words outside its card${currency ? ', in ' + currency : ''}`,
    surface: '[data-wallet-chat-texts]',
    managers: walletSandboxManagers(),
    open: async(ctx: PopupStoryContext) => {
      const {mountWalletChatTexts} = await import('../walletChatCards');
      return mountWalletChatTexts({
        peerId: ctx.peer('private'),
        selfId: ctx.peer('self'),
        address: walletSandboxOtherAddress,
        currency
      });
    }
  })),
  {
    // * not a popup: a TON address in a message; a click on it opens its menu, with its owner's profile
    id: 'wallet/addressMenu',
    fixtureOnly: true,
    title: 'Wallet: a TON address in a message',
    surface: '[data-wallet-address-message]',
    managers: (ctx) => {
      const managers = walletSandboxManagers()(ctx);
      return {...managers, appWalletManager: {
        ...managers.appWalletManager,
        getAddressOwner: () => ({
          _: 'walletUserAddress',
          pFlags: {},
          user_id: ctx.peer('private').toUserId(),
          address: walletSandboxOtherAddress,
          public_key: walletSandboxPublicKey
        })
      }};
    },
    open: async() => {
      const {mountWalletAddressMessage} = await import('../walletChatCards');
      return mountWalletAddressMessage({address: walletSandboxOtherAddress});
    }
  },
  {
    // * an address the server knows no Telegram account of: its menu says so in the owner's place (Android)
    id: 'wallet/addressMenu/unlinked',
    fixtureOnly: true,
    title: 'Wallet: a TON address of nobody on Telegram',
    surface: '[data-wallet-address-message]',
    managers: walletSandboxManagers(),
    open: async() => {
      const {mountWalletAddressMessage} = await import('../walletChatCards');
      return mountWalletAddressMessage({address: walletSandboxOtherAddress});
    }
  },
  {
    id: 'wallet/main',
    fixtureOnly: true,
    title: 'Wallet',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  // * no Two-Step Verification while the wallet holds something: the notice over the history (tdesktop); with no
  // * history it shows for the balance alone. `window.walletSandboxPassword = true` and a focus of the window turn
  // * the password on as if elsewhere: the notice goes
  ...([['', {}], ['/noHistory', {empty: true}]] as const).map(([suffix, options]) => ({
    id: `wallet/protect${suffix}`,
    fixtureOnly: true,
    title: `Wallet: protect the account${suffix ? ', no history yet' : ''}`,
    managers: (ctx: PopupStoryContext) => ({
      ...walletSandboxManagers(options)(ctx),
      passwordManager: {
        getState: () => ({_: 'account.password', pFlags: {has_password: (window as any).walletSandboxPassword || undefined}, hint: ''})
      }
    }),
    open: async() => {
      (window as any).walletSandboxPassword = false;
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  })),
  {
    // * the account earned Grams (a channel's revenue): a row over the history offers them (iOS: from 10 Grams)
    id: 'wallet/earnings',
    fixtureOnly: true,
    title: 'Wallet: with Gram earnings',
    managers: (ctx: PopupStoryContext) => {
      const managers = walletSandboxManagers()(ctx);
      return {
        ...managers,
        appPaymentsManager: {
          getStarsStatusTon: () => ({_: 'payments.starsStatus', pFlags: {}, balance: {_: 'starsTonAmount', amount: '25300000000'}, chats: [] as any[], users: [] as any[]})
        }
      };
    },
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  {
    id: 'wallet/empty',
    fixtureOnly: true,
    title: 'Wallet: no transfers yet',
    managers: walletSandboxManagers({balance: '0', empty: true}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  {
    // * no transfer, but collectibles: the history's tab stays empty, no "what the wallet is" rows (Android)
    id: 'wallet/empty/collectibles',
    fixtureOnly: true,
    title: 'Wallet: no transfers, some collectibles',
    managers: walletSandboxManagers({empty: true, nfts: true}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  {
    // * the provider's stream says a transfer came in, finalized, before the server lists it: it shows at once, and
    // * stays until the server's copy takes its place (here the server never lists it). The socket is made up: nothing
    // * leaves the sandbox
    id: 'wallet/history/stream',
    fixtureOnly: true,
    title: 'Wallet: a transfer in, from the stream',
    managers: (ctx: PopupStoryContext) => {
      const managers = walletSandboxManagers()(ctx);
      return {...managers, appWalletManager: {
        ...managers.appWalletManager,
        getStreamingUrl: () => ({_: 'toncenter.streamingUrl', url: 'wss://stream.sandbox.invalid/', expires: Math.floor(Date.now() / 1000) + 600})
      }};
    },
    open: async() => {
      const [{default: showWalletPopup}, {canonicalTonAddress}] = await Promise.all([
        import('@components/wallet'),
        import('@lib/wallet/transferMessages')
      ]);
      const frame = JSON.stringify({
        type: 'transactions',
        finality: 'finalized',
        trace_external_hash_norm: 'sandbox-trace',
        transactions: [{
          account: canonicalTonAddress(walletSandboxAddress),
          hash: 'q1nYRmyLRn4PvAckJe7Zqta5rEu9phCURNxpD2KYRdw=',
          lt: '9000',
          now: Math.floor(Date.now() / 1000),
          total_fees: '100',
          description: {aborted: false, compute_ph: {skipped: false, success: true}},
          in_msg: {
            source: canonicalTonAddress(walletSandboxOtherAddress),
            destination: canonicalTonAddress(walletSandboxAddress),
            value: '7500000000',
            opcode: null,
            bounced: false
          },
          out_msgs: []
        }]
      });

      const RealWebSocket = window.WebSocket;
      class SandboxSocket {
        public static OPEN = 1;
        public readyState = 0;
        public onopen: () => void;
        public onmessage: (e: {data: string}) => void;
        public onclose: () => void;
        public onerror: () => void;
        constructor() {
          setTimeout(() => {
            this.readyState = 1;
            this.onopen?.();
            setTimeout(() => this.onmessage?.({data: frame}), 1500);
          }, 100);
        }

        public send() {}
        public close() {
          this.readyState = 3;
        }
      }

      window.WebSocket = SandboxSocket as any;
      showWalletPopup();
      return () => window.WebSocket = RealWebSocket;
    }
  },
  {
    // * the first page of the history takes its time and nothing was kept of it: rows of its shape stand in (Android)
    id: 'wallet/history/loading',
    fixtureOnly: true,
    title: 'Wallet: history loading',
    managers: (ctx: PopupStoryContext) => {
      const managers = walletSandboxManagers()(ctx);
      return {...managers, appWalletManager: {
        ...managers.appWalletManager,
        getTransactions: () => pause(4000).then(() => managers.appWalletManager.getTransactions())
      }};
    },
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  {
    // * every page holds one transfer worth listing and 49 below the minimum: the few rows do not fill the window,
    // * and the next pages come without a scroll until they do (or the history ends: twenty pages here)
    id: 'wallet/history/dustPages',
    fixtureOnly: true,
    title: 'Wallet: history of mostly hidden dust',
    managers: (ctx: PopupStoryContext) => {
      const managers = walletSandboxManagers()(ctx);
      const userId = ctx.peer('private').toUserId();
      const PAGES = 20, PAGE = 50;
      const page = (index: number): WalletTransaction[] => Array.from({length: PAGE}, (_, i) => {
        const n = index * PAGE + i;
        return {
          _: 'walletTransaction',
          id: `${5000 + n}:dust${n}`,
          amount: i ? '1000000' : String((index + 1) * 1e9),
          fee: '2749650',
          date: Math.floor(Date.now() / 1000) - n * 3600,
          peer: i ?
            {_: 'walletTransactionPeerAddress', pFlags: {}, address: walletSandboxOtherAddress} as WalletTransaction['peer'] :
            {_: 'walletTransactionPeerUser', user_id: userId, address: walletSandboxOtherAddress},
          tx_hash: 'k1nYRmyLRn4PvAckJe7Zqta5rEu9phCURNxpD2KYRdw=',
          pFlags: {incoming: true}
        };
      });
      return {...managers, appWalletManager: {
        ...managers.appWalletManager,
        getTransactions: (offset: string) => {
          const index = +offset || 0;
          (window as any).walletSandboxDustPages = Math.max((window as any).walletSandboxDustPages || 0, index + 1);
          return pause(150).then(() => ({
            _: 'wallet.transactions',
            pFlags: {},
            transactions: page(index),
            next_offset: index + 1 < PAGES ? String(index + 1) : undefined,
            chats: [] as any[],
            users: [] as any[]
          }));
        }
      }};
    },
    open: async() => {
      (window as any).walletSandboxDustPages = 0;
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  // * the window opened again: the history and collectibles the last one showed are there at once, the server's
  // * answer (4 s late here) refreshes them; "/reload" is the same after a reload of the page — the cache goes through
  // * its form on disk, so a transfer still sending is there too (without its comment) and settles 5 s later
  ...([
    ['/reopen', 'reopened from the last window', false],
    ['/reload', 'after a reload, a transfer still sending', true]
  ] as const).map(([suffix, title, reload]) => ({
    id: `wallet/history${suffix}`,
    fixtureOnly: true,
    title: `Wallet: ${title}`,
    managers: (ctx: PopupStoryContext) => {
      const managers = walletSandboxManagers({nfts: true})(ctx);
      const userId = ctx.peer('private').toUserId();
      const openedAt = Date.now();
      const pending: WalletPendingTransfer[] = reload ? [{
        id: 'sandbox-restored',
        nanograms: '3500000000',
        userId,
        address: walletSandboxOtherAddress,
        comment: 'Not on disk',
        date: openedAt - 20e3,
        msgHash: 'sandbox-restored-hash'
      }, {
        id: 'sandbox-restored-nft',
        nanograms: '50000000',
        address: walletSandboxOtherAddress,
        date: openedAt - 40e3,
        nft: walletSandboxNfts[1]
      }] : [];
      const settled: WalletTransaction = {
        ...walletSandboxTransactions(userId)[2],
        id: '2000:sandboxRestored',
        amount: '-3500000000',
        date: Math.floor(openedAt / 1000) - 15,
        pFlags: {}
      };
      const cache = async() => {
        const {readStoredWalletHistory, toStoredWalletHistory} = await import('@lib/wallet/historyCache');
        const value = {
          address: walletSandboxAddress,
          history: {items: walletSandboxTransactions(userId), nextOffset: '', ended: true},
          nfts: {items: walletSandboxNfts, nextOffset: '', ended: true},
          pending
        };
        return reload ? readStoredWalletHistory(toStoredWalletHistory(value, []), Date.now()).cache : value;
      };

      return {...managers, appWalletManager: {
        ...managers.appWalletManager,
        getHistoryCache: cache,
        getPendingTransfers: async() => (await cache()).pending,
        getTransactions: () => pause(4000).then(() => managers.appWalletManager.getTransactions()),
        getTransactionsByMsgHash: () => ({
          _: 'wallet.transactions',
          pFlags: {},
          transactions: Date.now() - openedAt > 5000 ? [settled] : [] as WalletTransaction[],
          chats: [] as any[],
          users: [] as any[]
        })
      }};
    },
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  })),
  {
    id: 'wallet/provisioning',
    fixtureOnly: true,
    title: 'Wallet: being set up',
    managers: walletSandboxManagers({presence: 'provisioning'}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  {
    id: 'wallet/readOnly',
    fixtureOnly: true,
    title: 'Wallet: view-only device',
    managers: walletSandboxManagers({flags: {}}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  ...(['receive', 'keys', 'restore', 'currency', 'phrase'] as const).map((screen) => ({
    id: `wallet/${screen}`,
    fixtureOnly: true,
    title: `Wallet: ${screen}`,
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen, params: {}});
    }
  })),
  {
    // * Add Funds after "Copy my address": the card turned to the address
    id: 'wallet/receiveAddress',
    fixtureOnly: true,
    title: 'Wallet: receive, the address face',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'receive', params: {face: 'address'}});
    }
  },
  {
    id: 'wallet/recipient',
    fixtureOnly: true,
    title: 'Wallet: whom to send Grams',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'recipient', params: {}});
    }
  },
  {
    // * an address typed into the search that is a Telegram user's wallet: their row, not the address
    id: 'wallet/recipient/linked',
    fixtureOnly: true,
    title: 'Wallet: an address of a Telegram user',
    managers: (ctx) => {
      const managers = walletSandboxManagers()(ctx);
      managers.appWalletManager.getAddressOwner = () => ({
        _: 'walletUserAddress',
        pFlags: {},
        user_id: ctx.peer('private').toUserId(),
        address: walletSandboxOtherAddress,
        public_key: walletSandboxPublicKey
      });
      return managers;
    },
    open: () => showWalletRecipientQuery(walletSandboxOtherAddress)
  },
  {
    // * an address of nobody known: the address row
    id: 'wallet/recipient/address',
    fixtureOnly: true,
    title: 'Wallet: an address typed in',
    managers: walletSandboxManagers(),
    open: () => showWalletRecipientQuery(walletSandboxOtherAddress)
  },
  {
    // * a checksum that does not hold: "No Results", the address is invalid
    id: 'wallet/recipient/invalid',
    fixtureOnly: true,
    title: 'Wallet: an invalid address typed in',
    managers: walletSandboxManagers(),
    open: () => showWalletRecipientQuery(walletSandboxOtherAddress.slice(0, -2) + 'Pa')
  },
  {
    // * "Send Grams" from a chat or a transfer: the window opens on the amount, not on the main screen
    id: 'wallet/sendToUser',
    fixtureOnly: true,
    title: 'Wallet: send to a user',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const [{default: showWalletPopup}, {default: WalletSession}] = await Promise.all([
        import('@components/wallet'),
        import('@lib/wallet/walletSession')
      ]);
      // * a device that can sign: nothing is asked before the amount
      const restore = overlay(WalletSession.get(), {getDeviceMode: async() => 'full' as const});
      showWalletPopup({send: {userId: ctx.peer('private').toUserId()}});
      return restore;
    }
  },
  {
    // * the same on a device that only views the wallet: Telegram's backup is restored first, the password asked for
    id: 'wallet/sendToUser/restore',
    fixtureOnly: true,
    title: 'Wallet: send to a user, the key restored first',
    managers: (ctx) => {
      const managers = walletSandboxManagers()(ctx);
      return {
        ...managers,
        appWalletManager: {...managers.appWalletManager, exportSecretPhrase: () => Promise.reject({type: 'PASSWORD_MISSING'})},
        passwordManager: {getState: () => ({_: 'account.password', pFlags: {has_password: true}, hint: ''})}
      };
    },
    open: async(ctx) => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({send: {userId: ctx.peer('private').toUserId()}});
    }
  },
  {
    // * and with no backup to restore from: the phrase is typed first, over the amount
    id: 'wallet/sendToUser/noBackup',
    fixtureOnly: true,
    title: 'Wallet: send to a user, the phrase typed first',
    managers: walletSandboxManagers({flags: {}}),
    open: async(ctx) => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({send: {userId: ctx.peer('private').toUserId()}});
    }
  },
  {
    id: 'wallet/howItWorks',
    fixtureOnly: true,
    title: 'Wallet: how it works',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletHowItWorksPopup} = await import('@components/wallet/howItWorks');
      await showWalletHowItWorksPopup();
    }
  },
  // * a transfer of the history, the way the wallet opens it over its window: by the fixture's place in the list
  ...([
    ['', 'incoming transfer with a comment', 0],
    ['/withdrawal', 'withdrawal with a fee', 3],
    ['/gasless', 'fee-free transfer to a user', 2],
    ['/encrypted', 'encrypted comment', 4],
    ['/address', 'failed withdrawal', 5],
    ['/collectible', 'collectible sent', 6]
  ] as const).map(([suffix, title, index]) => ({
    id: `wallet/transaction${suffix}`,
    fixtureOnly: true,
    title: `Wallet: ${title}`,
    managers: walletSandboxManagers(),
    open: async(ctx: PopupStoryContext) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      await showWalletTransactionPopup({transaction: walletSandboxTransactions(ctx.peer('private').toUserId())[index]});
    }
  })),
  // * a user's address sent to by its name: a Domain row (Android); a transfer through Telegram's service account:
  // * its address alone, no Send toward the account; a top-up through Telegram's own provider: bought for crypto
  ...([
    ['/domain', 'transfer to a user by name', (userId: UserId) => ({
      peer: {_: 'walletTransactionPeerUser', user_id: userId, address: walletSandboxOtherAddress, domain: 'alice.t.me'},
      amount: '-15460000000'
    })],
    ['/serviceUser', 'transfer through the service account', () => ({
      peer: {_: 'walletTransactionPeerUser', user_id: 777000, address: walletSandboxOtherAddress},
      amount: '2460000000'
    })],
    ['/cryptoTopUp', 'crypto top-up', () => ({
      peer: {_: 'walletTransactionPeerOnramp', address: walletSandboxOtherAddress, provider_name: 'walt'},
      amount: '50150000000'
    })]
  ] as const).map(([suffix, title, make]) => ({
    id: `wallet/transaction${suffix}`,
    fixtureOnly: true,
    title: `Wallet: ${title}`,
    managers: walletSandboxManagers(),
    open: async(ctx: PopupStoryContext) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      const base = walletSandboxTransactions(ctx.peer('private').toUserId())[2];
      const {peer, amount} = make(ctx.peer('private').toUserId());
      await showWalletTransactionPopup({transaction: {
        ...base,
        id: '3000:sandbox' + suffix,
        amount,
        peer: peer as WalletTransaction['peer'],
        pFlags: {incoming: amount.startsWith('-') ? undefined : true}
      }});
    }
  })),
  {
    // * from a chat: the message is all there is at first, the fee comes with the served record
    id: 'wallet/transaction/chat',
    fixtureOnly: true,
    title: 'Wallet: transfer from a chat',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      const transaction = walletSandboxTransactions(ctx.peer('private').toUserId())[2];
      await showWalletTransactionPopup({
        message: {
          _: 'messageService',
          pFlags: {out: true},
          id: 1,
          mid: 1,
          peerId: ctx.peer('private'),
          fromId: ctx.peer('self'),
          date: transaction.date,
          peer_id: {_: 'peerUser', user_id: ctx.peer('private').toUserId()},
          action: {
            _: 'messageActionGramTransfer',
            pFlags: {},
            amount: transaction.amount,
            peer_address: walletSandboxOtherAddress,
            transaction_id: transaction.id
          }
        } as Message.messageService,
        openWallet: () => {}
      });
    }
  },
  {
    // * the served record is slow to come: the fee is a placeholder until it does
    id: 'wallet/transaction/chatLoading',
    fixtureOnly: true,
    title: 'Wallet: transfer from a chat, fee loading',
    managers: (ctx) => {
      const managers = walletSandboxManagers()(ctx);
      const getTransactionsByIds = managers.appWalletManager.getTransactionsByIds;
      return {...managers, appWalletManager: {
        ...managers.appWalletManager,
        getTransactionsByIds: async(ids: string[]) => pause(4000).then(() => getTransactionsByIds(ids))
      }};
    },
    open: async(ctx) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      const transaction = walletSandboxTransactions(ctx.peer('private').toUserId())[3];
      await showWalletTransactionPopup({
        message: {
          _: 'messageService',
          pFlags: {out: true},
          id: 1,
          mid: 1,
          peerId: ctx.peer('private'),
          fromId: ctx.peer('self'),
          date: transaction.date,
          peer_id: {_: 'peerUser', user_id: ctx.peer('private').toUserId()},
          action: {
            _: 'messageActionGramTransfer',
            pFlags: {},
            amount: transaction.amount,
            peer_address: walletSandboxOtherAddress,
            transaction_id: transaction.id
          }
        } as Message.messageService,
        openWallet: () => {}
      });
    }
  },
  // * a transfer this device sends, as the history follows it: still processing, settling a moment after opening,
  // * failing a moment after opening, failed already
  ...([
    ['/pending', 'transfer processing', undefined],
    ['/settles', 'transfer that settles while open', 'settle'],
    ['/fails', 'transfer that fails while open', 'fail'],
    ['/failed', 'transfer that failed', 'failed']
  ] as const).map(([suffix, title, outcome]) => ({
    id: `wallet/transaction${suffix}`,
    fixtureOnly: true,
    title: `Wallet: ${title}`,
    managers: walletSandboxManagers(),
    open: async(ctx: PopupStoryContext) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      const userId = ctx.peer('private').toUserId();
      const pending: WalletPendingTransfer = {
        id: 'sandbox_pending',
        nanograms: '15460000000',
        userId,
        address: walletSandboxOtherAddress,
        comment: 'Rent for October',
        date: Date.now(),
        failed: outcome === 'failed' || undefined
      };
      const [live, setLive] = createSignal<WalletTransactionLive>({pending});
      await showWalletTransactionPopup({pending, live});
      if(outcome === 'settle') {
        const settled = walletSandboxTransactions(userId)[2];
        setTimeout(() => setLive({transaction: {...settled, pFlags: {}, comment: pending.comment, date: Math.floor(Date.now() / 1000)}}), 2500);
      } else if(outcome === 'fail') {
        setTimeout(() => setLive({pending: {...pending, failed: true}}), 2500);
      }
    }
  })),
  {
    // * a collectible this device sends: with no fiat line, the status has a line of its own, and fails a moment later
    id: 'wallet/transaction/collectiblePending',
    fixtureOnly: true,
    title: 'Wallet: collectible transfer processing, then failing',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      const userId = ctx.peer('private').toUserId();
      const pending: WalletPendingTransfer = {
        id: 'sandbox_pending_nft',
        nanograms: '0',
        userId,
        address: walletSandboxOtherAddress,
        date: Date.now(),
        nft: walletSandboxTransactions(userId)[6].nft
      };
      const [live, setLive] = createSignal<WalletTransactionLive>({pending});
      await showWalletTransactionPopup({pending, live});
      setTimeout(() => setLive({pending: {...pending, failed: true}}), 3000);
    }
  },
  {
    id: 'wallet/transaction/keyChange',
    fixtureOnly: true,
    title: 'Wallet: key update',
    managers: walletSandboxManagers(),
    open: async() => {
      const [{default: showWalletTransactionPopup}, {default: rootScope}] = await Promise.all([
        import('@components/wallet/transactionPopup'),
        import('@lib/rootScope')
      ]);
      const status = await rootScope.managers.appWalletManager.getCachedStatus();
      await showWalletTransactionPopup({transaction: {
        _: 'walletTransaction',
        pFlags: {key_change: true},
        id: '2000:sandbox_key',
        amount: '0',
        fee: '4200000',
        date: Math.floor(Date.now() / 1000) - 7200,
        peer: {_: 'walletTransactionPeerAddress', pFlags: {}, address: status.state.address} as any,
        tx_hash: 'k1nYRmyLRn4PvAckJe7Zqta5rEu9phCURNxpD2KYRdw='
      }});
    }
  },
  {
    // * to one's own address: it reads as incoming, with what it cost
    id: 'wallet/transaction/self',
    fixtureOnly: true,
    title: 'Wallet: transfer to oneself',
    managers: walletSandboxManagers(),
    open: async() => {
      const [{default: showWalletTransactionPopup}, {default: rootScope}] = await Promise.all([
        import('@components/wallet/transactionPopup'),
        import('@lib/rootScope')
      ]);
      const status = await rootScope.managers.appWalletManager.getCachedStatus();
      await showWalletTransactionPopup({transaction: {
        _: 'walletTransaction',
        pFlags: {},
        id: '2001:sandbox_self',
        amount: '-3000000000',
        fee: '2749650',
        date: Math.floor(Date.now() / 1000) - 600,
        peer: {_: 'walletTransactionPeerAddress', pFlags: {}, address: status.state.address} as any,
        tx_hash: 'k1nYRmyLRn4PvAckJe7Zqta5rEu9phCURNxpD2KYRdw='
      }});
    }
  },
  {
    id: 'wallet/transaction/longComment',
    fixtureOnly: true,
    title: 'Wallet: a long comment',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      const transaction = walletSandboxTransactions(ctx.peer('private').toUserId())[0];
      const paragraph = 'Thanks for covering the tickets, the hotel and the dinner on Saturday. Here is my part of everything, plus a little extra for the taxi back to the airport.';
      await showWalletTransactionPopup({transaction: {...transaction, comment: [paragraph, paragraph, paragraph, paragraph].join('\n\n')}});
    }
  },
  // * an encrypted comment that opens, and one that does not: the cover dims while it runs
  ...([
    ['/decrypt', 'encrypted comment that opens', true],
    ['/decryptError', 'encrypted comment that fails to open', false]
  ] as const).map(([suffix, title, opens]) => ({
    id: `wallet/transaction${suffix}`,
    fixtureOnly: true,
    title: `Wallet: ${title}`,
    managers: walletSandboxManagers(),
    open: async(ctx: PopupStoryContext) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      await showWalletTransactionPopup({
        transaction: walletSandboxTransactions(ctx.peer('private').toUserId())[4],
        decryptComment: () => pause(800).then(() => {
          if(!opens) throw new Error('WALLET_COMMENT_INVALID');
          return 'The key to the locker is under the mat 🔑';
        })
      });
    }
  })),
  {
    // * the wallet reopened a chat's transfer for its comment: it opens as the popup does
    id: 'wallet/transaction/decryptOnOpen',
    fixtureOnly: true,
    title: 'Wallet: encrypted comment opened with the transfer',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      await showWalletTransactionPopup({
        transaction: walletSandboxTransactions(ctx.peer('private').toUserId())[4],
        decryptComment: () => pause(800).then(() => 'The key to the locker is under the mat 🔑'),
        decryptCommentOnOpen: true
      });
    }
  },
  {
    // * an incoming transfer of the history while the server suggests "Your first Grams!": it comes over the transfer
    id: 'wallet/transaction/firstGrams',
    fixtureOnly: true,
    title: 'Wallet: incoming transfer, then your first Grams',
    managers: (ctx) => ({
      ...walletSandboxManagers()(ctx),
      appPromoManager: {hasPendingSuggestion: () => true, dismissSuggestion: (): void => undefined}
    }),
    open: async(ctx) => {
      const {default: showWalletTransactionPopup} = await import('@components/wallet/transactionPopup');
      await showWalletTransactionPopup({
        transaction: walletSandboxTransactions(ctx.peer('private').toUserId())[0],
        suggestFirstGrams: true
      });
    }
  },
  {
    id: 'wallet/gramInfo',
    fixtureOnly: true,
    title: 'Wallet: what is Gram',
    managers: walletSandboxManagers(),
    open: async() => {
      const {showWalletGramInfoPopup} = await import('@components/wallet/howItWorks');
      await showWalletGramInfoPopup();
    }
  },
  {
    id: 'wallet/amount',
    fixtureOnly: true,
    title: 'Wallet: amount to a user',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'amount', params: {recipient: {address: walletSandboxOtherAddress, bounce: false, userId: ctx.peer('private').toUserId(), publicKey: walletSandboxPublicKey}}});
    }
  },
  {
    // * a bare address: Continue, on to the confirmation
    id: 'wallet/amount/address',
    fixtureOnly: true,
    title: 'Wallet: amount to an address',
    managers: walletSandboxManagers(),
    open: (ctx) => showWalletAmount(ctx, {address: true})
  },
  {
    // * more than the balance: "Insufficient funds." and the deposit link after it
    id: 'wallet/amount/insufficient',
    fixtureOnly: true,
    title: 'Wallet: amount over the balance',
    managers: walletSandboxManagers(),
    open: (ctx) => showWalletAmount(ctx, {nanograms: '2500000000000'})
  },
  {
    // * nothing in the wallet: the deposit link in the balance's place
    id: 'wallet/amount/zeroBalance',
    fixtureOnly: true,
    title: 'Wallet: amount with an empty wallet',
    managers: walletSandboxManagers({balance: '0', empty: true}),
    open: (ctx) => showWalletAmount(ctx)
  },
  {
    // * Telegram does not pay this one: the fee line shimmers while it is quoted
    id: 'wallet/amount/feeLoading',
    fixtureOnly: true,
    title: 'Wallet: the fee being quoted',
    managers: walletSandboxManagers({gasless: false}),
    open: async(ctx) => {
      const restore = await overlayFeePreview();
      await showWalletAmount(ctx, {nanograms: '12500000000', comment: 'For the tickets\nand the dinner'});
      return restore;
    }
  },
  {
    id: 'wallet/amount/fee',
    fixtureOnly: true,
    title: 'Wallet: the network fee',
    managers: walletSandboxManagers({gasless: false}),
    open: async(ctx) => {
      const restore = await overlayFeePreview('2749650');
      await showWalletAmount(ctx, {nanograms: '12500000000'});
      return restore;
    }
  },
  {
    // * a comment near its limit of 960 bytes: the field counts down the last of them (tdesktop)
    id: 'wallet/amount/commentLimit',
    fixtureOnly: true,
    title: 'Wallet: a comment near its limit',
    managers: walletSandboxManagers(),
    open: (ctx) => showWalletAmount(ctx, {nanograms: '12500000000', comment: 'Rent for October. '.repeat(53)})
  },
  {
    // * past the limit — Cyrillic is two bytes a letter: the count goes red below zero and Send waits
    id: 'wallet/amount/commentTooLong',
    fixtureOnly: true,
    title: 'Wallet: a comment past its limit',
    managers: walletSandboxManagers(),
    open: (ctx) => showWalletAmount(ctx, {nanograms: '12500000000', comment: 'Оплата аренды. '.repeat(40)})
  },
  {
    // * whether the recipient can read a private comment is still being found out: the screen claims neither
    id: 'wallet/amount/commentChecking',
    fixtureOnly: true,
    title: 'Wallet: a comment, its privacy not known yet',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {default: WalletSession} = await import('@lib/wallet/walletSession');
      const restore = overlay(WalletSession.get(), {canEncryptCommentFor: () => new Promise<never>(() => {})});
      await showWalletAmount(ctx, {nanograms: '12500000000', comment: 'For the tickets'});
      return restore;
    }
  },
  {
    // * a .ton name that is a Telegram user's wallet: the name was asked for, so it is confirmed — "Continue" (Android)
    id: 'wallet/amount/domainUser',
    fixtureOnly: true,
    title: 'Wallet: amount to a user found by a .ton name',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'amount', params: {
        recipient: {
          address: walletSandboxOtherAddress,
          bounce: false,
          userId: ctx.peer('private').toUserId(),
          publicKey: walletSandboxPublicKey,
          domain: 'alice.ton'
        },
        nanograms: '12500000000'
      }});
    }
  },
  {
    id: 'wallet/confirm',
    fixtureOnly: true,
    title: 'Wallet: confirm a transfer to an address',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'confirm', params: {
        recipient: {address: walletSandboxOtherAddress, bounce: true, domain: 'foundation.ton'},
        nanograms: '12500000000',
        comment: 'Invoice #42'
      }});
    }
  },
  {
    // * the whole balance to an address: what arrives is the balance less the fee, a private comment on two lines
    id: 'wallet/confirm/all',
    fixtureOnly: true,
    title: 'Wallet: confirm sending the whole balance',
    managers: walletSandboxManagers({gasless: false}),
    open: async() => {
      const [{default: showWalletPopup}, restore] = await Promise.all([import('@components/wallet'), overlayFeePreview('2749650')]);
      showWalletPopup({screen: 'confirm', params: {
        recipient: {address: walletSandboxOtherAddress, bounce: true},
        nanograms: '1720580000000',
        sendAll: true,
        fee: '2749650',
        comment: 'Moving everything\nto my other wallet',
        encryptComment: true
      }});
      return restore;
    }
  },
  {
    // * a user found by a .ton name, confirmed: the comment can still be changed, its lock makes it public (Android)
    id: 'wallet/confirm/comment',
    fixtureOnly: true,
    title: 'Wallet: confirm with the comment and its lock',
    managers: walletSandboxManagers(),
    open: async(ctx) => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'confirm', params: {
        recipient: {
          address: walletSandboxOtherAddress,
          bounce: false,
          userId: ctx.peer('private').toUserId(),
          publicKey: walletSandboxPublicKey,
          domain: 'alice.ton'
        },
        nanograms: '12500000000',
        comment: 'For the tickets',
        encryptComment: true,
        canEncrypt: true
      }});
    }
  },
  {
    // * Confirm sends for real as far as the window goes — the session answers it was accepted, nothing reaches the
    // * chain: the gem flies into the new "Sending" row, which plays until the transfer turns up (6 s later)
    id: 'wallet/sendFlight',
    fixtureOnly: true,
    title: 'Wallet: a transfer sent, then settled',
    managers: (ctx: PopupStoryContext) => {
      const managers = walletSandboxManagers()(ctx);
      let sentAt = 0;
      const settled: WalletTransaction = {
        ...walletSandboxTransactions(ctx.peer('private').toUserId())[3],
        id: '2000:sandboxSent',
        amount: '-12500000000',
        date: Math.floor(Date.now() / 1000),
        pFlags: {}
      };
      return {
        ...managers,
        appWalletManager: {
          ...managers.appWalletManager,
          getTransactionsByMsgHash: () => {
            sentAt ||= Date.now();
            const transactions = Date.now() - sentAt > 6000 ? [settled] : [];
            return {_: 'wallet.transactions', pFlags: {}, transactions, chats: [] as any[], users: [] as any[]};
          }
        }
      };
    },
    open: async() => {
      const [{default: showWalletPopup}, {default: WalletSession}, restoreFee] = await Promise.all([
        import('@components/wallet'),
        import('@lib/wallet/walletSession'),
        overlayFeePreview('2749650')
      ]);
      const restoreSession = overlay(WalletSession.get(), {
        getDeviceMode: async() => 'full' as const,
        getParkedState: async() => ({wallets: []}),
        send: async() => ({
          result: {operationId: 'sandbox-sent-' + Date.now(), phase: 'done'} as any,
          answer: {outcome: 'accepted', sent: {msgHash: 'sandbox-msg-hash'}} as any
        })
      });
      showWalletPopup({screen: 'confirm', params: {
        recipient: {address: walletSandboxOtherAddress, bounce: true},
        nanograms: '12500000000'
      }});
      return () => {
        restoreSession();
        restoreFee();
      };
    }
  },
  {
    id: 'wallet/firstGrams',
    title: 'Wallet: your first Grams',
    // * the rate in the subtitle; closing dismisses the suggestion
    managers: (ctx) => ({...walletSandboxManagers()(ctx), appPromoManager: {dismissSuggestion: (): void => undefined}}),
    open: async() => {
      const {showWalletFirstGramsPopup} = await import('@components/wallet/firstGrams');
      showWalletFirstGramsPopup();
    }
  },
  {
    id: 'wallet/collectibles',
    fixtureOnly: true,
    title: 'Wallet with collectibles',
    managers: walletSandboxManagers({nfts: true}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  {
    // * the first page of collectibles fails: the list is asked again a few seconds later, not given up on
    id: 'wallet/collectibles/retry',
    fixtureOnly: true,
    title: 'Wallet: collectibles after a failed load',
    managers: (ctx) => {
      const managers = walletSandboxManagers({nfts: true})(ctx);
      const getNfts = managers.appWalletManager.getNfts;
      let failed = false;
      return {...managers, appWalletManager: {
        ...managers.appWalletManager,
        getNfts: () => failed ? getNfts() : (failed = true, Promise.reject({type: 'NETWORK_BAD_RESPONSE'}))
      }};
    },
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup();
    }
  },
  {
    id: 'wallet/collectible',
    fixtureOnly: true,
    title: 'Wallet: a collectible gift',
    managers: walletSandboxManagers({nfts: true}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'collectible', params: {item: walletSandboxNfts[0]}});
    }
  },
  {
    // * the gift its metadata names lives at another address: nothing to sell on Fragment
    id: 'wallet/collectible/giftElsewhere',
    fixtureOnly: true,
    title: 'Wallet: a collectible naming a gift it is not',
    managers: (ctx) => ({
      ...walletSandboxManagers({nfts: true})(ctx),
      appGiftsManager: {getGiftBySlug: (slug: string) => walletSandboxGiftBySlug(slug, walletSandboxOtherAddress)}
    }),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'collectible', params: {item: walletSandboxNfts[0]}});
    }
  },
  {
    id: 'wallet/collectible/username',
    fixtureOnly: true,
    title: 'Wallet: a collectible username',
    managers: walletSandboxManagers({nfts: true}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'collectible', params: {item: walletSandboxNfts[1]}});
    }
  },
  {
    id: 'wallet/collectible/number',
    fixtureOnly: true,
    title: 'Wallet: an anonymous number',
    managers: walletSandboxManagers({nfts: true}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'collectible', params: {item: walletSandboxNfts[2]}});
    }
  },
  {
    id: 'wallet/collectible/nft',
    fixtureOnly: true,
    title: 'Wallet: a collectible that is not Telegram\'s',
    managers: walletSandboxManagers({nfts: true}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'collectible', params: {item: walletSandboxNfts[3]}});
    }
  },
  {
    // * how rare an attribute is can be a tier instead of a share: each in its own colour
    id: 'wallet/collectible/rarityTiers',
    fixtureOnly: true,
    title: 'Wallet: a collectible gift with rarity tiers',
    managers: (ctx) => ({
      ...walletSandboxManagers({nfts: true})(ctx),
      appGiftsManager: {
        getGiftBySlug: (slug: string) => {
          const gift = walletSandboxGiftBySlug(slug);
          const {model, backdrop, pattern} = gift.collectibleAttributes;
          return {...gift, collectibleAttributes: {
            model: {...model, rarity: {_: 'starGiftAttributeRarityEpic'}},
            backdrop: {...backdrop, rarity: {_: 'starGiftAttributeRarityLegendary'}},
            pattern: {...pattern, rarity: {_: 'starGiftAttributeRarityUncommon'}}
          }};
        }
      }
    }),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'collectible', params: {item: walletSandboxNfts[0]}});
    }
  },
  {
    // * a picture and an animation through the server's proxy, answered here: the animation plays once over the
    // * picture, a click plays it again
    id: 'wallet/collectible/lottie',
    fixtureOnly: true,
    title: 'Wallet: a collectible with an animation',
    managers: (ctx) => ({
      ...walletSandboxManagers({nfts: true})(ctx),
      apiFileManager: {
        downloadMedia: () => fetch('assets/tgs/Gram.json').then((response) => response.blob()),
        downloadMediaURL: () => 'assets/img/camomile.jpg'
      }
    }),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      const url = (path: string) => ({_: 'webDocument' as const, url: 'https://nft.fragment.com/gift/' + path, access_hash: 0, size: 0, attributes: [] as any[]});
      showWalletPopup({screen: 'collectible', params: {item: {
        ...walletSandboxNfts[0],
        image: url('plushpepe-12.webp'),
        lottie: url('plushpepe-12.lottie.json')
      }}});
    }
  },
  {
    id: 'wallet/collectible/recipient',
    fixtureOnly: true,
    title: 'Wallet: whom to send a collectible',
    managers: walletSandboxManagers({nfts: true}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'recipient', params: {nft: walletSandboxNfts[0]}});
    }
  },
  {
    id: 'wallet/collectible/confirm',
    fixtureOnly: true,
    title: 'Wallet: confirm sending a collectible',
    managers: walletSandboxManagers({nfts: true}),
    open: async(ctx) => {
      const [{default: showWalletPopup}, restore] = await Promise.all([import('@components/wallet'), overlayNftPreview()]);
      showWalletPopup({screen: 'collectibleSend', params: {
        recipient: {address: walletSandboxOtherAddress, bounce: false, userId: ctx.peer('private').toUserId(), publicKey: walletSandboxPublicKey},
        nft: walletSandboxNfts[0]
      }});
      return restore;
    }
  },
  {
    // * the Grams the transfer carries and its fee do not fit: Top Up takes the user to Add Funds
    id: 'wallet/collectible/confirm/topUp',
    fixtureOnly: true,
    title: 'Wallet: too few Grams to send a collectible',
    managers: walletSandboxManagers({nfts: true, balance: '20000000'}),
    open: async(ctx) => {
      const [{default: showWalletPopup}, restore] = await Promise.all([import('@components/wallet'), overlayNftPreview()]);
      showWalletPopup({screen: 'collectibleSend', params: {
        recipient: {address: walletSandboxOtherAddress, bounce: false, userId: ctx.peer('private').toUserId(), publicKey: walletSandboxPublicKey},
        nft: walletSandboxNfts[0]
      }});
      return restore;
    }
  },
  {
    id: 'wallet/oldWallet',
    fixtureOnly: true,
    title: 'Wallet: an old wallet on this device',
    managers: walletSandboxManagers({parkedNanos: '86250000000'}),
    open: async() => {
      const [{default: showWalletPopup}, restore] = await Promise.all([import('@components/wallet'), overlayParkedWallet()]);
      showWalletPopup();
      return restore;
    }
  },
  {
    id: 'wallet/oldWallet/conflict',
    fixtureOnly: true,
    title: 'Wallet: save or drop the old wallet',
    managers: walletSandboxManagers(),
    open: async() => {
      const [{default: showWalletPopup}, restore] = await Promise.all([import('@components/wallet'), overlayParkedWallet()]);
      showWalletPopup({screen: 'conflict'});
      return restore;
    }
  },
  {
    id: 'wallet/replace',
    fixtureOnly: true,
    title: 'Wallet: replace it',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'replace'});
    }
  },
  {
    id: 'wallet/import',
    fixtureOnly: true,
    title: 'Wallet: import by phrase',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'restore', params: {mode: 'import'}});
    }
  },
  {
    id: 'wallet/quiz',
    fixtureOnly: true,
    title: 'Wallet: check the written-down phrase',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'quiz', params: {words: walletSandboxWords.slice()}});
    }
  },
  {
    id: 'wallet/keys/backupOff',
    fixtureOnly: true,
    title: 'Wallet: keys with the backup off',
    managers: walletSandboxManagers({flags: {can_enable_backup: true}}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'keys', params: {}});
    }
  },
  {
    id: 'wallet/vault/create',
    fixtureOnly: true,
    title: 'Wallet: protect the key',
    open: async() => {
      const [{showWalletVaultCreatePopup}, {default: WalletVault}] = await Promise.all([
        import('@components/wallet/vaultPrompts'),
        import('@lib/wallet/vault')
      ]);
      showWalletVaultCreatePopup(new WalletVault(walletSandboxUserId)).catch(() => {});
    }
  },
  {
    id: 'wallet/vault/unlock',
    fixtureOnly: true,
    title: 'Wallet: unlock the key',
    open: async() => {
      const [{showWalletVaultUnlockPopup}, {default: WalletVault}] = await Promise.all([
        import('@components/wallet/vaultPrompts'),
        import('@lib/wallet/vault')
      ]);
      showWalletVaultUnlockPopup(new WalletVault(walletSandboxUserId)).catch(() => {});
    }
  },
  {
    id: 'wallet/vault/settings',
    fixtureOnly: true,
    title: 'Wallet: the passcode of the key',
    open: async() => {
      const [{showWalletPasscodeSettings}, {default: WalletVault}] = await Promise.all([
        import('@components/wallet/vaultPrompts'),
        import('@lib/wallet/vault')
      ]);
      showWalletPasscodeSettings(new WalletVault(walletSandboxUserId));
    }
  },
  {
    id: 'wallet/vault/change',
    fixtureOnly: true,
    title: 'Wallet: another passcode for the key',
    open: async() => {
      const [{showWalletPasscodeSettings}, {default: WalletVault}] = await Promise.all([
        import('@components/wallet/vaultPrompts'),
        import('@lib/wallet/vault')
      ]);
      showWalletPasscodeSettings(new WalletVault(walletSandboxUserId));
      await clickWhenShown('.popup .popup-buttons .popup-button');
    }
  },
  {
    id: 'wallet/vault/set',
    fixtureOnly: true,
    title: 'Wallet: a passcode for a key kept without one',
    open: async() => {
      const [{showWalletPasscodeSettings}, {default: WalletVault}] = await Promise.all([
        import('@components/wallet/vaultPrompts'),
        import('@lib/wallet/vault')
      ]);
      // * a key this device keeps with no passcode: the sandbox's own storage is never written
      const vault = new WalletVault(walletSandboxUserId);
      vault.getKind = async() => 'device';
      vault.addPasscode = async() => true;
      showWalletPasscodeSettings(vault);
      await clickWhenShown('.popup .popup-buttons .popup-button');
    }
  },
  {
    id: 'wallet/vault/throttled',
    fixtureOnly: true,
    title: 'Wallet: too many wrong passcodes',
    open: async() => {
      const [{showWalletVaultUnlockPopup}, {default: WalletVault}] = await Promise.all([
        import('@components/wallet/vaultPrompts'),
        import('@lib/wallet/vault')
      ]);
      const vault = new WalletVault(walletSandboxUserId);
      const key = 'tweb-wallet-unlock:' + walletSandboxUserId;
      localStorage.setItem(key, JSON.stringify({fails: 7, until: Date.now() + 125e3}));
      showWalletVaultUnlockPopup(vault).catch(() => {});
      const field = '.popup input.input-field-input[type="password"]';
      for(let attempt = 0; attempt < 50 && !document.querySelector(field); ++attempt) await pause(20);
      const input = document.querySelector<HTMLInputElement>(field);
      if(input) {
        input.value = '1234';
        input.dispatchEvent(new Event('input', {bubbles: true}));
      }

      await clickWhenShown('.popup .popup-footer-button');
      // * the wait was read on the try: the next story opens unthrottled
      await pause(500);
      localStorage.removeItem(key);
    }
  }
]);

// MARK: Update Secret Phrase

/** what the update's fee is shown in besides Grams */
const SANDBOX_FIAT = {fiatPerGram: () => 2.12, currency: () => 'USD'};

/** clicks `selector` the way a user does, once it is up */
async function clickWhenShown(selector: string) {
  for(let attempt = 0; attempt < 50; ++attempt) {
    const element = document.querySelector<HTMLElement>(selector);
    if(element) {
      element.click();
      return;
    }

    await pause(20);
  }
}

/** ticks "Update Secret Phrase", once the quote put it up */
const tickRotationUpdate = () => clickWhenShown('.popup .popup-peer-checkbox-row input[type="checkbox"]');

/**
 * "Disable Backup?" over a quote that answers `quote` (or fails, or never answers), on `balance` nanograms; the words
 * are never got ready here. `press`: Disable is pressed once it is up.
 */
function openBackupDisable(options: {
  quote?: {fee: string, insufficient: boolean} | 'fail' | 'never',
  balance?: string,
  tick?: boolean,
  press?: boolean
}) {
  return async() => {
    const {confirmWalletBackupDisable} = await import('@components/wallet/rotation');
    const quote = options.quote;
    confirmWalletBackupDisable({
      fiat: SANDBOX_FIAT,
      balance: () => options.balance ?? '1720580000000',
      offered: true,
      quote: () => quote === 'never' ? new Promise(() => {}) :
        quote === 'fail' ? Promise.reject({type: 'ROTATION_QUOTE_FAILED'}) :
        Promise.resolve(quote),
      prepare: () => new Promise(() => {})
    }).catch(() => {});
    if(options.tick) await tickRotationUpdate();
    if(options.press) {
      await pause(50);
      await clickWhenShown('.popup .popup-buttons .popup-button:not(.btn-cancel):not([class*="cancel"])');
    }
  };
}

/** the quiz's three fields answered from `words` (each field is named by the word it asks for), then Continue */
async function answerQuiz(words: string[], wrong?: boolean) {
  for(let attempt = 0; attempt < 50 && !document.querySelector('.popup [data-screen="quiz"] input'); ++attempt) {
    await pause(20);
  }

  document.querySelectorAll<HTMLInputElement>('.popup [data-screen="quiz"] input').forEach((input) => {
    const number = +input.getAttribute('aria-label').match(/\d+/)[0];
    input.value = wrong ? 'abandon' : words[number - 1];
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await pause(50);
  await clickWhenShown('.popup [data-screen="quiz"] .popup-footer button');
}

/** the quiz of `words` (an update's new phrase when `rotation`), answered */
function openQuizAnswered(words: string[], rotation: boolean, wrong?: boolean) {
  return async() => {
    const {default: showWalletPopup} = await import('@components/wallet');
    await showWalletPopup({screen: 'quiz', params: {mode: rotation ? 'rotation' : 'disableBackup', words: words.slice()}});
    await answerQuiz(words, wrong);
  };
}

/** the restore screen with `text` typed into its first field */
function openRestoreTyped(text: string) {
  return async() => {
    const {default: showWalletPopup} = await import('@components/wallet');
    await showWalletPopup({screen: 'restore', params: {}});
    for(let attempt = 0; attempt < 50 && !document.querySelector('.popup [data-screen="restore"] input'); ++attempt) {
      await pause(20);
    }

    await pause(600);
    const input = document.querySelector<HTMLInputElement>('.popup [data-screen="restore"] input');
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', {bubbles: true}));
  };
}

/** the new phrase to write down, and then a press on `selector` in its screen */
function openNewPhraseAnd(selector: string) {
  return async() => {
    const {default: showWalletPopup} = await import('@components/wallet');
    await showWalletPopup({screen: 'phrase', params: {mode: 'rotation', words: walletSandboxRotatedWords.slice()}});
    await clickWhenShown(`.popup [data-screen="phrase"] ${selector}`);
  };
}

defineStories('Wallet', [
  {
    id: 'wallet/backup/disable',
    fixtureOnly: true,
    title: 'Wallet: disable backup, phrase update offered',
    open: openBackupDisable({quote: {fee: walletSandboxRotationFee, insufficient: false}})
  },
  {
    id: 'wallet/backup/disableUpdate',
    fixtureOnly: true,
    title: 'Wallet: disable backup and update the phrase (fee)',
    open: openBackupDisable({quote: {fee: walletSandboxRotationFee, insufficient: false}, tick: true})
  },
  {
    id: 'wallet/backup/disableTopUp',
    title: 'Wallet: disable backup, the update needs a non-zero balance',
    open: openBackupDisable({balance: '100000', tick: true})
  },
  {
    id: 'wallet/backup/disableWaiting',
    title: 'Wallet: disable backup with the update, pressed before the fee is quoted',
    open: openBackupDisable({quote: 'never', tick: true, press: true})
  },
  {
    id: 'wallet/backup/disableInsufficient',
    fixtureOnly: true,
    title: 'Wallet: disable backup, the update costs more than the balance',
    open: openBackupDisable({quote: {fee: walletSandboxRotationFee, insufficient: true}, tick: true, press: true})
  },
  {
    id: 'wallet/backup/disableError',
    title: 'Wallet: disable backup, the update could not be priced',
    open: openBackupDisable({quote: 'fail', tick: true})
  },
  {
    id: 'wallet/backup/phrase',
    fixtureOnly: true,
    title: 'Wallet: the secret phrase to write down',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'phrase', params: {mode: 'disableBackup', words: walletSandboxWords.slice()}});
    }
  },
  {
    id: 'wallet/backup/done',
    fixtureOnly: true,
    title: 'Wallet: the phrase checked, disable backup?',
    managers: walletSandboxManagers(),
    open: openQuizAnswered(walletSandboxWords, false)
  },
  {
    id: 'wallet/backup/newPhraseDone',
    fixtureOnly: true,
    title: 'Wallet: the new phrase checked, disable backup?',
    managers: walletSandboxManagers(),
    open: openQuizAnswered(walletSandboxRotatedWords, true)
  },
  {
    id: 'wallet/quiz/wrong',
    fixtureOnly: true,
    title: 'Wallet: the phrase check, wrong words',
    managers: walletSandboxManagers(),
    open: openQuizAnswered(walletSandboxWords, false, true)
  },
  {
    id: 'wallet/backup/walletChanged',
    title: 'Wallet: the wallet changed while disabling backup',
    open: async() => {
      const {showWalletAlert} = await import('@components/wallet/alerts');
      showWalletAlert({title: 'Wallet.Backup.WalletChangedTitle', text: 'Wallet.Backup.DisableWalletChangedText'});
    }
  },
  {
    id: 'wallet/backup/enableError',
    title: 'Wallet: enabling backup failed, the phrase update pending',
    open: async() => {
      const {showWalletEnableBackupError} = await import('@components/wallet/rotation');
      showWalletEnableBackupError({type: 'WALLET_ROTATION_NOT_FOUND'}, {retry: () => {}, enterPhrase: () => {}});
    }
  },
  {
    id: 'wallet/backup/enterPhrase',
    fixtureOnly: true,
    title: 'Wallet: enable backup with the current phrase',
    managers: walletSandboxManagers({flags: {can_enable_backup: true}}),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'restore', params: {mode: 'enableBackup'}});
    }
  },
  {
    id: 'wallet/restore/suggestions',
    fixtureOnly: true,
    title: 'Wallet: typing a word, suggestions',
    managers: walletSandboxManagers(),
    open: openRestoreTyped('ab')
  },
  {
    id: 'wallet/restore/invalidWord',
    fixtureOnly: true,
    title: 'Wallet: typing a word that is no word',
    managers: walletSandboxManagers(),
    open: openRestoreTyped('abz')
  },
  {
    id: 'wallet/restore/wrongPhrase',
    fixtureOnly: true,
    title: 'Wallet: the words are another wallet\'s',
    open: async() => {
      const {showWalletWrongPhrase} = await import('@components/wallet/screens/restore');
      showWalletWrongPhrase(walletSandboxOtherAddress);
    }
  },
  {
    id: 'wallet/backup/newPhrase',
    fixtureOnly: true,
    title: 'Wallet: the new secret phrase',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'phrase', params: {mode: 'rotation', words: walletSandboxRotatedWords.slice()}});
    }
  },
  {
    // * Continue right away: the words have not been up long enough to be written down
    id: 'wallet/backup/sureDone',
    fixtureOnly: true,
    title: 'Wallet: the new phrase, continued too soon',
    managers: walletSandboxManagers(),
    open: openNewPhraseAnd('button.btn-primary')
  },
  {
    // * back from the write-down: leaving drops the disable, so it asks first
    id: 'wallet/backup/cancel',
    fixtureOnly: true,
    title: 'Wallet: leaving the new phrase',
    managers: walletSandboxManagers(),
    open: openNewPhraseAnd('.popup-header button')
  },
  {
    id: 'wallet/backup/newPhraseQuiz',
    fixtureOnly: true,
    title: 'Wallet: check the new secret phrase',
    managers: walletSandboxManagers(),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'quiz', params: {mode: 'rotation', words: walletSandboxRotatedWords.slice()}});
    }
  },
  {
    id: 'wallet/backup/rotationFailed',
    title: 'Wallet: the phrase update failed',
    open: async() => {
      const {showWalletRotationFailed} = await import('@components/wallet/rotation');
      showWalletRotationFailed({type: 'ROTATION_EXPIRED'});
    }
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
