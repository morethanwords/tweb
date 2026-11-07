import {createRoot, createSignal, getOwner, onCleanup, untrack} from 'solid-js';
import type {AppManagers} from '@lib/managers';
import type {WalletCall, WidgetContext, WidgetData, WidgetRequest, WidgetRequestAnswer} from 'widget-sandbox/host/widget-host';
import {viewerFromList, WIDGET_MESSAGE_KINDS, WidgetMessageKind} from 'widget-sandbox/shared/sdk-policy';
import {getWidgetData} from '@lib/widgetSandbox/messageWidget';
import {WIDGET_POLL_MIN_PERIOD} from '@appManagers/constants';

/**
 * The widget sandbox's mock bot and server (after widget-sandbox's dev app, `apps/web/src/mock-bot.ts`): the state
 * each widget's message has, the bot that answers its requests and edits that state, the shared state a poll brings,
 * the server's flags for a kind of message, and the user's Gram Wallet (docs/sdk-v1.md §2.18): a request with
 * `{wallet: true}` gives the bot the wallet's card, and a wallet call ends as the panel says — confirmed (the bot gets a
 * made-up outcome and answers), declined or refused by the wallet. Nothing leaves the page.
 */

type State = {chatData: string | null, publicData: string | null};
/**
 * A bot's work on a request: `result` for the widget; a state field that is there is its edit (null clears it);
 * `sharedData`, an edit of the shared state by widget_id, which only a poll brings; `repeat`, the same edit again
 * every `every` seconds until it has been made `times` times.
 */
type Reply = {
  result?: string | null,
  chatData?: string | null,
  publicData?: string | null,
  sharedData?: string | null,
  repeat?: {every: number, times: number, edit: () => Reply}
};
/** What a conformance case's bot does on a request (its header's `bot`, as widget-sandbox's scripts/conformance/test-bot.ts does it). */
type ConformanceAction = {
  result?: string,
  edit?: {chat_data?: string, public_data?: string},
  editShared?: {public_data: string},
  repeat?: {every: number, times: number}
};
/** The viewer's wallet card as the server attaches it to the bot's update (`wallet.card`): the address, the balance in nanotons. */
type WalletCard = {address: string, balance: number};
/**
 * `name`: the viewer's first name, as the bot gets it in `from`; `votes`: what the bot keeps of this message beyond its
 * state (the bot-demos poll's vote of each viewer: the state has only the counts); `wallet`: the viewer's wallet card,
 * with a request for the wallet and with every wallet call's outcome.
 */
type BotContext = {viewer: number, name: string, state: State, votes: Map<number, number>, wallet?: WalletCard};
type Bot = {
  title: string,
  /** The state the bot sent the widget with. */
  initial: State,
  answer: (data: string, ctx: BotContext) => Reply,
  /**
   * The outcome of a wallet call the user confirmed: the transaction's message hash, or the domain the data was signed
   * for. Without it the bot answers null.
   */
  wallet?: (call: WalletCall, ctx: BotContext & {msgHash?: string, domain?: string}) => Reply
};

const parse = (text: string | null, fallback: any) => {
  try {
    return text === null ? fallback : JSON.parse(text);
  } catch{
    return fallback;
  }
};

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
/** Three in a row of one mark. */
const winningLine = (board: string) => LINES.find(([a, b, c]) => board[a] !== '-' && board[a] === board[b] && board[a] === board[c]);
const winner = (board: string) => {
  const line = winningLine(board);
  return line ? board[line[0]] : board.includes('-') ? null : 'draw';
};
/** The bot's move: win, block, the centre, a corner, anything. */
function botMove(board: string) {
  for(const mark of ['o', 'x']) {
    for(const line of LINES) {
      const marks = line.map((i) => board[i]);
      if(marks.filter((m) => m === mark).length === 2 && marks.includes('-')) return line[marks.indexOf('-')];
    }
  }

  return [4, 0, 2, 6, 8, 1, 3, 5, 7].find((i) => board[i] === '-') ?? -1;
}

