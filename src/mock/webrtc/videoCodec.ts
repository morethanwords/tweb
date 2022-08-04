import {VideoCodec} from '../../lib/calls/types';

const videoCodec: VideoCodec = {
  'endpoint': 'e0e7414dcff430d1',
  'payload-types': [
    {
      'id': 100,
      'name': 'VP8',
      'clockrate': 9000,
      'channels': 1,
      'parameters': {
        'fmtp': 'x-google-start-bitrate=800'
      },
      'rtcp-fbs': [
        {
          'type': 'goog-remb'
        },
        {
          'type': 'transport-cc'
        },
        {
          'type': 'ccm',
          'subtype': 'fir'
        },
        {
          'type': 'nack'
        },
        {
          'type': 'nack',
          'subtype': 'pli'
        }
      ]
    },
    {
      'id': 101,
      'clockrate': 90000,
      'name': 'rtx',
      'parameters': {
        'apt': '100'
      }
    },
    {
      'id': 102,
      'clockrate': 9000,
      'name': 'VP9',
      'parameters': [],
      'rtcp-fbs': [
        {
          'type': 'goog-remb'
        },
        {
          'type': 'transport-cc'
        },
        {
          'type': 'ccm',
          'subtype': 'fir'
        },
        {
          'type': 'nack'
        },
        {
          'type': 'nack',
          'subtype': 'pli'
        }
      ]
    },
    {
      'id': 103,
      'clockrate': 90000,
      'name': 'rtx',
      'parameters': {
        'apt': '102'
      }
    },
    {
      'id': 104,
      'clockrate': 9000,
      'name': 'H264',
      'channels': 1,
      'parameters': [],
      'rtcp-fbs': [
        {
          'type': 'goog-remb'
        },
        {
          'type': 'transport-cc'
        },
        {
          'type': 'ccm',
          'subtype': 'fir'
        },
        {
          'type': 'nack'
        },
        {
          'type': 'nack',
          'subtype': 'pli'
        }
      ]
    },
    {
      'id': 105,
      'clockrate': 90000,
      'name': 'rtx',
      'parameters': {
        'apt': '104'
      }
    }
  ],
  'rtp-hdrexts': [
    {
      'id': 2,
      'uri': 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time'
    },
    {
      'id': 3,
      'uri': 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01'
    },
    {
      'id': 13,
      'uri': 'urn:3gpp:video-orientation'
    }
  ],
  'server_sources': [
    1102101285
  ]
};

export default videoCodec;
