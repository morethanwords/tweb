/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

enum GROUP_CALL_STATE {
  UNMUTED,
  MUTED,
  MUTED_BY_ADMIN,
  CONNECTING,
  CLOSED
}

export default GROUP_CALL_STATE;
