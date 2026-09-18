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
import CALL_STATE from '@lib/calls/callState';
import type {GroupCall, GroupCallParticipant} from '@layer';
import {defineStories} from '../registry';
import type {PopupStoryContext} from '../context';

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

  let interval: number;
  let video: MediaStream;
  if(withVideo) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');

    let frame = 0;
    const draw = () => {
      const shift = (frame++ * 4) % canvas.width;
      const gradient = context.createLinearGradient(shift - canvas.width, 0, shift, canvas.height);
      gradient.addColorStop(0, '#3e917a');
      gradient.addColorStop(0.5, '#53a4d1');
      gradient.addColorStop(1, '#a667d5');
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
    };

    draw();
    interval = window.setInterval(draw, 1000 / 30);
    video = canvas.captureStream(30);
    streams.video = streams.ownVideo = video;
  }

  return {
    streams,
    dispose: () => {
      if(interval !== undefined) clearInterval(interval);
      video?.getTracks().forEach((track) => track.stop());
      audio.getTracks().forEach((track) => track.stop());
      audioContext.close();
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

/** Shared between the story's manager answers and its `open()`; both need the same rows. */
let roster: ReturnType<typeof groupCallRoster>;

/**
 * Its roster, ourselves first — the panel reads our own row off `instance.participant` and the rest
 * out of the participants cache, which is a Map the roster mutates in place. Built once per story
 * open so it stays the same Map across the calls the list makes.
 */
function groupCallRoster(ctx: PopupStoryContext) {
  const rows: Array<{peerId: PeerId, self?: boolean, muted?: boolean}> = [
    {peerId: ctx.peer('self'), self: true, muted: true},
    {peerId: ctx.peer('private')},
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
    date: 0,
    source: index + 1
  }));

  return {
    participants,
    self: participants[0],
    cached: new Map(rows.map((row, index) => [row.peerId, participants[index]]))
  };
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
  media?: 'none' | 'audio' | 'video'
};

/** A 1-on-1 call, freshly constructed: no signaling, no media, no server-side call behind it. */
async function createCall(peerId: PeerId, isOutgoing?: boolean) {
  const {default: CallInstance} = await import('@lib/calls/callInstance');
  return new CallInstance({
    isOutgoing: !!isOutgoing,
    interlocutorUserId: peerId.toUserId(),
    managers: rootScope.managers
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

  // The far side's camera is announced over the data channel, not inferred from the track.
  if(options.media === 'video') {
    instance.setMediaState({
      '@type': 'MediaState',
      type: 'output',
      muted: false,
      lowBattery: false,
      screencastState: 'inactive',
      videoRotation: 0,
      videoState: 'active'
    });
  }

  instance.overrideConnectionState(options.state);
  showCallPopup(instance);

  return () => {
    media?.dispose();
    instance.cleanup();
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
      media: 'audio'
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
      media: 'video'
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
  {
    /*
     * The legacy video chat, which is a panel rather than a box. Its state is read off the ICE
     * connection and its roster off the participants cache, so the story hands it a connected-looking
     * transport and answers the cache — everything else it builds itself.
     */
    id: 'call/groupCall',
    fixtureOnly: true,
    title: 'Video chat',
    managers: (ctx) => {
      roster = groupCallRoster(ctx);
      return {
        appGroupCallsManager: {
          getCachedParticipants: () => roster.cached,
          getGroupCallParticipants: () => ({participants: roster.participants, isEnd: true}),
          getGroupCall: () => sandboxGroupCall,
          getGroupCallFull: () => sandboxGroupCall
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
        managers: rootScope.managers,
        // The panel reads its state off the transport and its microphone off the capture track.
        // There is neither, so stand in a connected-looking connection over the silent stream —
        // the same shape `src/tests/groupCallSelfRow.test.ts` drives the instance with.
        connections: {
          main: {
            connection: {iceConnectionState: 'connected'},
            streamManager: {
              inputStream: media.streams.ownAudio,
              hasInputTrackKind: (kind: string) => kind === 'audio',
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

      groupCallsController.setCurrentGroupCall(instance);
      showGroupCallPopup();

      return () => {
        groupCallsController.setCurrentGroupCall(undefined);
        media.dispose();
      };
    }
  },
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
