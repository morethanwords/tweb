/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import CallConnectionInstanceBase, {CallConnectionInstanceOptions} from './callConnectionInstanceBase';
import CallInstance from './callInstance';
import parseSignalingData from './helpers/parseSignalingData';
import {parseSdp} from './sdp/utils';

export default class CallConnectionInstance extends CallConnectionInstanceBase {
  private call: CallInstance;

  constructor(options: CallConnectionInstanceOptions & {
    call: CallConnectionInstance['call']
  }) {
    super(options);
  }

  protected async negotiateInternal() {
    const {connection, call} = this;

    if(!connection.localDescription && !connection.remoteDescription && !call.isOutgoing) {
      return;
    }

    let descriptionInit: RTCSessionDescriptionInit;
    if(call.offerReceived) {
      call.offerReceived = false;

      const answer = descriptionInit = await connection.createAnswer();

      this.log('[sdp] local', answer.type, answer.sdp);
      await connection.setLocalDescription(answer);

      this.log('[InitialSetup] send 2');
    } else {
      const offer = descriptionInit = await connection.createOffer();

      this.log('[sdp] local', offer.sdp);
      await connection.setLocalDescription(offer);

      call.offerSent = true;

      this.log('[InitialSetup] send 0');
    }

    const initialSetup = parseSignalingData(parseSdp(descriptionInit.sdp));
    call.sendCallSignalingData(initialSetup);
  }
}
