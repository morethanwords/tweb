/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */


/**
 * Legacy Webogram's format, don't change dcID to camelCase. date is timestamp
 */
export type UserAuth = {dcID: number | string, date: number, id: PeerId};

export const NULL_PEER_ID: PeerId = 0;
export const REPLIES_PEER_ID: PeerId = 1271266957;
export const REPLIES_HIDDEN_PEER_ID: PeerId = 777;
export const SERVICE_PEER_ID: PeerId = 777000;
export const MUTE_UNTIL = 0x7FFFFFFF;
export const BOT_START_PARAM = '';
