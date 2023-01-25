/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {log, serviceMessagePort} from './index.service';

const deferred: {[id: string]: ShareData[]} = {};

function parseFormData(formData: FormData): ShareData {
  return {
    files: formData.getAll('files') as File[],
    title: formData.get('title') as string,
    text: formData.get('text') as string,
    url: formData.get('url') as string
  };
}

async function processShareEvent(formData: FormData, clientId: string) {
  try {
    log('share data', formData);
    const data = parseFormData(formData);
    (deferred[clientId] ??= []).push(data);
  } catch(err) {
    log.warn('something wrong with the data', err);
  }
};

export function checkWindowClientForDeferredShare(windowClient: WindowClient) {
  const arr = deferred[windowClient.id];
  if(!arr) {
    return;
  }

  delete deferred[windowClient.id];

  log('releasing share events to client:', windowClient.id, 'length:', arr.length);
  arr.forEach((data) => {
    serviceMessagePort.invokeVoid('share', data, windowClient);
  });
}

export default function onShareFetch(event: FetchEvent, params: string) {
  const promise = event.request.formData()
  .then((formData) => {
    processShareEvent(formData, event.resultingClientId)
    return Response.redirect('..');
  });

  event.respondWith(promise);
}
