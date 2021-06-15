/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * Legacy Webogram's format, don't change dcID to camelCase. date is timestamp
 */
export type UserAuth = {dcID: number | string, date: number, id: number};

export const REPLIES_PEER_ID = 1271266957;
