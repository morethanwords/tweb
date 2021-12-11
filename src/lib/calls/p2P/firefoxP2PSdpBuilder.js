/*
 *  Copyright (c) 2018-present, Evgeny Nadymov
 *
 * This source code is licensed under the GPL v.3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { addDataChannel, addExtmap, addPayloadTypes, addSsrc } from './p2PSdpBuilder';

export class FirefoxP2PSdpBuilder {
    static generateOffer(info) {
        const { fingerprints, ufrag, pwd, audio, video } = info;
        audio.type = 'audio';
        video.type = 'video';
        const media = [audio, video];

        let sdp = `v=0
o=- 1 0 IN IP4 0.0.0.0
s=-
t=0 0`;
        if (fingerprints) {
            fingerprints.forEach(x => {
                const { hash, fingerprint, setup } = x;
                sdp += `
a=fingerprint:${hash} ${fingerprint}
a=setup:${setup}`;
            });
        }
        if (ufrag && pwd) {
            sdp += `
a=ice-ufrag:${ufrag}
a=ice-pwd:${pwd}`;
        }

        sdp += `
a=group:BUNDLE 0 1 2
a=ice-options:trickle
a=msid-semantic:WMS *`;
        const streamName = 'stream' + media.map(x => x.ssrc).join('_');
        for (let i = 0; i < media.length; i++) {
            const m = media[i];
            const { type, ssrc, ssrcGroups, payloadTypes, rtpExtensions } = m;
            switch (type) {
                case 'audio': {
                    sdp += `
m=audio 9 UDP/TLS/RTP/SAVPF ${payloadTypes.map(x => x.id).join(' ')}
c=IN IP4 0.0.0.0
a=mid:${i}
a=sendrecv`;
                    sdp += addExtmap(rtpExtensions);
                    sdp += `
a=rtcp-mux`;
                    sdp += addPayloadTypes(payloadTypes);
                    sdp += addSsrc(type, ssrc, ssrcGroups, streamName);

                    break;
                }
                case 'video': {
                    sdp += `
m=video 9 UDP/TLS/RTP/SAVPF ${payloadTypes.map(x => x.id).join(' ')}
c=IN IP4 0.0.0.0
a=mid:${i}
a=sendrecv`;
                    sdp += addExtmap(rtpExtensions);
                    sdp += `
a=rtcp-mux
a=rtcp-rsize`;
                    sdp += addPayloadTypes(payloadTypes);
                    sdp += addSsrc(type, ssrc, ssrcGroups, streamName);

                    break;
                }
            }
        }
        sdp += addDataChannel(2);
        sdp += `
`;

        return sdp;
    }

    static generateAnswer(info) {
        const { fingerprints, ufrag, pwd, audio, video } = info;
        audio.type = 'audio';
        video.type = 'video';
        const media = [audio, video];

        let sdp = `v=0
o=- 1 0 IN IP4 0.0.0.0
s=-
t=0 0`;
        if (fingerprints) {
            fingerprints.forEach(x => {
                const { hash, fingerprint, setup } = x;
                sdp += `
a=fingerprint:${hash} ${fingerprint}
a=setup:${setup}`;
            });
        }
        if (ufrag && pwd) {
            sdp += `
a=ice-ufrag:${ufrag}
a=ice-pwd:${pwd}`;
        }

        sdp += `
a=group:BUNDLE 0 1 2
a=ice-options:trickle
a=msid-semantic:WMS *`;
        const streamName = 'stream' + media.map(x => x.ssrc).join('_');
        for (let i = 0; i < media.length; i++) {
            const m = media[i];
            const { type, mid, ssrc, ssrcGroups, payloadTypes, dir, rtpExtensions } = m;
            switch (type) {
                case 'audio': {
                    sdp += `
m=audio 9 UDP/TLS/RTP/SAVPF ${payloadTypes.map(x => x.id).join(' ')}
c=IN IP4 0.0.0.0
a=mid:${i}
a=sendrecv`;
                    sdp += addExtmap(rtpExtensions);
                    sdp += `
a=rtcp-mux`;
                    sdp += addPayloadTypes(payloadTypes);
                    sdp += addSsrc(type, ssrc, ssrcGroups, streamName);

                    break;
                }
                case 'video': {
                    sdp += `
m=video 9 UDP/TLS/RTP/SAVPF ${payloadTypes.map(x => x.id).join(' ')}
c=IN IP4 0.0.0.0
a=mid:${i}
a=sendrecv`;
                    sdp += addExtmap(rtpExtensions);
                    sdp += `
a=rtcp-mux
a=rtcp-rsize`;
                    sdp += addPayloadTypes(payloadTypes);
                    sdp += addSsrc(type, ssrc, ssrcGroups, streamName);
                    break;
                }
            }
        }
        sdp += addDataChannel(2);
        sdp += `
`;

        return sdp;
    }
}