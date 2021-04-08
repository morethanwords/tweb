/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// @ts-ignore
export const isTouchSupported = ('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch)/*  || true */;