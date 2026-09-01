import {describe, expect, it, vi} from 'vitest';

vi.mock('@lib/calls/groupCallsController', () => ({
  default: {reserveConferenceTransition: vi.fn()}
}));

import {CallTransitionCoordinator} from '@lib/calls/callTransitionCoordinator';
import deferred from './helpers/deferred';


function makeCoordinator() {
  let reservations = 0;
  const reserve = vi.fn(() => {
    ++reservations;
    let released = false;
    return Promise.resolve(() => {
      if(released) return;
      released = true;
      --reservations;
    });
  });
  const coordinator = new CallTransitionCoordinator(reserve);
  return {coordinator, reserve, reservations: () => reservations};
}

describe('call transition coordinator', () => {
  it.each([
    'P2P callUser',
    'legacy group call',
    'RTMP live stream'
  ])('reserves before the %s transition awaits and holds through completion', async() => {
    const {coordinator, reserve, reservations} = makeCoordinator();
    const pending = deferred();
    let started = false;

    const transition = coordinator.run(async() => {
      started = true;
      await pending.promise;
    });

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reservations()).toBe(1);
    await vi.waitFor(() => expect(started).toBe(true));
    expect(reservations()).toBe(1);

    pending.resolve();
    await transition;
    expect(reservations()).toBe(0);
  });

  it('serializes every transition while reserving queued work immediately', async() => {
    const {coordinator, reservations} = makeCoordinator();
    const created = deferred();
    const joined = deferred();
    let createStarted = false;
    let joinStarted = false;

    const createTransition = coordinator.run(async() => {
      createStarted = true;
      await created.promise;
    });
    const joinTransition = coordinator.run(async() => {
      joinStarted = true;
      await joined.promise;
    });

    expect(reservations()).toBe(2);
    await vi.waitFor(() => expect(createStarted).toBe(true));
    expect(joinStarted).toBe(false);

    created.resolve();
    await createTransition;
    await vi.waitFor(() => expect(joinStarted).toBe(true));
    expect(reservations()).toBe(1);

    joined.resolve();
    await joinTransition;
    expect(reservations()).toBe(0);
  });

  it('releases after an aborted transition', async() => {
    const {coordinator, reservations} = makeCoordinator();
    const error = new Error('transition aborted');

    const transition = coordinator.run(async() => {
      throw error;
    });

    expect(reservations()).toBe(1);
    await expect(transition).rejects.toBe(error);
    expect(reservations()).toBe(0);
  });
});
