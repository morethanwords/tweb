/*
 * The call panels.
 *
 * A call is the one popup with no payload to hand it. What it draws it reads off a live
 * `CallInstance`, and that instance only reaches its interesting states through signaling, media
 * negotiation and a key exchange — none of which the sandbox has. So these build the real instance
 * (its constructor talks to nothing) and pin it to the state worth looking at, which is the same
 * thing a message-shaped story does with a fixture.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import CALL_STATE from '@lib/calls/callState';
import type {GroupCall, GroupCallParticipant, GroupCallParticipantVideo} from '@layer';
import type {GroupCallId} from '@appManagers/appGroupCallsManager';
import {defineStories, PopupStory} from '../registry';
import type {PopupStoryContext} from '../context';
import {videoChatUsers} from '../fixtures';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

/** The SAS a connected call prints in its header. Derived from the shared key, of which there is none. */
const FINGERPRINT: [string, string, string, string] = ['🐶', '🌴', '🎩', '🍎'];

/**
 * Stand-in media for a call that has none.
 *
 * A canvas the popup can decode actual frames from — it mounts a video tile only once one arrives,
 * so a still `MediaStream` would leave the panel in its avatar layout — plus a silent audio track,
 * which is what makes the mic button read as live instead of muted. Neither needs a device or a
 * permission prompt.
 */
