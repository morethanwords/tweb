/*
 * Everything the SDP builders interpolate besides the 1-on-1 InitialSetup —
 * the peer's NegotiateChannels contents, the SFU's join answer and the
 * participants' source groups — comes from JSON. These guards reject a value
 * that would end an SDP line early, stringify to something the builder does
 * not expect, or grow without bound.
 */

import {describe, expect, it} from 'vitest';
import {isSdpSafeConnectionData, isSdpSafeContents, isSdpSafeSourceGroups} from '@lib/calls/helpers/sdpSafety';

const content = (over: any = {}) => ({
  type: 'audio',
  ssrc: '1234',
  ssrcGroups: [{semantics: 'FID', ssrcs: ['1234', 5678]}],
  payloadTypes: [{
    id: 111,
    name: 'opus',
    clockrate: 48000,
    channels: 2,
    feedbackTypes: [{type: 'transport-cc'}],
    parameters: {minptime: 10, useinbandfec: '1'}
  }],
  rtpExtensions: [{id: 1, uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level'}],
  ...over
});

const transport = (over: any = {}) => ({
  ufrag: 'abcd',
  pwd: 'secret',
  'rtcp-mux': true,
  fingerprints: [{hash: 'sha-256', fingerprint: 'AA:BB', setup: 'passive'}],
  candidates: [{
    foundation: '1',
    component: '1',
    protocol: 'udp',
    priority: '2130706431',
    ip: '203.0.113.9',
    port: '3478',
    type: 'host',
    generation: '0',
    id: 'c1',
    network: '1'
  }],
  ...over
});

const connectionData = (over: any = {}) => ({
  transport: transport(),
  audio: {
    'payload-types': [{
      id: 111,
      name: 'opus',
      clockrate: 48000,
      channels: 2,
      parameters: {minptime: 10},
      'rtcp-fbs': [{type: 'transport-cc'}]
    }],
    'rtp-hdrexts': [{id: 1, uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level'}]
  },
  video: {
    endpoint: 'ep1',
    'payload-types': [{id: 96, name: 'VP8', clockrate: 90000, parameters: [], 'rtcp-fbs': [{type: 'ccm', subtype: 'fir'}]}],
    'rtp-hdrexts': [],
    server_sources: [1, 2]
  },
  ...over
});

const payloadType = (over: any = {}) => ({id: 111, name: 'opus', clockrate: 48000, ...over});

describe('isSdpSafeContents (1-on-1 NegotiateChannels)', () => {
  it('accepts a normal contents list', () => {
    expect(isSdpSafeContents([content(), content({type: 'video', ssrc: 42, ssrcGroups: undefined})])).toBe(true);
  });

  it('accepts what tgcalls actually emits: empty subtype, zero channels, empty group list', () => {
    expect(isSdpSafeContents([content({
      ssrcGroups: [],
      payloadTypes: [
        payloadType({feedbackTypes: [{type: 'transport-cc', subtype: ''}]}),
        payloadType({id: 9, name: 'G722', clockrate: 8000, channels: 0})
      ]
    })])).toBe(true);
  });

  it('rejects a line break in any interpolated string', () => {
    expect(isSdpSafeContents([content({payloadTypes: [payloadType({name: 'opus\r\na=candidate:evil'})]})])).toBe(false);
    expect(isSdpSafeContents([content({rtpExtensions: [{id: 1, uri: 'urn:x\n'}]})])).toBe(false);
    expect(isSdpSafeContents([content({ssrcGroups: [{semantics: 'FID\r', ssrcs: [1]}]})])).toBe(false);
    expect(isSdpSafeContents([content({payloadTypes: [payloadType({parameters: {'a\nb': 1}})]})])).toBe(false);
    expect(isSdpSafeContents([content({payloadTypes: [payloadType({parameters: {apt: '96\r\na=x'}})]})])).toBe(false);
    expect(isSdpSafeContents([content({payloadTypes: [payloadType({feedbackTypes: [{type: 'nack', subtype: 'pli\n'}]})]})])).toBe(false);
  });

  it('rejects values that would stringify to something else', () => {
    expect(isSdpSafeContents([content({ssrc: ['1\r\na=x']})])).toBe(false);
    expect(isSdpSafeContents([content({ssrc: 'abc'})])).toBe(false);
    expect(isSdpSafeContents([content({payloadTypes: [payloadType({id: '111'})]})])).toBe(false);
    expect(isSdpSafeContents([content({payloadTypes: [payloadType({id: 300})]})])).toBe(false);
    expect(isSdpSafeContents([content({payloadTypes: [payloadType({name: ['opus']})]})])).toBe(false);
    expect(isSdpSafeContents([content({payloadTypes: [payloadType({clockrate: '48000'})]})])).toBe(false);
    expect(isSdpSafeContents([content({type: 'application'})])).toBe(false);
    expect(isSdpSafeContents([content({rtpExtensions: {id: 1, uri: 'x'}})])).toBe(false);
    expect(isSdpSafeContents({length: 1})).toBe(false);
    expect(isSdpSafeContents(undefined)).toBe(false);
  });

  it('bounds every list', () => {
    expect(isSdpSafeContents(new Array(9).fill(content()))).toBe(false);
    expect(isSdpSafeContents([content({payloadTypes: new Array(65).fill(payloadType())})])).toBe(false);
    expect(isSdpSafeContents([content({rtpExtensions: new Array(33).fill({id: 1, uri: 'x'})})])).toBe(false);
    expect(isSdpSafeContents([content({ssrcGroups: [{semantics: 'SIM', ssrcs: new Array(9).fill(1)}]})])).toBe(false);
  });
});

describe('isSdpSafeConnectionData (group call join answer)', () => {
  it('accepts a normal answer', () => {
    expect(isSdpSafeConnectionData(connectionData())).toBe(true);
  });

  it('accepts the audio-less presentation answer and a candidate-less transport', () => {
    const data = connectionData({transport: transport({candidates: undefined})});
    delete data.audio;
    expect(isSdpSafeConnectionData(data)).toBe(true);
  });

  it('rejects a line break anywhere in the transport', () => {
    expect(isSdpSafeConnectionData(connectionData({transport: transport({ufrag: 'a\r\na=ice-lite'})}))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({transport: transport({pwd: 'p\n'})}))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({
      transport: transport({fingerprints: [{hash: 'sha-256', fingerprint: 'AA\r\na=x', setup: 'passive'}]})
    }))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({
      transport: transport({fingerprints: [{hash: 'sha-256', fingerprint: 'AA:BB', setup: 'evil'}]})
    }))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({transport: transport({fingerprints: []})}))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({
      transport: transport({candidates: [{...transport().candidates[0], ip: '1.2.3.4\r\na=x'}]})
    }))).toBe(false);
  });

  it('requires every candidate field the builder emits and bounds the list', () => {
    const {port, ...withoutPort} = transport().candidates[0];
    expect(isSdpSafeConnectionData(connectionData({transport: transport({candidates: [withoutPort]})}))).toBe(false);
    const {id, network, ...withoutOptional} = transport().candidates[0];
    expect(isSdpSafeConnectionData(connectionData({transport: transport({candidates: [withoutOptional]})}))).toBe(true);
    expect(isSdpSafeConnectionData(connectionData({
      transport: transport({candidates: new Array(65).fill(transport().candidates[0])})
    }))).toBe(false);
  });

  it('rejects codec tables the builder cannot emit', () => {
    const audio = connectionData().audio;
    expect(isSdpSafeConnectionData(connectionData({audio: {...audio, 'payload-types': undefined}}))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({audio: {...audio, 'rtp-hdrexts': {}}}))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({
      audio: {...audio, 'payload-types': [payloadType({name: 'opus\r\na=x'})]}
    }))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({
      audio: {...audio, 'payload-types': [payloadType({parameters: 'minptime=10'})]}
    }))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({
      video: {...connectionData().video, endpoint: 'ep\n'}
    }))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({
      video: {...connectionData().video, server_sources: ['1\r\n']}
    }))).toBe(false);
    expect(isSdpSafeConnectionData(connectionData({screencast: 'none'}))).toBe(false);
  });

  it('rejects anything that is not the answer object', () => {
    expect(isSdpSafeConnectionData(undefined)).toBe(false);
    expect(isSdpSafeConnectionData('{')).toBe(false);
    expect(isSdpSafeConnectionData({})).toBe(false);
  });
});

