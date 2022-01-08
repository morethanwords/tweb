/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

enum CALL_STATE {
  CONNECTED,
  CONNECTING,
  EXCHANGING_KEYS,
  PENDING,
  REQUESTING,
  CLOSING,
  CLOSED
}

export default CALL_STATE;