function sandboxStreams(withVideo: boolean) {
  const audioContext = new AudioContext();
  const audio = audioContext.createMediaStreamDestination().stream;
  const streams: {ownAudio: MediaStream, video?: MediaStream, ownVideo?: MediaStream} = {ownAudio: audio};

  const camera = withVideo && sandboxCanvasStream(640, 480, 30, (context, frame) => {
    const {width, height} = context.canvas;
    const shift = (frame * 4) % width;
    const gradient = context.createLinearGradient(shift - width, 0, shift, height);
    gradient.addColorStop(0, '#3e917a');
    gradient.addColorStop(0.5, '#53a4d1');
    gradient.addColorStop(1, '#a667d5');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
  if(camera) {
    streams.video = streams.ownVideo = camera.stream;
  }

  return {
    streams,
    dispose: () => {
      camera && camera.dispose();
      audio.getTracks().forEach((track) => track.stop());
      audioContext.close();
    }
  };
}

/** A camera that is a canvas: `draw` paints frame number `frame`, `fps` times a second. */
function sandboxCanvasStream(
  width: number,
  height: number,
  fps: number,
  draw: (context: CanvasRenderingContext2D, frame: number) => void
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  let frame = 0;
  const paint = () => draw(context, frame++);
  paint();
  const interval = window.setInterval(paint, 1000 / fps);
  const stream = canvas.captureStream(fps);
  return {
    stream,
    dispose: () => {
      clearInterval(interval);
      stream.getTracks().forEach((track) => track.stop());
    }
  };
}

/** The video chat the group-call panel is pointed at; nothing here comes off the wire. */
const sandboxGroupCall: GroupCall.groupCall = {
  _: 'groupCall',
  pFlags: {can_change_join_muted: true},
  id: '1',
  access_hash: '1',
  participants_count: 3,
  title: 'Sandbox video chat',
  unmuted_video_limit: 4,
  version: 1
};

type GroupCallStoryOptions = {
  /** Remote cameras: Alice's first, then the crowd fixtures'. */
  videos?: number,
  /** Our own camera too. */
  selfVideo?: boolean,
  /** Alice shares her screen, pinned the way a fresh screencast is. */
  presentation?: boolean,
  /**
   * An end-to-end encrypted conference: `verified` with the call's key emoji, `syncing` while the
   * participants still agree on the key.
   */
  conference?: 'verified' | 'syncing'
};

type GroupCallRosterRow = {
  peerId: PeerId,
  self?: boolean,
  muted?: boolean,
  video?: 'landscape' | 'portrait',
  presentation?: boolean
};

/** Shared between the story's manager answers and its `open()`; both need the same rows. */
let roster: ReturnType<typeof groupCallRoster>;

/** SSRCs the fake videos are announced under; the panel looks each tile's element up by it. */
const VIDEO_SOURCE_BASE = 1000;
const PRESENTATION_SOURCE_BASE = 2000;

function makeParticipantVideo(source: number): GroupCallParticipantVideo {
  return {
    _: 'groupCallParticipantVideo',
    pFlags: {},
    endpoint: 'sandbox-' + source,
    source_groups: [{_: 'groupCallParticipantVideoSourceGroup', semantics: 'SIM', sources: [source]}]
  };
}

/**
 * Its roster, ourselves first — the panel reads our own row off `instance.participant` and the rest
 * out of the participants cache, which is a Map the roster mutates in place. Built once per story
 * open so it stays the same Map across the calls the list makes.
 */
function groupCallRoster(ctx: PopupStoryContext, options: GroupCallStoryOptions = {}) {
  const {videos = 0} = options;
  const rows: GroupCallRosterRow[] = [
    {peerId: ctx.peer('self'), self: true, muted: true, video: options.selfVideo ? 'landscape' : undefined},
    {peerId: ctx.peer('private'), video: videos > 0 ? 'landscape' : undefined, presentation: options.presentation},
    // every third camera is held upright, the way a phone sends it
    ...videoChatUsers.slice(0, Math.max(0, videos - 1)).map((user, index): GroupCallRosterRow => ({
      peerId: user.id.toPeerId(false),
      muted: index % 2 === 0,
      video: index % 3 === 1 ? 'portrait' : 'landscape'
    })),
    {peerId: ctx.peer('bot'), muted: true}
  ];

  const participants = rows.map((row, index): GroupCallParticipant.groupCallParticipant => ({
    _: 'groupCallParticipant',
    pFlags: {
      can_self_unmute: true,
      ...(row.self ? {self: true} : {}),
      ...(row.muted ? {muted: true} : {})
    },
    peer: {_: 'peerUser', user_id: row.peerId.toUserId()},
    date: index,
    source: index + 1,
    ...(row.video ? {video: makeParticipantVideo(VIDEO_SOURCE_BASE + index)} : {}),
    ...(row.presentation ? {presentation: makeParticipantVideo(PRESENTATION_SOURCE_BASE + index)} : {})
  }));

  return {
    rows,
    participants,
    self: participants[0],
    cached: new Map(rows.map((row, index) => [row.peerId, participants[index]]))
  };
}

/**
 * A camera for a fixture that has none: a slow gradient with the name across it, drawn at a low
 * frame rate so a dozen tiles stay cheap. The panel only mounts a tile once its element decodes
 * frames, which a still stream would never give it.
 */
function sandboxVideo(label: string, hue: number, width: number, height: number) {
  const camera = sandboxCanvasStream(width, height, 15, (context, frame) => {
    const shift = (frame * 3) % 360;
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue + shift / 6}, 55%, 42%)`);
    gradient.addColorStop(1, `hsl(${hue + 60 + shift / 6}, 60%, 28%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255, 255, 255, .85)';
    context.font = `bold ${Math.round(Math.min(width, height) / 8)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, width / 2, height / 2);
  });

  const video = document.createElement('video');
  video.autoplay = video.muted = true;
  video.setAttribute('playsinline', 'true');
  video.srcObject = camera.stream;

  return {video, dispose: camera.dispose};
}

type CallStoryOptions = {
  peerId: PeerId,
  state: CALL_STATE,
  isOutgoing?: boolean,
  /** Seconds the call has been up. Only a connected call prints a timer. */
  duration?: number,
  /** Show the emoji fingerprint, as a call that got past the key exchange does. */
  fingerprint?: boolean,
  /** Give the call live audio, and a moving canvas for the two video tiles. */
  media?: 'none' | 'audio' | 'video',
  /** Reception, 0..4, as the engine's stats would report it. */
  signalBars?: number,
  /** The other side says its battery is about to run out. */
  remoteLowBattery?: boolean
};

/** A 1-on-1 call, freshly constructed: no signaling, no media, no server-side call behind it. */
async function createCall(peerId: PeerId, isOutgoing?: boolean) {
  const {default: CallInstance} = await import('@lib/calls/callInstance');
  return new CallInstance({
    isOutgoing: !!isOutgoing,
    interlocutorUserId: peerId.toUserId(),
    managers: bindManagersToSession(rootScope.managers)
  });
}

/** Builds a 1-on-1 call in one fixed state, opens its panel, and hands back the teardown. */
async function openCall(options: CallStoryOptions) {
  const [instance, {default: showCallPopup}] = await Promise.all([
    createCall(options.peerId, options.isOutgoing),
    import('@components/call')
  ]);

  const media = options.media && options.media !== 'none' ? sandboxStreams(options.media === 'video') : undefined;

  /*
   * These three are written by the exchange a real call goes through, and read back out by the
   * public getters the panel uses (`isMuted`, `isSharingVideo`, `getVideoElement`,
   * `getEmojisFingerprint`). With no exchange to write them, the story seeds them directly —
   * the one sandbox-only shortcut here, kept to this single spot.
   */
  const seed = instance as any;
  if(options.fingerprint) seed.emojisFingerprint = FINGERPRINT;
  if(media) seed.p2p = {streams: media.streams};
  if(options.duration) instance.connectedAt = performance.now() - options.duration * 1000;
  instance.signalBars = options.signalBars;

  // The far side's camera and battery are announced over the data channel, not inferred from the track.
  if(options.media === 'video' || options.remoteLowBattery) {
    instance.setMediaState({
      '@type': 'MediaState',
      type: 'output',
      muted: false,
      lowBattery: !!options.remoteLowBattery,
      screencastState: 'inactive',
      videoRotation: 0,
      videoState: options.media === 'video' ? 'active' : 'inactive'
    });
  }

  instance.overrideConnectionState(options.state);
  showCallPopup(instance);

  return () => {
    media?.dispose();
    instance.cleanup();
  };
}

/*
 * The legacy video chat, which is a panel rather than a box. Its state is read off the ICE
 * connection and its roster off the participants cache, so the story hands it a connected-looking
 * transport and answers the cache — everything else it builds itself. Cameras are canvases
 * registered under the SSRCs the roster announces, which is where the panel looks a tile's video up.
 */
function groupCallStory(id: string, title: string, options: GroupCallStoryOptions = {}): Omit<PopupStory, 'group'> {
  return {
    id,
    fixtureOnly: true,
    title,
    managers: (ctx) => {
      roster = groupCallRoster(ctx, options);
      return {
        appGroupCallsManager: {
          getCachedParticipants: () => roster.cached,
          getGroupCallParticipants: () => ({participants: roster.participants, isEnd: true}),
          getGroupCall: () => sandboxGroupCall,
          getGroupCallFull: () => sandboxGroupCall,
          // what "Share Link" and the invite picker hand out
          exportGroupCallInvite: () => 'https://t.me/call/sandbox-video-chat'
        }
      };
    },
    open: async(ctx) => {
      const [{default: GroupCallInstance}, {default: groupCallsController}, {default: showGroupCallPopup}] =
        await Promise.all([
          import('@lib/calls/groupCallInstance'),
          import('@lib/calls/groupCallsController'),
          import('@components/groupCall')
        ]);

      const media = sandboxStreams(false);
      const instance = new GroupCallInstance({
        id: sandboxGroupCall.id,
        chatId: ctx.peer('group').toChatId(),
        managers: bindManagersToSession(rootScope.managers),
        // The panel reads its state off the transport and its microphone off the capture track.
        // There is neither, so stand in a connected-looking connection over the silent stream —
        // the same shape `src/tests/groupCallSelfRow.test.ts` drives the instance with.
        connections: {
          main: {
            connection: {iceConnectionState: 'connected'},
            streamManager: {
              inputStream: media.streams.ownAudio,
              hasInputTrackKind: (kind: string) => kind === 'audio',
              // a silent stand-in microphone: the waves idle
              getInputAudioLevel: () => 0,
              stop: () => {}
            },
            description: {},
            sources: {audio: {source: 1}},
            closeConnectionAndStream: () => {}
          }
        } as any
      });
      instance.groupCall = sandboxGroupCall;
      instance.participant = roster.self;
      instance.joined = true;
      if(options.conference) {
        // No encryption worker either: the panel only asks whether there is one, and reads the key
        // off the last status it reported.
        instance.e2e = {terminate: async() => {}, setSsrcUsers: async() => {}} as any;
        if(options.conference === 'verified') {
          instance.e2eStatus = {verification: {emojiHash: Uint8Array.from({length: 32}, (_, i) => i * 37 + 11)}} as any;
        }
      }
      // No SFU to renegotiate with: a roster push only moves pins, the way the real one does. The
      // controller, which routes those pushes to the instance, is only set up by a signed-in app.
      instance.onParticipantUpdate = (participant) => instance.syncParticipantPins(participant);
      const onParticipant = ({groupCallId, participant}: {groupCallId: GroupCallId, participant: GroupCallParticipant}) => {
        if(groupCallId === instance.id) instance.syncParticipantPins(participant);
      };
      rootScope.addEventListener('group_call_participant', onParticipant);

      // The other half of the sandbox-only shortcut in `openCall`: the elements a negotiated track
      // would have registered, keyed the way `getVideoElementFromParticipantByType` reads them.
      const elements: Map<string, HTMLMediaElement> = (instance as any).elements;
      const videos = roster.rows.flatMap((row, index) => {
        const peer = apiManagerProxy.getPeer(row.peerId);
        const name = peer?._ === 'user' ? peer.first_name : '';
        const hue = (index * 47) % 360;
        const made: Array<ReturnType<typeof sandboxVideo>> = [];
        if(row.video) {
          const portrait = row.video === 'portrait';
          const video = sandboxVideo(name, hue, portrait ? 360 : 640, portrait ? 640 : 360);
          elements.set(row.self ? 'main' : '' + (VIDEO_SOURCE_BASE + index), video.video);
          made.push(video);
        }

        if(row.presentation) {
          const video = sandboxVideo(name + '\'s screen', hue + 180, 1280, 800);
          elements.set('' + (PRESENTATION_SOURCE_BASE + index), video.video);
          made.push(video);
        }

        return made;
      });

      roster.participants.forEach((participant) => {
        if(participant.presentation) instance.syncParticipantPins(participant);
      });

      groupCallsController.setCurrentGroupCall(instance);
      showGroupCallPopup();

      return () => {
        rootScope.removeEventListener('group_call_participant', onParticipant);
        groupCallsController.setCurrentGroupCall(undefined);
        videos.forEach((video) => video.dispose());
        media.dispose();
      };
    }
  };
}

defineStories('Calls', [
  {
    id: 'call/outgoingRequesting',
    title: 'Outgoing — requesting',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      isOutgoing: true,
      state: CALL_STATE.REQUESTING
    })
  },
  {
    id: 'call/outgoingRinging',
    title: 'Outgoing — ringing',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      isOutgoing: true,
      state: CALL_STATE.PENDING
    })
  },
  {
    // The only state with two button rows: decline and accept sit below the media controls.
    id: 'call/incomingRinging',
    title: 'Incoming — ringing',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      state: CALL_STATE.PENDING
    })
  },
  {
    id: 'call/exchangingKeys',
    title: 'Exchanging keys',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      isOutgoing: true,
      state: CALL_STATE.EXCHANGING_KEYS
    })
  },
  {
    id: 'call/connecting',
    title: 'Connecting',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      isOutgoing: true,
      state: CALL_STATE.CONNECTING,
      fingerprint: true,
      media: 'audio'
    })
  },
  {
    id: 'call/active',
    title: 'In a call',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      isOutgoing: true,
      state: CALL_STATE.CONNECTED,
      duration: 125,
      fingerprint: true,
      media: 'audio',
      signalBars: 3
    })
  },
  {
    // No bars left: the warm palette and the weak-network pill, as on iOS.
    id: 'call/activeWeakSignal',
    title: 'In a call — weak network',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      isOutgoing: true,
      state: CALL_STATE.CONNECTED,
      duration: 125,
      fingerprint: true,
      media: 'audio',
      signalBars: 0
    })
  },
  {
    id: 'call/activeRemoteLowBattery',
    title: 'In a call — their battery is low',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      isOutgoing: true,
      state: CALL_STATE.CONNECTED,
      duration: 125,
      fingerprint: true,
      media: 'audio',
      signalBars: 4,
      remoteLowBattery: true
    })
  },
  {
    // Both tiles: the far side fills the panel, our own camera sits in the corner.
    id: 'call/activeVideo',
    title: 'In a video call',
    open: (ctx) => openCall({
      peerId: ctx.peer('private'),
      isOutgoing: true,
      state: CALL_STATE.CONNECTED,
      duration: 3725,
      fingerprint: true,
      media: 'video',
      signalBars: 4
    })
  },
  {
    /*
     * The same panel in conference-invite mode: no media, no fingerprint, no settings — only who
     * is calling and the two buttons. Driven by `ConferenceInviteInstance`, which takes its accept
     * and decline as callbacks, so a story can hand it ones that do nothing but close.
     */
    id: 'call/conferenceInvite',
    title: 'Conference invitation — ringing',
    open: async(ctx) => {
      const [{default: ConferenceInviteInstance}, {default: showCallPopup}] = await Promise.all([
        import('@lib/calls/conferenceInviteInstance'),
        import('@components/call')
      ]);

      const instance = new ConferenceInviteInstance({
        interlocutorUserId: ctx.peer('private').toUserId(),
        msgId: ctx.mid('private'),
        conferenceId: '1',
        participants: [ctx.peer('private'), ctx.peer('bot'), ctx.peer('self')],
        onAccept: async() => {},
        onDecline: async() => {}
      });

      showCallPopup(instance);
    }
  },
  {
    id: 'call/conferenceJoin',
    title: 'Join a conference call',
    open: async(ctx) => {
      const {default: showConferenceJoinPopup} = await import('@components/call/conferenceJoinPopup');
      // It rejects when dismissed — that is its contract with the join flow, not an error here.
      showConferenceJoinPopup({
        inviterPeerId: ctx.peer('private'),
        participantPeerIds: [ctx.peer('private'), ctx.peer('bot')],
        participantsCount: 5
      }).catch(() => {});
    }
  },
  {
    id: 'call/link',
    fixtureOnly: true,
    title: 'Call link — just created',
    open: async() => {
      const {default: showCallLinkPopup} = await import('@components/call/callLinkPopup');
      showCallLinkPopup({link: 'https://t.me/call/sandbox-call-link', initial: true});
    }
  },
  {
    id: 'call/linkManage',
    fixtureOnly: true,
    title: 'Call link — can be revoked',
    open: async() => {
      const {default: showCallLinkPopup} = await import('@components/call/callLinkPopup');
      showCallLinkPopup({link: 'https://t.me/call/sandbox-call-link', callId: '1', canManage: true});
    }
  },
  groupCallStory('call/groupCall', 'Video chat'),
  groupCallStory('call/groupCallVideos', 'Video chat — five cameras', {videos: 4, selfVideo: true}),
  groupCallStory('call/groupCallCrowd', 'Video chat — nine cameras', {videos: 8, selfVideo: true}),
  groupCallStory('call/groupCallScreencast', 'Video chat — a pinned screencast', {videos: 2, presentation: true}),
  groupCallStory('call/conference', 'Conference — the encryption key', {videos: 1, conference: 'verified'}),
  groupCallStory('call/conferenceSyncing', 'Conference — agreeing on the key', {conference: 'syncing'}),
  {
    /*
     * The in-call sheet, in its 1-on-1 shape (the group-call one adds "Mute new participants" and
     * the invite link). Its microphone meter and camera preview ask for the real devices, and
     * suppress themselves when there are none — so this renders with or without a webcam.
     */
    id: 'call/settings',
    title: 'In-call settings',
    open: async(ctx) => {
      const [instance, {default: showCallSettingsPopup}] = await Promise.all([
        createCall(ctx.peer('private'), true),
        import('@components/call/settingsPopup')
      ]);

      instance.overrideConnectionState(CALL_STATE.CONNECTED);

      showCallSettingsPopup({mode: 'p2p', instance});

      return () => instance.cleanup();
    }
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
