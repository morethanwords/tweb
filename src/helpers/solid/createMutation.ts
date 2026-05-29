import noop from '@helpers/noop';
import {createMemo, createSignal} from 'solid-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

export interface MutationOptions<TData, TError, TVariables> {
  /** Called before the mutation function fires. Useful for optimistic updates. */
  onMutate?: (variables: TVariables) => void | Promise<void>;
  /** Called when the mutation resolves successfully. */
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  /** Called when the mutation throws. */
  onError?: (error: TError, variables: TVariables) => void | Promise<void>;
  /** Always called after success or error. */
  onSettled?: (
    data: TData | undefined,
    error: TError | undefined,
    variables: TVariables
  ) => void | Promise<void>;
}

export interface MutationResult<TData, TError, TVariables> {
  /** Fire-and-forget — errors are captured in state, not thrown. */
  mutate: (variables: TVariables) => void;
  /** Returns a promise — errors are both captured in state AND re-thrown. */
  mutateAsync: (variables: TVariables) => Promise<TData>;
  /** Resets all state back to idle. */
  reset: () => void;

  // — Reactive accessors —
  data: () => TData | undefined;
  error: () => TError | undefined;
  status: () => MutationStatus;
  isPending: () => boolean;
  isSuccess: () => boolean;
  isError: () => boolean;
  isIdle: () => boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function createMutation<TData, TError = Error, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: MutationOptions<TData, TError, TVariables> = {}
): MutationResult<TData, TError, TVariables> {
  const [status, setStatus] = createSignal<MutationStatus>('idle');
  // Wrap in `() =>` setter form so SolidJS never treats a function-typed
  // TData as a signal updater.
  const [data, setData] = createSignal<TData | undefined>(undefined);
  const [error, setError] = createSignal<TError | undefined>(undefined);

  // Derived memos — reactive without extra function calls at the call site.
  const isPending = createMemo(() => status() === 'pending');
  const isSuccess = createMemo(() => status() === 'success');
  const isError = createMemo(() => status() === 'error');
  const isIdle = createMemo(() => status() === 'idle');

  const reset = (): void => {
    setStatus('idle');
    setData(undefined);
    setError(undefined);
  };

  const mutateAsync = async(variables: TVariables): Promise<TData> => {
    setStatus('pending');
    setData(undefined);
    setError(undefined);

    try {
      await options.onMutate?.(variables);

      const result = await mutationFn(variables);

      setData(() => result); // `() =>` prevents functional-value pitfall
      setStatus('success');

      await options.onSuccess?.(result, variables);
      await options.onSettled?.(result, undefined, variables);

      return result;
    } catch(err) {
      const typedError = err as TError;

      setError(() => typedError);
      setStatus('error');

      await options.onError?.(typedError, variables);
      await options.onSettled?.(undefined, typedError, variables);

      throw err; // re-throw so `mutateAsync` callers can handle it too
    }
  };

  const mutate = (variables: TVariables): void => {
    // Swallow the rejection — state already reflects it.
    mutateAsync(variables).catch(noop);
  };

  return {
    mutate,
    mutateAsync,
    reset,
    data,
    error,
    status,
    isPending,
    isSuccess,
    isError,
    isIdle
  };
}
