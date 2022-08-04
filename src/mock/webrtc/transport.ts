import {UpdateGroupCallConnectionData} from '../../lib/calls/types';

const transport: UpdateGroupCallConnectionData['transport'] = {
  'candidates': [
    {
      'generation': '0',
      'component': '1',
      'protocol': 'udp',
      'port': '32000',
      'ip': '2001:67c:4e8:f102:6:0:285:207',
      'foundation': '1',
      'id': '26a502bbbaff65703414015c',
      'priority': '2130706431',
      'type': 'host',
      'network': '0'
    },
    {
      'generation': '0',
      'component': '1',
      'protocol': 'udp',
      'port': '32000',
      'ip': '91.108.9.103',
      'foundation': '2',
      'id': '2b603f7dbaff65706a0c113e',
      'priority': '2130706431',
      'type': 'host',
      'network': '0'
    }
  ],
  'xmlns': 'urn:xmpp:jingle:transports:ice-udp:1',
  'ufrag': 'bvr6j1fkri6020',
  'rtcp-mux': true,
  'pwd': '1k7vls8kb2tr4eu093jkalphcq',
  'fingerprints': [
    {
      'fingerprint': '9A:18:A4:DF:6A:11:EA:E5:BF:E3:8A:18:E7:69:3D:7B:42:D8:9D:32:2F:57:7B:3D:6E:09:6C:A7:45:D7:78:0D',
      'setup': 'passive',
      'hash': 'sha-256'
    }
  ]
};

export default transport;
