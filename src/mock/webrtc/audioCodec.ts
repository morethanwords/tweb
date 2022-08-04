import {AudioCodec} from '../../lib/calls/types';

const audioCodec: AudioCodec = {
  'payload-types': [
    {
      'id': 111,
      'name': 'opus',
      'clockrate': 48000,
      'channels': 2,
      'parameters': {
        'minptime': 10,
        'useinbandfec': 1
      },
      'rtcp-fbs': [
        {
          'type': 'transport-cc'
        }
      ]
    },
    {
      'id': 126,
      'name': 'telephone-event',
      'clockrate': 8000,
      'channels': 1
    }
  ],
  'rtp-hdrexts': [
    {
      'id': 1,
      'uri': 'urn:ietf:params:rtp-hdrext:ssrc-audio-level'
    },
    {
      'id': 2,
      'uri': 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time'
    },
    {
      'id': 3,
      'uri': 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01'
    }
  ]
};

export default audioCodec;
