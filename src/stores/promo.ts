import {batch, createEffect, createMemo, createResource, createRoot, createSignal, on} from 'solid-js';
import {HelpPromoData} from '../layer';
import rootScope from '../lib/rootScope';
import ctx from '../environment/ctx';

const promoData = createRoot(() => {
  const [promoData, actions] = createResource<HelpPromoData>(() => {
    return rootScope.managers.apiManager.invokeApiSingleProcess({method: 'help.getPromoData'});
  }, {
    initialValue: {_:'help.promoDataEmpty', expires: 0}
  });

  let timeout: number
  createEffect(on(promoData, (promoData) => {
    if(timeout) clearTimeout(timeout);

    timeout = ctx.setTimeout(() => {
      actions.refetch();
    }, promoData.expires * 1000 - Date.now());
  }, {defer: true}));

  return [promoData, actions] as const
})

const [pendingDismissed, setPendingDismissed] = createSignal<string[]>([]);

export const pendingSuggestions = createRoot(() => createMemo(() => {
  const promoData$ = promoData[0]();
  if(promoData$._ !== 'help.promoData') return new Set();
  const set = new Set(promoData$.pending_suggestions);
  for(const dismissed of pendingDismissed()) {
    set.delete(dismissed);
  }
  for(const dismissed of promoData$.dismissed_suggestions) {
    set.delete(dismissed);
  }
  return set;
}));

export function refetchPromoData() {
  return promoData[1].refetch();
}

export function dismissServerSuggestion(suggestion: string) {
  setPendingDismissed((prev) => [...prev, suggestion]);
  rootScope.managers.apiManager.invokeApiSingleProcess({
    method: 'help.dismissSuggestion',
    params: {suggestion, peer: {_: 'inputPeerEmpty'}}
  }).then((result) => {
    if(!result) return

    batch(() => {
      promoData[1].mutate((prev) => {
        if(prev._ === 'help.promoDataEmpty') return prev;
        return {
          ...prev,
          dismissed_suggestions: [...prev.dismissed_suggestions, suggestion]
        }
      })
      setPendingDismissed((prev) => prev.filter((s) => s !== suggestion));
    })
  });
}