/** The viewer's mock Gram Wallet, 12.5 TON; its address in the user-friendly form (non-bounceable, mainnet). */
const MOCK_WALLET: WalletCard = {address: '0:' + 'f00d'.repeat(16), balance: 12_500_000_000};
const MOCK_WALLET_FRIENDLY = 'UQDwDfAN8A3wDfAN8A3wDfAN8A3wDfAN8A3wDfAN8A3wDZTR';
/** The id of the bot that sent the widgets: the client signs for `bot<id>`. */
const MOCK_BOT_ID = 1234567;
/** Where the mock shop's transactions pay, and what it sells (nanotons). */
const SHOP_ADDRESS = 'EQ' + 'shop'.repeat(11) + 'Sh';
const SHOP_ITEMS = [['Coffee', '1500000000'], ['Croissant', '2000000000'], ['Day pass', '5000000000']];
/** The bot-demos wallet test's answer: `part` as the result, merged into the chat state the bot keeps. */
const gramReply = (state: State, part: object): Reply => ({result: JSON.stringify(part), chatData: JSON.stringify({...parse(state.chatData, {}), ...part})});

/** The bots the interactive widgets name with `<meta name="tw-bot" content="…">` (widget-sandbox's corpus/interactive). */
const BOTS: Record<string, Bot> = {
  echo: {
    title: 'echo: result = the request data',
    initial: {chatData: null, publicData: null},
    answer: (data) => ({result: data})
  },
  poll: {
    title: 'poll: vote:N toggles the viewer\'s vote',
    initial: {chatData: '{"v":[3,5,1],"u":{"7":0,"8":1,"9":1}}', publicData: '{"v":[3,5,1]}'},
    answer(data, {viewer, state}) {
      const match = /^vote:([0-9])$/.exec(data);
      if(!match) return {result: 'unknown'};
      const poll = parse(state.chatData, {v: [0, 0, 0], u: {}});
      const option = +match[1];
      if(!(option < poll.v.length)) return {result: 'unknown'};
      const before = poll.u[viewer];
      if(before !== undefined) poll.v[before]--;
      if(before === option) delete poll.u[viewer];
      else {
        poll.u[viewer] = option;
        poll.v[option]++;
      }

      return {result: JSON.stringify({voted: poll.u[viewer] ?? null}), chatData: JSON.stringify(poll), publicData: JSON.stringify({v: poll.v})};
    }
  },
  tictactoe: {
    title: 'tic-tac-toe: move:N plays X, the bot answers O; reset',
    initial: {chatData: '{"b":"---------","s":"play"}', publicData: null},
    answer(data, {state}) {
      if(data === 'reset') return {result: 'new game', chatData: '{"b":"---------","s":"play"}'};
      const match = /^move:([0-8])$/.exec(data);
      const game = parse(state.chatData, {b: '---------', s: 'play'});
      if(!match || game.s !== 'play' || game.b[+match[1]] !== '-') return {result: 'invalid move'};
      let board = game.b.slice(0, +match[1]) + 'x' + game.b.slice(+match[1] + 1);
      let won = winner(board);
      if(!won) {
        const o = botMove(board);
        board = board.slice(0, o) + 'o' + board.slice(o + 1);
        won = winner(board);
      }

      const next = JSON.stringify({b: board, s: won ?? 'play'});
      return {result: won ? (won === 'draw' ? 'draw' : won + ' wins') : 'your move', chatData: next, ...(won && {publicData: next})};
    }
  },
  ticker: {
    title: 'ticker: tick (in the background) → {t, p}; like → chatData {likes}',
    initial: {chatData: '{"likes":0}', publicData: null},
    answer(data, {state}) {
      if(data === 'like') return {result: 'liked', chatData: JSON.stringify({likes: (parse(state.chatData, {}).likes ?? 0) + 1})};
      const price = 100 + 10 * Math.sin(Date.now() / 20000) + Math.random();
      return {result: JSON.stringify({t: new Date().toISOString().slice(11, 19), p: Math.round(price * 100) / 100})};
    }
  },
  promo: {
    title: 'promo: redeem once',
    initial: {chatData: null, publicData: '{"code":"TG-WIDGET-2026","off":20}'},
    answer(data, {state}) {
      if(data !== 'redeem') return {result: 'unknown'};
      if(parse(state.chatData, {}).redeemed) return {result: 'already'};
      return {result: 'ok', chatData: JSON.stringify({redeemed: new Date().toISOString().slice(0, 16)})};
    }
  },
  shop: {
    title: 'shop (the wallet): pay:N with {wallet: true} → a transaction to the shop (valid 5 min); paid → chatData {paid}; signData → {signed}',
    initial: {chatData: null, publicData: JSON.stringify({items: SHOP_ITEMS.map(([name, amount]) => [name, +amount / 1e9])})},
    answer(data, {wallet}) {
      const match = /^pay:([0-9])$/.exec(data);
      const item = match && SHOP_ITEMS[+match[1]];
      if(!item) return {result: JSON.stringify({err: 'unknown'})};
      if(!wallet) return {result: JSON.stringify({err: 'no wallet: ask with { wallet: true }'})};
      if(wallet.balance < +item[1]) return {result: JSON.stringify({err: 'not enough TON', balance: wallet.balance / 1e9})};
      // a fresh order, priced now, valid 5 minutes: TON Connect's transaction as the widget passes it on
      const tx = {valid_until: Math.floor(Date.now() / 1000) + 300, messages: [{address: SHOP_ADDRESS, amount: item[1]}]};
      return {result: JSON.stringify({tx, from: wallet.address})};
    },
    wallet(call, {msgHash, domain, wallet, state}) {
      if(call.method === 'signData') return {result: JSON.stringify({signed: domain, text: call.payload.text ?? null})};
      // a real bot finds the transaction by its message hash, waits for it to be final and checks the sender, the amount and the order
      const item = SHOP_ITEMS.find(([, amount]) => amount === call.transaction.messages[0]?.amount)?.[0] ?? '?';
      const paid = [...(parse(state.chatData, {}).paid ?? []), item].slice(-5);
      return {result: JSON.stringify({paid: item, hash: msgHash.slice(0, 8), from: wallet.address.slice(0, 8)}), chatData: JSON.stringify({paid})};
    }
  },
  // widget-sandbox's corpus/bot-demos (the protocol of each is in its README.md there)
  gram: {
    title: 'bot-demos wallet test: w:me / w:pay with {wallet: true}, w:text, signData → s, sendTransaction → t wait, w:st → ok; chatData {m, s, t}',
    initial: {chatData: null, publicData: null},
    answer(data, {wallet, state}) {
      const saved = parse(state.chatData, {});
      const noWallet = {result: JSON.stringify({err: 'No wallet card came: ask with { wallet: true }'})};
      if(data === 'w:me') return wallet ? gramReply(state, {m: {a: MOCK_WALLET_FRIENDLY, b: '' + wallet.balance}}) : noWallet;
      if(data === 'w:text') return {result: JSON.stringify({text: `Gram Wallet test for @mockbot\nSigned at ${new Date().toISOString().slice(0, 19)}Z\nNonce ${Math.random().toString(16).slice(2, 14)}`})};
      if(data === 'w:pay') {
        if(!wallet) return noWallet;
        return {result: JSON.stringify({tx: {valid_until: Math.floor(Date.now() / 1000) + 300, network: '-239', messages: [{address: MOCK_WALLET_FRIENDLY, amount: '10000000'}]}})};
      }
      // the real bot looks the transfer up on toncenter by its message hash; here the chain has it on the first look
      if(data === 'w:st') return saved.t?.st === 'wait' ? gramReply(state, {t: {h: saved.t.h, st: 'ok', w: 'To the same wallet · fee 0.0031 TON'}}) : {result: JSON.stringify({t: saved.t ?? null})};
      return {result: JSON.stringify({err: 'Unknown request'})};
    },
    wallet(call, {msgHash, state}) {
      const part = call.method === 'sendTransaction' ?
        {t: {h: msgHash, st: 'wait', w: 'Waiting for the chain…'}} :
        {s: {ok: true, w: 'Valid · v4r2, the key on chain'}};
      return gramReply(state, part);
    }
  },
  order: {
    title: 'bot-demos order: order:poll / order:refresh (refresh moves the order one step on), order:cancel while st ≤ 1',
    initial: {
      chatData: '{"items":[["Margherita",2,1250],["Burrata",1,900],["Lemonade",2,350]],"cur":"€","addr":"221B Baker St, flat 3","pay":"•• 4242"}',
      publicData: '{"shop":"Pizzeria Uno","e":"🍕","id":"A-1042","st":1,"eta":"19:40","u":"19:12","bot":"examplebot"}'
    },
    answer(data, {state}) {
      const order = parse(state.publicData, {st: 0});
      if(data === 'order:cancel') {
        if(order.st > 1 || order.st < 0) return {result: JSON.stringify({err: order.st < 0 ? 'Already cancelled' : 'Too late to cancel'})};
        order.st = -1;
      } else if(data === 'order:refresh') {
        // each refresh moves the order one step on, and the courier gets closer
        if(order.st >= 0 && order.st < 3) {
          order.st++;
          order.eta = new Date(Date.now() + (3 - order.st) * 8 * 60e3).toTimeString().slice(0, 5);
        }
      } else if(data !== 'order:poll') return {result: JSON.stringify({err: 'unknown'})};
      if(data !== 'order:poll') order.u = new Date().toTimeString().slice(0, 5);
      return {result: JSON.stringify({st: order.st, eta: order.eta}), publicData: JSON.stringify(order)};
    }
  },
  vote: {
    title: 'bot-demos poll: vote:N toggles the viewer\'s vote; publicData {q, o, v, r} (r: the revision)',
    initial: {chatData: null, publicData: '{"q":"Where do we go on Friday?","o":["Pizza","Sushi","Tacos","Burgers"],"v":[3,5,1,2]}'},
    answer(data, {viewer, state, votes}) {
      const match = /^vote:(\d)$/.exec(data);
      const poll = parse(state.publicData, {o: [], v: []});
      if(!match || +match[1] >= poll.o.length) return {result: JSON.stringify({err: 'unknown'})};
      const option = +match[1];
      const before = votes.get(viewer);
      if(before !== undefined) poll.v[before]--;
      if(before === option) votes.delete(viewer);
      else {
        votes.set(viewer, option);
        poll.v[option]++;
      }

      poll.r = (poll.r ?? 0) + 1;
      return {result: JSON.stringify({my: votes.get(viewer) ?? -1, v: poll.v, r: poll.r}), publicData: JSON.stringify(poll)};
    }
  },
  rsvp: {
    title: 'bot-demos rsvp: rsvp:in / rsvp:may / rsvp:out (the same again clears); chatData {in, may, out}, publicData {t, w, p, max, n}',
    initial: {
      chatData: '{"in":[[101,"Bob"],[102,"Eve"],[103,"Max"],[104,"Kim"],[105,"Leo"]],"may":[[106,"Zoe"]],"out":[[107,"Ian"]]}',
      publicData: '{"t":"Friday football","w":"Fri, Nov 6 · 19:00","p":"Central Park, field 3","max":10,"n":5}'
    },
    answer(data, {viewer, name, state}) {
      const match = /^rsvp:(in|may|out)$/.exec(data);
      if(!match) return {result: JSON.stringify({err: 'unknown'})};
      const lists = parse(state.chatData, {in: [], may: [], out: []});
      const event = parse(state.publicData, {});
      const keys = ['in', 'may', 'out'] as const;
      const was = keys.find((key) => lists[key].some((entry: [number, string]) => entry[0] === viewer));
      for(const key of keys) lists[key] = lists[key].filter((entry: [number, string]) => entry[0] !== viewer);
      const me = was === match[1] ? null : match[1];
      if(me === 'in' && lists.in.length >= event.max) return {result: JSON.stringify({err: 'Full', me: was ?? null})};
      if(me) lists[me].push([viewer, name]);
      event.n = lists.in.length;
      return {result: JSON.stringify({me}), chatData: JSON.stringify(lists), publicData: JSON.stringify(event)};
    }
  },
  duel: {
    title: 'bot-demos duel: ttt:N, ttt:new; the mock plays O as Bob after your X so one person can try it',
    initial: {chatData: '{"b":"---------","x":null,"o":null,"t":"x","w":null,"l":null,"s":[0,0]}', publicData: null},
    answer(data, {viewer, name, state}) {
      const game = parse(state.chatData, {b: '---------', x: null, o: null, t: 'x', w: null, l: null, s: [0, 0]});
      const error = (err: string) => ({result: JSON.stringify({err})});
      const snapshot = () => JSON.stringify({b: game.b, x: game.x?.[1] ?? null, o: game.o?.[1] ?? null, w: game.w, s: game.s, bot: 'examplebot'});
      const play = (mark: 'x' | 'o', i: number) => {
        game.b = game.b.slice(0, i) + mark + game.b.slice(i + 1);
        const line = winningLine(game.b);
        if(line) {
          game.w = mark;
          game.l = line;
          game.s[mark === 'x' ? 0 : 1]++;
        } else if(!game.b.includes('-')) game.w = 'd';
        game.t = mark === 'x' ? 'o' : 'x';
      };

      if(data === 'ttt:new') {
        if(!game.w) return error('Game on');
        Object.assign(game, {b: '---------', t: game.w === 'x' ? 'o' : 'x', w: null, l: null});
        // Bob lost or drew as O and starts the rematch: he moves at once
        if(game.t === 'o' && game.o?.[0] === DUEL_BOB) play('o', botMove(game.b));
        return {result: '{"ok":1}', chatData: JSON.stringify(game), publicData: snapshot()};
      }

      const match = /^ttt:([0-8])$/.exec(data);
      if(!match) return error('unknown');
      if(game.w) return error('Game over');
      if(!game.x) game.x = [viewer, name];
      const mark = game.x[0] === viewer ? 'x' : game.o?.[0] === viewer ? 'o' : game.o ? null : 'o';
      if(!mark) return error('Full');
      if(mark === 'o' && !game.o) game.o = [viewer, name];
      if(game.t !== mark) return error('Not your turn');
      if(game.b[+match[1]] !== '-') return error('Taken');
      play(mark, +match[1]);
      // one person in the sandbox: Bob answers as O
      if(!game.w && mark === 'x' && (!game.o || game.o[0] === DUEL_BOB)) {
        game.o = [DUEL_BOB, 'Bob'];
        play('o', botMove(game.b));
      }

      return {result: '{"ok":1}', chatData: JSON.stringify(game), publicData: snapshot()};
    }
  },
  quote: {
    title: 'bot-demos ticker: no requests; a new publicData comes with the bot\'s edit of the shared widget',
    initial: {chatData: null, publicData: '{"s":"TON","n":"Toncoin","c":"$","p":5.4321,"o":5.31,"h":[5.31,5.29,5.33,5.36,5.34,5.38,5.41,5.39,5.37,5.4,5.44,5.42,5.45,5.43,5.41,5.39,5.42,5.46,5.44,5.47,5.45,5.43,5.44,5.4321],"t":"21:59:30"}'},
    answer: () => ({result: JSON.stringify({err: 'no requests'})})
  },
  reaction: {
    title: 'bot-demos reaction: score:N (100–2000 ms) → the shared top (8 rows, also in the answer) and the chat\'s best',
    initial: {chatData: '{"best":243}', publicData: '{"top":[["Max",171],["Eve",188],["Bob",203],["Kim",219],["Leo",240],["Zoe",262]],"plays":42}'},
    answer(data, {name, state}) {
      const match = /^score:(\d{3,4})$/.exec(data);
      const ms = match ? +match[1] : 0;
      if(!(ms >= 100 && ms <= 2000)) return {result: JSON.stringify({err: 'Not a human time'})};
      const board = parse(state.publicData, {top: [], plays: 0});
      const chat = parse(state.chatData, {});
      const mine = board.top.find((row: [string, number]) => row[0] === name);
      if(mine) mine[1] = Math.min(mine[1], ms);
      else board.top.push([name, ms]);
      board.top.sort((a: [string, number], b: [string, number]) => a[1] - b[1]);
      board.top = board.top.slice(0, 8);
      board.plays++;
      board.r = (board.r ?? 0) + 1;
      const best = Math.min(chat.best ?? ms, ms);
      const rank = board.top.findIndex((row: [string, number]) => row[0] === name) + 1;
      return {
        result: JSON.stringify({rank, best: mine ? mine[1] : ms, top: board.top, plays: board.plays, r: board.r}),
        chatData: JSON.stringify({best}),
        publicData: JSON.stringify(board)
      };
    }
  }
};

