/*
 * SDP helpers for the tgcalls v2 P2P signaling protocol.
 *
 * The tgcalls-v2 engine (p2pCall.ts) was ported from telegram-tt, which works
 * with flat helper functions. This module keeps that function API but is built
 * entirely on tweb's own SDP parser (@lib/calls/sdp) — section splitting and
 * `a=` attribute grouping are tweb's `parseSdp` / `SDPAttributes`; only the
 * protocol-specific shaping (payload types, fingerprints, ssrc groups) lives here.
 */

import {P2PFingerprint, P2PPayloadType, RtpHdrexts} from '@lib/calls/types';
import SDPAttributes from '@lib/calls/sdp/attributes';
import {parseSdp} from '@lib/calls/sdp/utils';

// A media (or session) section, in the flat shape the ported engine consumes,
// backed by tweb's SDPAttributes for any attribute lookup.
export type SdpSection = {
  kind: string,
  mid?: string,
  lines: string[],
  direction?: string,
  port: number,
  attributes: SDPAttributes
};

export type SdpSsrcGroup = {
  semantics: string,
  ssrcs: number[]
};

export type SdpSummarySection = {
  kind: string,
  mid?: string,
  port: number,
  direction?: string,
  payloads: string[],
  ssrcs: number[]
};

const SDP_DIRECTIONS = ['sendrecv', 'sendonly', 'recvonly', 'inactive'] as const;

// Split a raw SDP string into its session section + one section per `m=` line,
// using tweb's SDP parser.
export function parseSdpSections(sdp: string): SdpSection[] {
  const parsed = parseSdp(sdp);
  const sections: SdpSection[] = [{
    kind: 'session',
    mid: undefined,
    lines: parsed.session.lines.map((line) => line.toString()),
    direction: undefined,
    port: 0,
    attributes: new SDPAttributes(parsed.session.lines)
  }];

  parsed.media.forEach((section) => {
    const {attributes} = section;
    sections.push({
      kind: section.mediaType,
      mid: section.mid || undefined,
      lines: section.lines.map((line) => line.toString()),
      direction: SDP_DIRECTIONS.find((direction) => attributes.get(direction).exists),
      port: Number(section.mediaLineParts?.port || 0),
      attributes
    });
  });

  return sections;
}

export function parseBundleMids(sdp: string) {
  const sessionAttributes = new SDPAttributes(parseSdp(sdp).session.lines);
  const bundle = sessionAttributes.get('group').lines.find((line) => line.startsWith('BUNDLE '));
  return bundle?.slice('BUNDLE '.length).split(' ').filter(Boolean);
}

function readAttributeValue(section: SdpSection, key: string) {
  const attribute = section.attributes.get(key);
  return attribute.exists && attribute.value ? attribute.value : undefined;
}

