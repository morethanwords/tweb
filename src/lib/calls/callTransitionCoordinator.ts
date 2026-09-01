import groupCallsController from '@lib/calls/groupCallsController';

type ReserveConferenceTransition = () => Promise<() => void>;

export class CallTransitionCoordinator {
  // Same serialized-FIFO idiom as @helpers/createSerializedQueue, kept inline
  // deliberately: the reservation below must be taken EAGERLY — before the
  // previous transition settles — which enqueue() cannot express without
  // leaving the reservation promise unobserved while the queue drains.
  private transitionQueue: Promise<void> = Promise.resolve();

  constructor(
    private reserveConferenceTransition: ReserveConferenceTransition =
      () => groupCallsController.reserveConferenceTransition()
  ) {}

  public run<T>(callback: () => Promise<T>): Promise<T> {
    const previous = this.transitionQueue;
    // Reserve immediately, before waiting for the previous transition. This
    // prevents conference liveness from starting a recovery in the gap while a
    // user-triggered call switch is already queued.
    const reservation = this.reserveConferenceTransition();
    const transition = (async() => {
      let release: () => void;
      try {
        release = await reservation;
      } catch(err) {
        // Preserve FIFO ordering even when acquiring this reservation fails.
        // Otherwise a later transition could overtake the current one.
        await previous;
        throw err;
      }

      try {
        await previous;
        return await callback();
      } finally {
        release();
      }
    })();

    this.transitionQueue = transition.then(
      (): void => undefined,
      (): void => undefined
    );
    return transition;
  }
}

const callTransitionCoordinator = new CallTransitionCoordinator();
export default callTransitionCoordinator;