/** The bot-demos duel's second player in a sandbox of one. */
const DUEL_BOB = 2002;

/** How the bot answers: as itself, or with a client's failure. */
export const MOCK_BOT_MODES = ['bot', 'TIMEOUT', 'RATE_LIMITED', 'FAILED'] as const;
export type MockBotMode = (typeof MOCK_BOT_MODES)[number];
/**
 * The user's Gram Wallet: none (`TelegramWidget.wallet` is null), or one whose window the user confirms, declines
 * (`REJECTED`), or that refuses what it is asked (`BAD_REQUEST`).
 */
export const MOCK_WALLET_MODES = ['none', 'confirm', 'REJECTED', 'BAD_REQUEST'] as const;
export type MockWalletMode = (typeof MOCK_WALLET_MODES)[number];
export const MOCK_MESSAGE_KINDS = Object.keys(WIDGET_MESSAGE_KINDS) as WidgetMessageKind[];
/** How long the bot takes to answer. */
const ANSWER_DELAY = 300;
const VIEWER = '1001,Ann,Lee,ann_lee';

/** `kind`: a request that asked for the wallet, or a wallet call. */
export type MockBotRequest = {at: string, widget: string, data: string, kind?: 'wallet' | WalletCall['method'], outcome?: string};

const bot = createRoot(() => {
  const [kind, setKind] = createSignal<WidgetMessageKind>('private');
  const [mode, setMode] = createSignal<MockBotMode>('bot');
  const [wallet, setWallet] = createSignal<MockWalletMode>('confirm');
  const [shared, setShared] = createSignal(true);
  const [requests, setRequests] = createSignal<MockBotRequest[]>([]);
  return {kind, setKind, mode, setMode, wallet, setWallet, shared, setShared, requests, setRequests};
});

