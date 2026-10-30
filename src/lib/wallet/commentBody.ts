/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bytesToBase64 from '@helpers/bytes/bytesToBase64';

/**
 * The server hands an encrypted comment out as its bare payload (32 bytes of key mix, a 16-byte message key and
 * the padded text). The engine opens comments in their on-chain form: a bag of cells whose first cell starts with
 * the encrypted-comment opcode 0x2167da4b, chained by one reference per cell, 127 bytes each.
 */

const ENCRYPTED_COMMENT_OPCODE = [0x21, 0x67, 0xda, 0x4b];
const BOC_MAGIC = [0xb5, 0xee, 0x9c, 0x72, 0x01];
const FIRST_CELL_BYTES = 35;
const CELL_BYTES = 127;

export function isValidCommentPayloadSize(size: number) {
  return size >= 64 && size <= 1024 && ((size - 48) % 16) === 0;
}

/**
 * Standard padded base64 of the BoC, or nothing when the payload cannot be an encrypted comment.
 */
export function serverCommentBody(payload: Uint8Array) {
  if(!isValidCommentPayloadSize(payload.length)) {
    return;
  }

  const cells = 1 + Math.floor((payload.length - FIRST_CELL_BYTES + CELL_BYTES - 1) / CELL_BYTES);
  const total = payload.length + 4 + 3 * cells - 1;
  const width = total > 255 ? 2 : 1;
  const out: number[] = [...BOC_MAGIC, width, cells, 1, 0];
  if(width === 2) {
    out.push((total >> 8) & 0xff);
  }

  out.push(total & 0xff, 0);
  for(let cell = 0, offset = 0; cell < cells; ++cell) {
    const first = cell === 0;
    const last = cell + 1 === cells;
    const count = first ? FIRST_CELL_BYTES : Math.min(CELL_BYTES, payload.length - offset);
    out.push(last ? 0 : 1, 2 * (count + (first ? 4 : 0)));
    if(first) {
      out.push(...ENCRYPTED_COMMENT_OPCODE);
    }

    for(let i = 0; i < count; ++i) {
      out.push(payload[offset + i]);
    }

    offset += count;
    if(!last) {
      out.push(cell + 1);
    }
  }

  return bytesToBase64(out);
}

/**
 * A fee counts a body's bits and cells, never what they hold: an encrypted comment of this text is priced by a
 * zero payload of the same size, so no key is needed to quote it.
 */
export function encryptedCommentFeeBody(text: string) {
  const bytes = new TextEncoder().encode(text).length;
  return serverCommentBody(new Uint8Array(48 + ((bytes + 31) & ~15)));
}