describe('isSdpSafeSourceGroups (participant video)', () => {
  it('accepts FID / SIM groups', () => {
    expect(isSdpSafeSourceGroups([
      {_: 'groupCallParticipantVideoSourceGroup', semantics: 'SIM', sources: [1, 2, 3]},
      {_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: [1, 4]}
    ])).toBe(true);
  });

  it('accepts the signed int32 form the server uses for sources', () => {
    expect(isSdpSafeSourceGroups([{semantics: 'FID', sources: [-1284067001, 211367753]}])).toBe(true);
    expect(isSdpSafeConnectionData(connectionData({
      video: {...connectionData().video, server_sources: [-1284067001]}
    }))).toBe(true);
  });

  it('rejects a semantics with a line break or a source that is not an SSRC', () => {
    expect(isSdpSafeSourceGroups([{semantics: 'FID\r\na=x', sources: [1]}])).toBe(false);
    expect(isSdpSafeSourceGroups([{semantics: 'FID', sources: ['1\r\na=x']}])).toBe(false);
    expect(isSdpSafeSourceGroups([{semantics: 'FID', sources: [1.5]}])).toBe(false);
    expect(isSdpSafeSourceGroups([{semantics: 'FID', sources: [-(2 ** 31) - 1]}])).toBe(false);
    expect(isSdpSafeSourceGroups([{semantics: 'FID', sources: [2 ** 32]}])).toBe(false);
    expect(isSdpSafeSourceGroups([{semantics: 'FID'}])).toBe(false);
  });

  it('bounds the groups', () => {
    expect(isSdpSafeSourceGroups(new Array(9).fill({semantics: 'SIM', sources: [1]}))).toBe(false);
    expect(isSdpSafeSourceGroups(undefined)).toBe(false);
  });
});