export const {
  kind: mockMessageKind, setKind: setMockMessageKind,
  mode: mockBotMode, setMode: setMockBotMode,
  wallet: mockWalletMode, setWallet: setMockWalletMode,
  shared: mockWidgetShared, setShared: setMockWidgetShared,
  requests: mockBotRequests
} = bot;

/**
 * The bot named by the widget's `<meta name="tw-bot">`, `echo` otherwise. A conformance case says in its header how
 * it is sent (`message`: the state it starts with) and what the bot answers to each request (`bot`): that bot.
 */
function botOf(html: string): Bot {
  const header = /<!-- conformance (\{.*?\}) -->/.exec(html);
  const conformance = header && parse(header[1], undefined);
  if(conformance?.message || conformance?.bot) {
    const message = conformance.message?.[0] ?? {};
    const actions: Record<string, ConformanceAction> = conformance.bot ?? {};
    // `{n}`: the requests with that data in this message, this one included; `{from}`: the first name of the user
    // who asked; `{time}`: the bot's clock
    const counters = new Map<string, number>();
    const fill = (text: string, n: number) => text.replace(/\{n\}/g, '' + n)
    .replace(/\{from\}/g, VIEWER.split(',')[1])
    .replace(/\{time\}/g, new Date().toTimeString().slice(0, 8));
    const act = (data: string, action: ConformanceAction): Reply => {
      const n = (counters.get(data) ?? 0) + 1;
      counters.set(data, n);
      return {
        result: action.result !== undefined ? fill(action.result, n) : null,
        ...(action.edit?.chat_data !== undefined && {chatData: fill(action.edit.chat_data, n)}),
        ...(action.edit?.public_data !== undefined && {publicData: fill(action.edit.public_data, n)}),
        ...(action.editShared && {sharedData: fill(action.editShared.public_data, n)})
      };
    };
    return {
      title: 'the conformance case\'s bot',
      initial: getWidgetData(message),
      answer: (data) => {
        const action = actions[data];
        if(!action) return {result: null};
        const reply = act(data, action);
        return action.repeat ? {...reply, repeat: {...action.repeat, edit: () => act(data, action)}} : reply;
      }
    };
  }

  const match = /<meta\s+name=["']tw-bot["']\s+content=["']([\w-]+)["']/i.exec(html);
  return BOTS[match && BOTS[match[1]] ? match[1] : 'echo'];
}

/** The server's flags for a kind of message (the selected one), the chat's kind, the viewer, and whether they have the wallet. */
export function mockWidgetContext(kind = mockMessageKind(), wallet = mockWalletMode() !== 'none'): WidgetContext {
  const context = WIDGET_MESSAGE_KINDS[kind];
  return {...context, viewer: viewerFromList(VIEWER), ...(wallet && {wallet: true})};
}

/**
 * The shared state of a widget_id as the server keeps it, one for every message showing the widget (the page's sandbox
 * and one over it show the same fixtures), while any of them is there; and those messages' widgets, which a poll through
 * any one of them brings a new value to (as appWidgetsManager.pollWidgetPublicData does every message of the widget).
 */
const sharedStates = new Map<string, {publicData: string | null, widgets: Set<() => void>}>();

/** What the sandbox hands one widget: its state, its requests, a shared widget's polls (through publicData.ts). */
export function createMockWidget(widget: string, html: string) {
  const {title, initial, answer, wallet} = botOf(html);
  const widgetId = 'sandbox:' + widget;
  // a static widget (no widget_id) has its public state to its message alone; a shared one has its widget_id's, for its
  // life (the panel's switch makes another widget)
  const isShared = untrack(mockWidgetShared);
  let shared = isShared ? sharedStates.get(widgetId) : undefined;
  if(!shared) {
    shared = {publicData: initial.publicData, widgets: new Set()};
    if(isShared) sharedStates.set(widgetId, shared);
  }
  /** The message's own state as the server has it (its shared state is the widget_id's), and what the running widget has. */
  let chatData = initial.chatData;
  const server = (): State => ({chatData, publicData: shared.publicData});
  const votes = new Map<number, number>();
  const [data, setData] = createSignal<WidgetData>(server());

  // a poll's new value
  const deliver = () => {
    if(shared.publicData !== data().publicData) setData({chatData: data().chatData, publicData: shared.publicData});
  };
  shared.widgets.add(deliver);
  // with its message's widget (the sandbox's), not a script's
  if(getOwner()) onCleanup(() => {
    shared.widgets.delete(deliver);
    if(!shared.widgets.size && sharedStates.get(widgetId) === shared) sharedStates.delete(widgetId);
  });

  const log = (record: MockBotRequest) => bot.setRequests((list) => [record, ...list].slice(0, 50));

  /** The bot's `editWidgetData` of a shared widget: only a poll brings it to the widgets. */
  const editShared = (publicData: string | null) => {
    shared.publicData = publicData;
  };

  /** The bot's edits of the message's state, which reach its widget at once, and of the shared state. */
  const applyEdit = (reply: Reply) => {
    if('sharedData' in reply) editShared(reply.sharedData || null);
    if(!('chatData' in reply || 'publicData' in reply)) return;
    if('chatData' in reply) chatData = reply.chatData || null;
    if('publicData' in reply) shared.publicData = reply.publicData || null;
    setData(server());
  };

  const context = (withWallet?: boolean): BotContext => ({viewer: 1001, name: VIEWER.split(',')[1], state: server(), votes, ...(withWallet && {wallet: MOCK_WALLET})});

  /**
   * A query to the bot: after the delay it fails with `failure`, or the bot does `work` — it edits the state first (the
   * server's update reaches the widget), then answers with the result only.
   */
  const ask = (record: MockBotRequest, failure: string | undefined, work: () => Reply) => new Promise<WidgetRequestAnswer>((resolve, reject) => {
    log(record);
    const settle = (outcome: string) => bot.setRequests((list) => list.map((r) => r === record ? {...r, outcome} : r));
    setTimeout(() => {
      if(failure) {
        settle(failure);
        return reject(failure);
      }

      const reply = work();
      applyEdit(reply);
      const {repeat} = reply;
      for(let i = 1; i < (repeat?.times ?? 0); ++i) setTimeout(() => applyEdit(repeat.edit()), i * repeat.every * 1000);

      settle(JSON.stringify(reply.result ?? null));
      resolve({result: reply.result ?? null});
    }, ANSWER_DELAY);
  });

  const record = (data: string, kind?: MockBotRequest['kind']): MockBotRequest => ({at: new Date().toISOString().slice(11, 23), widget, data, ...(kind && {kind})});
  const botFailure = () => {
    const mode = mockBotMode();
    return mode === 'bot' ? undefined : mode;
  };

  const onRequest = ({data: request, wallet: withWallet}: WidgetRequest) => {
    return ask(record(request, withWallet ? 'wallet' : undefined), botFailure(), () => answer(request, context(withWallet)));
  };

  /**
   * The wallet's window ends as the panel says; confirmed, the outcome goes to the bot as a query (with the wallet's
   * card), which fails as a request's would.
   */
  const onWallet = (call: WalletCall) => {
    const walletMode = mockWalletMode();
    const hash = () => Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return ask(record(call.data, call.method), walletMode !== 'confirm' ? walletMode : botFailure(), () => {
      const outcome = call.method === 'sendTransaction' ? {msgHash: hash()} : {domain: 'bot' + MOCK_BOT_ID};
      return wallet ? wallet(call, {...context(true), ...outcome}) : {result: null};
    });
  };


  // a shared widget's poll, as appWidgetsManager.pollWidgetPublicData does it against the server: through one message of
  // the widget_id (publicData.ts polls one), into every message of it
  const managers = {
    appWidgetsManager: {
      pollWidgetPublicData: async() => {
        shared.widgets.forEach((deliver) => deliver());
        // the next poll the server's shortest period later: the sandbox's
        return Date.now() + WIDGET_POLL_MIN_PERIOD * 1000;
      }
    }
  } as any as AppManagers;

  return {
    title,
    data,
    onRequest,
    onWallet,
    editShared,
    publicData: () => isShared ? {widgetId, peerId: 0 as PeerId, mid: 0, managers} : undefined
  };
}