// Find an `a=<key>:<value>` value, preferring the given section, falling back to
// the session. `prefix` is the legacy `a=<key>:` form the engine passes.
export function findSdpLineValue(sections: SdpSection[], prefix: string, section?: SdpSection) {
  const key = prefix.replace(/^a=/, '').replace(/:$/, '');

  if(section) {
    const value = readAttributeValue(section, key);
    if(value !== undefined) {
      return value;
    }

    const sessionSection = sections.find((item) => item.kind === 'session');
    return sessionSection && sessionSection !== section ? readAttributeValue(sessionSection, key) : undefined;
  }

  for(const item of sections) {
    const value = readAttributeValue(item, key);
    if(value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function getSdpDirection(section: SdpSection) {
  return section.direction;
}

export function getSdpPort(section: SdpSection) {
  return section.port;
}

export function parseFingerprints(sections: SdpSection[]): P2PFingerprint[] {
  const values = new Map<string, P2PFingerprint>();

  sections.forEach((section) => {
    const fingerprint = findSdpLineValue(sections, 'a=fingerprint:', section);
    if(!fingerprint) {
      return;
    }

    const [hash, value] = fingerprint.split(' ');
    const setup = findSdpLineValue(sections, 'a=setup:', section) || 'actpass';
    if(!hash || !value) {
      return;
    }

    values.set(`${hash}:${value}:${setup}`, {
      hash,
      setup,
      fingerprint: value
    });
  });

  return Array.from(values.values());
}

export function parseSsrcGroups(section: SdpSection): SdpSsrcGroup[] {
  return section.attributes.get('ssrc-group').lines.map((line) => {
    const [semantics, ...ssrcs] = line.split(' ');
    return {
      semantics,
      ssrcs: ssrcs.map(Number)
    };
  });
}

export function parseSsrcs(section: SdpSection, shouldIncludeGroups = false) {
  const values = new Set<number>();

  section.attributes.get('ssrc').lines.forEach((line) => {
    const match = line.match(/^\d+/);
    if(match) {
      values.add(Number(match[0]));
    }
  });

  if(shouldIncludeGroups) {
    section.attributes.get('ssrc-group').lines.forEach((line) => {
      line.match(/\d+/g)?.forEach((value) => {
        values.add(Number(value));
      });
    });
  }

  return Array.from(values);
}

export function parseExtmaps(section: SdpSection): RtpHdrexts[] {
  return section.attributes.get('extmap').lines.map((line) => {
    const [, rawId, uri] = line.match(/^(\d+)(?:\/[^\s]+)?\s(.+)$/) || [];
    if(!rawId || !uri) {
      throw new Error('Failed parsing SDP RTP extension');
    }

    return {
      id: Number(rawId),
      uri
    };
  });
}

export function parsePayloadTypes(section: SdpSection): P2PPayloadType[] {
  const payloadTypes: P2PPayloadType[] = section.attributes.get('rtpmap').lines.map((line) => {
    const [, rawId, name, rawClockrate, rawChannels] = line.match(/^(\d+)\s([^/]+)\/(\d+)(?:\/(\d+))?/) || [];
    if(!rawId || !name || !rawClockrate) {
      throw new Error('Failed parsing SDP payload type');
    }

    return {
      id: Number(rawId),
      name,
      clockrate: Number(rawClockrate),
      channels: rawChannels ? Number(rawChannels) : 0
    };
  });

  payloadTypes.forEach((payloadType) => {
    const parameters = parsePayloadParameters(section, payloadType.id);
    const feedbackTypes = parseFeedbackTypes(section, payloadType.id);

    if(Object.keys(parameters).length) {
      payloadType.parameters = parameters;
    }
    if(feedbackTypes.length) {
      payloadType.feedbackTypes = feedbackTypes;
    }
  });

  return payloadTypes;
}

// Compact SDP description for debug logging.
export function summarizeSdp(sdp: string, shouldIncludeSsrcGroups = false): SdpSummarySection[] {
  return parseSdpSections(sdp).filter((section) => section.kind !== 'session').map((section): SdpSummarySection => {
    return {
      kind: section.kind,
      mid: section.mid,
      port: section.port,
      direction: section.direction,
      payloads: (section.lines[0] || '').split(' ').slice(3),
      ssrcs: parseSsrcs(section, shouldIncludeSsrcGroups)
    };
  });
}

function parsePayloadParameters(section: SdpSection, payloadId: number) {
  const parameters: Record<string, string> = {};
  const prefix = `${payloadId} `;
  const rawParameters = section.attributes.get('fmtp').lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);
  if(!rawParameters) {
    return parameters;
  }

  rawParameters.split(';').forEach((item) => {
    const trimmed = item.trim();
    const separatorIndex = trimmed.indexOf('=');
    if(separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    if(key && value) {
      parameters[key] = value;
    }
  });

  return parameters;
}

function parseFeedbackTypes(section: SdpSection, payloadId: number): NonNullable<P2PPayloadType['feedbackTypes']> {
  const prefix = `${payloadId} `;
  return section.attributes.get('rtcp-fb').lines.filter((line) => line.startsWith(prefix)).map((line) => {
    const [type, subtype] = line.slice(prefix.length).split(' ');
    return {
      type,
      subtype: subtype || ''
    };
  });
}
