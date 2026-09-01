import {describe, expect, it} from 'vitest';
import {findGroupCallChainUpdate} from '@lib/calls/helpers/groupCallUpdates';
import type {InputGroupCall, Updates} from '@layer';

const call: InputGroupCall.inputGroupCall = {
  _: 'inputGroupCall',
  id: '10',
  access_hash: '20'
};

function updateShort(
  updateCall: InputGroupCall.inputGroupCall = call,
  subChainId = 0
): Updates.updateShort {
  return {
    _: 'updateShort',
    update: {
      _: 'updateGroupCallChainBlocks',
      call: updateCall,
      sub_chain_id: subChainId,
      blocks: [new Uint8Array([1])],
      next_offset: 1
    },
    date: 0
  };
}

describe('findGroupCallChainUpdate', () => {
  it('matches an updateShort by both subchain and canonical call identity', () => {
    expect(findGroupCallChainUpdate(updateShort(), 0, call)).toMatchObject({
      _: 'updateGroupCallChainBlocks',
      sub_chain_id: 0,
      call
    });
    expect(findGroupCallChainUpdate(updateShort(call, 1), 0, call)).toBeUndefined();
    expect(findGroupCallChainUpdate(updateShort({
      _: 'inputGroupCall',
      id: '11',
      access_hash: '21'
    }), 0, call)).toBeUndefined();
  });

  it('requires and validates the preview identity for slug authorization', () => {
    const slug: InputGroupCall.inputGroupCallSlug = {_: 'inputGroupCallSlug', slug: 'invite'};
    expect(findGroupCallChainUpdate(updateShort(), 0, slug)).toBeUndefined();
    expect(findGroupCallChainUpdate(updateShort(), 0, slug, call)).toBeDefined();
  });
});
