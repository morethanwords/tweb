/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

String.prototype.toUserId = function() {
  return (+this).toUserId();
};

String.prototype.toChatId = function() {
  return (+this).toChatId();
};

String.prototype.toPeerId = function(isChat?: boolean) {
  return (+this).toPeerId(isChat);
};

String.prototype.isPeerId = function() {
  return /^[\d-]/.test(this.toString());
};

Number.prototype.toUserId = function() {
  return this as any;
};

Number.prototype.toChatId = function() {
  return -this;
};

Number.prototype.toPeerId = function(isChat?: boolean) {
  return isChat === undefined ? this as number : (isChat ? -Math.abs(this as number) : this as number);
};

Number.prototype.isPeerId = function() {
  return true;
};

declare global {
  interface String {
    toUserId(): UserId;
    toChatId(): ChatId;
    toPeerId(isChat?: boolean): PeerId;
    isPeerId(): this is string;
  }

  interface Number {
    toUserId(): UserId;
    toChatId(): ChatId;
    toPeerId(isChat?: boolean): PeerId;
    isPeerId(): this is PeerId;
  }
}

export {};
