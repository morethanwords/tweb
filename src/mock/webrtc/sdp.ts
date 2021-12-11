const sdp = `v=0\r
o=- 4396055952786825640 4 IN IP4 127.0.0.1\r
s=-\r
t=0 0\r
a=group:BUNDLE 0 1 2 3 4\r
a=extmap-allow-mixed\r
a=msid-semantic: WMS r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD\r
m=audio 52133 UDP/TLS/RTP/SAVPF 111 126 63 127 125 9 0 8 106 124 13 110 112 113\r
c=IN IP4 192.168.92.78\r
a=rtcp:9 IN IP4 0.0.0.0\r
a=candidate:1160438246 1 udp 2122260223 192.168.92.78 52133 typ host generation 0 network-id 1 network-cost 10\r
a=candidate:195632406 1 tcp 1518280447 192.168.92.78 9 typ host tcptype active generation 0 network-id 1 network-cost 10\r
a=ice-ufrag:Jpbd\r
a=ice-pwd:Fus4hRjMrpP46HRkXRz+RPdL\r
a=ice-options:trickle\r
a=fingerprint:sha-256 04:B3:84:B1:04:0A:C8:1B:1B:04:11:51:67:88:D1:FC:E1:A2:83:8A:E2:58:CC:A2:F0:09:31:3E:39:BF:76:B3\r
a=setup:actpass\r
a=mid:0\r
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r
a=extmap:3 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r
a=extmap:4 urn:ietf:params:rtp-hdrext:sdes:mid\r
a=extmap:5 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r
a=extmap:6 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r
a=sendonly\r
a=msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD bc9d76ef-21f8-44b7-81ac-dfd096c2f1fe\r
a=rtcp-mux\r
a=rtpmap:111 opus/48000/2\r
a=rtcp-fb:111 transport-cc\r
a=fmtp:111 minptime=10;useinbandfec=1\r
a=rtpmap:126 telephone-event/8000\r
a=rtpmap:63 red/48000/2\r
a=fmtp:63 111/111\r
a=rtpmap:127 ISAC/16000\r
a=rtpmap:125 ISAC/32000\r
a=rtpmap:9 G722/8000\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:106 CN/32000\r
a=rtpmap:124 CN/16000\r
a=rtpmap:13 CN/8000\r
a=rtpmap:110 telephone-event/48000\r
a=rtpmap:112 telephone-event/32000\r
a=rtpmap:113 telephone-event/16000\r
a=ssrc:4048541358 cname:UOXLvCjgl4OlGU+h\r
a=ssrc:4048541358 msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD bc9d76ef-21f8-44b7-81ac-dfd096c2f1fe\r
a=ssrc:4048541358 mslabel:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD\r
a=ssrc:4048541358 label:bc9d76ef-21f8-44b7-81ac-dfd096c2f1fe\r
m=video 9 UDP/TLS/RTP/SAVPF 100 101 102 103 104 105 123 115 122 114 121 109 120 107 35 36 119 108 118 99 98 97 116\r
c=IN IP4 0.0.0.0\r
a=rtcp:9 IN IP4 0.0.0.0\r
a=ice-ufrag:Jpbd\r
a=ice-pwd:Fus4hRjMrpP46HRkXRz+RPdL\r
a=ice-options:trickle\r
a=fingerprint:sha-256 04:B3:84:B1:04:0A:C8:1B:1B:04:11:51:67:88:D1:FC:E1:A2:83:8A:E2:58:CC:A2:F0:09:31:3E:39:BF:76:B3\r
a=setup:actpass\r
a=mid:1\r
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r
a=extmap:13 urn:3gpp:video-orientation\r
a=extmap:3 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r
a=extmap:14 urn:ietf:params:rtp-hdrext:toffset\r
a=extmap:12 http://www.webrtc.org/experiments/rtp-hdrext/playout-delay\r
a=extmap:11 http://www.webrtc.org/experiments/rtp-hdrext/video-content-type\r
a=extmap:7 http://www.webrtc.org/experiments/rtp-hdrext/video-timing\r
a=extmap:8 http://www.webrtc.org/experiments/rtp-hdrext/color-space\r
a=extmap:4 urn:ietf:params:rtp-hdrext:sdes:mid\r
a=extmap:5 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r
a=extmap:6 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r
a=sendonly\r
a=msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD 9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=rtcp-mux\r
a=rtcp-rsize\r
a=rtpmap:100 VP8/90000\r
a=rtcp-fb:100 goog-remb\r
a=rtcp-fb:100 transport-cc\r
a=rtcp-fb:100 nack\r
a=rtpmap:101 rtx/90000\r
a=fmtp:101 apt=100\r
a=rtpmap:102 VP9/90000\r
a=rtcp-fb:102 goog-remb\r
a=rtcp-fb:102 transport-cc\r
a=rtcp-fb:102 nack\r
a=fmtp:102 profile-id=0\r
a=rtpmap:103 rtx/90000\r
a=fmtp:103 apt=102\r
a=rtpmap:104 H264/90000\r
a=rtcp-fb:104 goog-remb\r
a=rtcp-fb:104 transport-cc\r
a=rtcp-fb:104 nack\r
a=fmtp:104 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f\r
a=rtpmap:105 rtx/90000\r
a=fmtp:105 apt=104\r
a=rtpmap:123 VP9/90000\r
a=rtcp-fb:123 goog-remb\r
a=rtcp-fb:123 transport-cc\r
a=rtcp-fb:123 ccm fir\r
a=rtcp-fb:123 nack\r
a=rtcp-fb:123 nack pli\r
a=fmtp:123 profile-id=2\r
a=rtpmap:115 rtx/90000\r
a=fmtp:115 apt=123\r
a=rtpmap:122 H264/90000\r
a=rtcp-fb:122 goog-remb\r
a=rtcp-fb:122 transport-cc\r
a=rtcp-fb:122 ccm fir\r
a=rtcp-fb:122 nack\r
a=rtcp-fb:122 nack pli\r
a=fmtp:122 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f\r
a=rtpmap:114 rtx/90000\r
a=fmtp:114 apt=122\r
a=rtpmap:121 H264/90000\r
a=rtcp-fb:121 goog-remb\r
a=rtcp-fb:121 transport-cc\r
a=rtcp-fb:121 ccm fir\r
a=rtcp-fb:121 nack\r
a=rtcp-fb:121 nack pli\r
a=fmtp:121 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f\r
a=rtpmap:109 rtx/90000\r
a=fmtp:109 apt=121\r
a=rtpmap:120 H264/90000\r
a=rtcp-fb:120 goog-remb\r
a=rtcp-fb:120 transport-cc\r
a=rtcp-fb:120 ccm fir\r
a=rtcp-fb:120 nack\r
a=rtcp-fb:120 nack pli\r
a=fmtp:120 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r
a=rtpmap:107 rtx/90000\r
a=fmtp:107 apt=120\r
a=rtpmap:35 AV1/90000\r
a=rtcp-fb:35 goog-remb\r
a=rtcp-fb:35 transport-cc\r
a=rtcp-fb:35 ccm fir\r
a=rtcp-fb:35 nack\r
a=rtcp-fb:35 nack pli\r
a=rtpmap:36 rtx/90000\r
a=fmtp:36 apt=35\r
a=rtpmap:119 H264/90000\r
a=rtcp-fb:119 goog-remb\r
a=rtcp-fb:119 transport-cc\r
a=rtcp-fb:119 ccm fir\r
a=rtcp-fb:119 nack\r
a=rtcp-fb:119 nack pli\r
a=fmtp:119 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=4d0032\r
a=rtpmap:108 rtx/90000\r
a=fmtp:108 apt=119\r
a=rtpmap:118 H264/90000\r
a=rtcp-fb:118 goog-remb\r
a=rtcp-fb:118 transport-cc\r
a=rtcp-fb:118 ccm fir\r
a=rtcp-fb:118 nack\r
a=rtcp-fb:118 nack pli\r
a=fmtp:118 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640032\r
a=rtpmap:99 rtx/90000\r
a=fmtp:99 apt=118\r
a=rtpmap:98 red/90000\r
a=rtpmap:97 rtx/90000\r
a=fmtp:97 apt=98\r
a=rtpmap:116 ulpfec/90000\r
a=ssrc-group:FID 1017728011 1258359703\r
a=ssrc-group:SIM 1017728011 2260225769 943422434\r
a=ssrc-group:FID 2260225769 3236869373\r
a=ssrc-group:FID 943422434 2658954446\r
a=ssrc:1017728011 cname:UOXLvCjgl4OlGU+h\r
a=ssrc:1017728011 msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD 9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:1017728011 mslabel:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD\r
a=ssrc:1017728011 label:9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:1258359703 cname:UOXLvCjgl4OlGU+h\r
a=ssrc:1258359703 msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD 9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:1258359703 mslabel:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD\r
a=ssrc:1258359703 label:9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:2260225769 cname:UOXLvCjgl4OlGU+h\r
a=ssrc:2260225769 msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD 9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:2260225769 mslabel:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD\r
a=ssrc:2260225769 label:9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:3236869373 cname:UOXLvCjgl4OlGU+h\r
a=ssrc:3236869373 msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD 9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:3236869373 mslabel:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD\r
a=ssrc:3236869373 label:9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:943422434 cname:UOXLvCjgl4OlGU+h\r
a=ssrc:943422434 msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD 9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:943422434 mslabel:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD\r
a=ssrc:943422434 label:9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:2658954446 cname:UOXLvCjgl4OlGU+h\r
a=ssrc:2658954446 msid:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD 9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
a=ssrc:2658954446 mslabel:r87hndGyheuxZxzoUgzDkwgPWKOFXQzv1NvD\r
a=ssrc:2658954446 label:9b69248a-65fa-46a8-9795-8fb2cd6e6b3a\r
m=audio 9 UDP/TLS/RTP/SAVPF 111 126 63 127 125 9 0 8 106 124 13 110 112 113\r
c=IN IP4 0.0.0.0\r
a=rtcp:9 IN IP4 0.0.0.0\r
a=ice-ufrag:Jpbd\r
a=ice-pwd:Fus4hRjMrpP46HRkXRz+RPdL\r
a=ice-options:trickle\r
a=fingerprint:sha-256 04:B3:84:B1:04:0A:C8:1B:1B:04:11:51:67:88:D1:FC:E1:A2:83:8A:E2:58:CC:A2:F0:09:31:3E:39:BF:76:B3\r
a=setup:actpass\r
a=mid:2\r
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r
a=extmap:3 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r
a=extmap:4 urn:ietf:params:rtp-hdrext:sdes:mid\r
a=extmap:5 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r
a=extmap:6 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r
a=recvonly\r
a=rtcp-mux\r
a=rtpmap:111 opus/48000/2\r
a=rtcp-fb:111 transport-cc\r
a=fmtp:111 minptime=10;useinbandfec=1\r
a=rtpmap:126 telephone-event/8000\r
a=rtpmap:63 red/48000/2\r
a=fmtp:63 111/111\r
a=rtpmap:127 ISAC/16000\r
a=rtpmap:125 ISAC/32000\r
a=rtpmap:9 G722/8000\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:106 CN/32000\r
a=rtpmap:124 CN/16000\r
a=rtpmap:13 CN/8000\r
a=rtpmap:110 telephone-event/48000\r
a=rtpmap:112 telephone-event/32000\r
a=rtpmap:113 telephone-event/16000\r
m=video 9 UDP/TLS/RTP/SAVPF 100 101 102 103 104 105 123 115 117 122 114 121 109 120 107 35 36 119 108 118 99 98 97 116 37\r
c=IN IP4 0.0.0.0\r
a=rtcp:9 IN IP4 0.0.0.0\r
a=ice-ufrag:Jpbd\r
a=ice-pwd:Fus4hRjMrpP46HRkXRz+RPdL\r
a=ice-options:trickle\r
a=fingerprint:sha-256 04:B3:84:B1:04:0A:C8:1B:1B:04:11:51:67:88:D1:FC:E1:A2:83:8A:E2:58:CC:A2:F0:09:31:3E:39:BF:76:B3\r
a=setup:actpass\r
a=mid:3\r
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r
a=extmap:13 urn:3gpp:video-orientation\r
a=extmap:3 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r
a=extmap:14 urn:ietf:params:rtp-hdrext:toffset\r
a=extmap:12 http://www.webrtc.org/experiments/rtp-hdrext/playout-delay\r
a=extmap:11 http://www.webrtc.org/experiments/rtp-hdrext/video-content-type\r
a=extmap:7 http://www.webrtc.org/experiments/rtp-hdrext/video-timing\r
a=extmap:8 http://www.webrtc.org/experiments/rtp-hdrext/color-space\r
a=extmap:4 urn:ietf:params:rtp-hdrext:sdes:mid\r
a=extmap:5 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r
a=extmap:6 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r
a=recvonly\r
a=rtcp-mux\r
a=rtcp-rsize\r
a=rtpmap:100 VP8/90000\r
a=rtcp-fb:100 goog-remb\r
a=rtcp-fb:100 transport-cc\r
a=rtcp-fb:100 nack\r
a=rtpmap:101 rtx/90000\r
a=fmtp:101 apt=100\r
a=rtpmap:102 VP9/90000\r
a=rtcp-fb:102 goog-remb\r
a=rtcp-fb:102 transport-cc\r
a=rtcp-fb:102 nack\r
a=fmtp:102 profile-id=0\r
a=rtpmap:103 rtx/90000\r
a=fmtp:103 apt=102\r
a=rtpmap:104 H264/90000\r
a=rtcp-fb:104 goog-remb\r
a=rtcp-fb:104 transport-cc\r
a=rtcp-fb:104 nack\r
a=fmtp:104 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f\r
a=rtpmap:105 rtx/90000\r
a=fmtp:105 apt=104\r
a=rtpmap:123 VP9/90000\r
a=rtcp-fb:123 goog-remb\r
a=rtcp-fb:123 transport-cc\r
a=rtcp-fb:123 ccm fir\r
a=rtcp-fb:123 nack\r
a=rtcp-fb:123 nack pli\r
a=fmtp:123 profile-id=2\r
a=rtpmap:115 rtx/90000\r
a=fmtp:115 apt=123\r
a=rtpmap:117 VP9/90000\r
a=rtcp-fb:117 goog-remb\r
a=rtcp-fb:117 transport-cc\r
a=rtcp-fb:117 ccm fir\r
a=rtcp-fb:117 nack\r
a=rtcp-fb:117 nack pli\r
a=fmtp:117 profile-id=1\r
a=rtpmap:122 H264/90000\r
a=rtcp-fb:122 goog-remb\r
a=rtcp-fb:122 transport-cc\r
a=rtcp-fb:122 ccm fir\r
a=rtcp-fb:122 nack\r
a=rtcp-fb:122 nack pli\r
a=fmtp:122 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f\r
a=rtpmap:114 rtx/90000\r
a=fmtp:114 apt=122\r
a=rtpmap:121 H264/90000\r
a=rtcp-fb:121 goog-remb\r
a=rtcp-fb:121 transport-cc\r
a=rtcp-fb:121 ccm fir\r
a=rtcp-fb:121 nack\r
a=rtcp-fb:121 nack pli\r
a=fmtp:121 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f\r
a=rtpmap:109 rtx/90000\r
a=fmtp:109 apt=121\r
a=rtpmap:120 H264/90000\r
a=rtcp-fb:120 goog-remb\r
a=rtcp-fb:120 transport-cc\r
a=rtcp-fb:120 ccm fir\r
a=rtcp-fb:120 nack\r
a=rtcp-fb:120 nack pli\r
a=fmtp:120 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r
a=rtpmap:107 rtx/90000\r
a=fmtp:107 apt=120\r
a=rtpmap:35 AV1/90000\r
a=rtcp-fb:35 goog-remb\r
a=rtcp-fb:35 transport-cc\r
a=rtcp-fb:35 ccm fir\r
a=rtcp-fb:35 nack\r
a=rtcp-fb:35 nack pli\r
a=rtpmap:36 rtx/90000\r
a=fmtp:36 apt=35\r
a=rtpmap:119 H264/90000\r
a=rtcp-fb:119 goog-remb\r
a=rtcp-fb:119 transport-cc\r
a=rtcp-fb:119 ccm fir\r
a=rtcp-fb:119 nack\r
a=rtcp-fb:119 nack pli\r
a=fmtp:119 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=4d0032\r
a=rtpmap:108 rtx/90000\r
a=fmtp:108 apt=119\r
a=rtpmap:118 H264/90000\r
a=rtcp-fb:118 goog-remb\r
a=rtcp-fb:118 transport-cc\r
a=rtcp-fb:118 ccm fir\r
a=rtcp-fb:118 nack\r
a=rtcp-fb:118 nack pli\r
a=fmtp:118 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640032\r
a=rtpmap:99 rtx/90000\r
a=fmtp:99 apt=118\r
a=rtpmap:98 red/90000\r
a=rtpmap:97 rtx/90000\r
a=fmtp:97 apt=98\r
a=rtpmap:116 ulpfec/90000\r
a=rtpmap:37 flexfec-03/90000\r
a=rtcp-fb:37 goog-remb\r
a=rtcp-fb:37 transport-cc\r
a=fmtp:37 repair-window=10000000\r
m=audio 9 UDP/TLS/RTP/SAVPF 111 63 127 125 9 0 8 106 124 13 110 112 113 126\r
c=IN IP4 0.0.0.0\r
a=rtcp:9 IN IP4 0.0.0.0\r
a=ice-ufrag:Jpbd\r
a=ice-pwd:Fus4hRjMrpP46HRkXRz+RPdL\r
a=ice-options:trickle\r
a=fingerprint:sha-256 04:B3:84:B1:04:0A:C8:1B:1B:04:11:51:67:88:D1:FC:E1:A2:83:8A:E2:58:CC:A2:F0:09:31:3E:39:BF:76:B3\r
a=setup:actpass\r
a=mid:4\r
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r
a=extmap:3 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r
a=extmap:4 urn:ietf:params:rtp-hdrext:sdes:mid\r
a=extmap:5 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r
a=extmap:6 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r
a=recvonly\r
a=rtcp-mux\r
a=rtpmap:111 opus/48000/2\r
a=rtcp-fb:111 transport-cc\r
a=fmtp:111 minptime=10;useinbandfec=1\r
a=rtpmap:63 red/48000/2\r
a=fmtp:63 111/111\r
a=rtpmap:127 ISAC/16000\r
a=rtpmap:125 ISAC/32000\r
a=rtpmap:9 G722/8000\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:106 CN/32000\r
a=rtpmap:124 CN/16000\r
a=rtpmap:13 CN/8000\r
a=rtpmap:110 telephone-event/48000\r
a=rtpmap:112 telephone-event/32000\r
a=rtpmap:113 telephone-event/16000\r
a=rtpmap:126 telephone-event/8000\r
`;

export default sdp;
