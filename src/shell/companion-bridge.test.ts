import {describe, expect, it, vi} from 'vitest';
import {createFixture} from './core/fixture';
import {createController} from './controller';
import type {DocumentCommand} from './core/types';
import {applyOperations} from './semantic/operations';
import {createCompanionBridge, type ConfirmedDocument} from './companion-bridge';

function server() {
  let current: ConfirmedDocument = {document: createFixture(), revision: 'r0', revisionNumber: 0, epoch: 'epoch', verification: null};
  const receipts = new Map<string, unknown>(), requests: {name: string; args: {operations: DocumentCommand[]; requestKey: string; baseRevision: string}}[] = [];
  let failNextResponse = false;
  let heldRead: ((response: Response) => Promise<Response>) | null = null;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  const fetcher: typeof fetch = async (input, init) => {
    if(input === '/api/document') {
      const response = json({ok: true, data: current}), hold = heldRead;
      heldRead = null; return hold ? hold(response) : response;
    }
    const body = JSON.parse(init!.body as string); requests.push(body);
    expect(init!.headers).toMatchObject({'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf'});
    if(receipts.has(body.args.requestKey)) return json(receipts.get(body.args.requestKey));
    if(body.args.baseRevision !== current.revision) return json({ok: false, error: {code: 'REVISION_CONFLICT', message: 'Conflict'}});
    current = {...current, document: applyOperations(current.document, body.args.operations).document, revisionNumber: current.revisionNumber + 1, revision: `r${current.revisionNumber + 1}`};
    const receipt = {ok: true, data: {revision: current.revision, revisionNumber: current.revisionNumber, changed: true}};
    receipts.set(body.args.requestKey, receipt);
    if(failNextResponse) {failNextResponse = false; throw new Error('Response lost after commit');}
    return json(receipt);
  };
  let key = 0;
  const bridge = createCompanionBridge(current, 'csrf', {fetch: fetcher, requestKey: () => `request-${++key}`});
  const controller = createController({companion: bridge, id: prefix => `${prefix}-test-${++key}`});
  return {bridge, controller, requests, current: () => current,
    remote(operations: DocumentCommand[]) {current = {...current, document: applyOperations(current.document, operations).document, revisionNumber: current.revisionNumber + 1, revision: `r${current.revisionNumber + 1}`};},
    holdNextRead() {
      let release!: () => void, started!: () => void;
      const requested = new Promise<void>(resolve => {started = resolve;});
      heldRead = response => new Promise(resolve => {release = () => resolve(response); started();});
      return {requested, release: () => release()};
    },
    loseResponse() {failNextResponse = true;}, dispose() {controller.dispose(); bridge.dispose();}};
}
async function saved(bridge: ReturnType<typeof createCompanionBridge>) {await vi.waitFor(() => {expect(bridge.state().pending).toBe(0); expect(bridge.state().status).toBe('ready');});}

describe('companion document ownership', () => {
  it('propagates MCP-confirmed updates into the existing editor and keeps selection', async () => {
    const s = server(); s.controller.select('offer');
    s.remote([{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Changed via MCP'}]);
    await s.bridge.refresh();
    expect(s.controller.editor().document.content.messages['start-message']).toBe('Changed via MCP');
    expect(s.controller.editor().selectedStepId).toBe('offer');
    expect(s.requests).toHaveLength(0); s.dispose();
  });

  it('sends one finished text operation, never keystrokes, and sequences subsequent revisions', async () => {
    const s = server();
    s.controller.beginText('start', 'start-message'); s.controller.inputText('One'); s.controller.inputText('Two');
    expect(s.requests).toHaveLength(0);
    s.controller.finishText();
    s.controller.renameStep('offer', 'Next title');
    await saved(s.bridge);
    expect(s.requests).toHaveLength(2);
    expect(s.requests[0].args.operations).toEqual([{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Two'}]);
    expect(s.requests.map(request => request.args.baseRevision)).toEqual(['r0', 'r1']);
    expect(s.current().document.content.steps.offer.title).toBe('Next title');
    expect(s.controller.editor().document).toEqual(s.current().document); s.dispose();
  });

  it('never persists abandoned blank messages and emits one positioned creation after text', async () => {
    const s = server();
    s.controller.beginNewMessage('start', 'blank', 'start-message'); s.controller.inputText('   '); s.controller.finishText();
    expect(s.requests).toHaveLength(0); expect(s.controller.editor().document.messages.blank).toBeUndefined();
    s.controller.beginNewMessage('start', 'created', 'start-message'); s.controller.inputText('New message'); s.controller.finishText();
    await saved(s.bridge);
    expect(s.requests[0].args.operations).toEqual([{type: 'add_block', stepId: 'start', afterBlockId: 'start-message', block: {id: 'created', type: 'message', messageId: 'created'}, messageText: 'New message'}]);
    expect(s.current().document.steps.start.blockIds).toEqual(['start-message', 'created']); s.dispose();
  });

  it('preserves unfinished text under a remote conflict until explicit retry', async () => {
    const s = server();
    s.controller.beginText('start', 'start-message'); s.controller.inputText('My draft');
    s.remote([{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'MCP text'}]);
    await s.bridge.refresh();
    expect(s.bridge.state().status).toBe('conflict');
    expect(s.controller.editor().document.content.messages['start-message']).toBe('My draft');
    s.controller.finishText(); expect(s.requests).toHaveLength(0);
    await s.bridge.retry(); await saved(s.bridge);
    expect(s.current().document.content.messages['start-message']).toBe('My draft');
    expect(s.requests[0].args.baseRevision).toBe('r1'); s.dispose();
  });

  it('catches an unseen remote CAS conflict without overwriting the optimistic draft', async () => {
    const s = server();
    s.remote([{type: 'set_step_title', stepId: 'offer', title: 'Remote title'}]);
    s.controller.renameStep('offer', 'My title');
    await vi.waitFor(() => expect(s.bridge.state().status).toBe('conflict'));
    expect(s.controller.editor().document.content.steps.offer.title).toBe('My title');
    await s.bridge.discard();
    expect(s.controller.editor().document.content.steps.offer.title).toBe('Remote title');
    expect(s.bridge.state().pending).toBe(0); s.dispose();
  });

  it('retries a response lost after commit with exactly the original identity and body', async () => {
    const s = server(); s.loseResponse();
    s.controller.renameStep('offer', 'Committed once');
    await vi.waitFor(() => expect(s.bridge.state().status).toBe('offline'));
    await s.bridge.retry(); await saved(s.bridge);
    expect(s.requests).toHaveLength(2); expect(s.requests[1]).toEqual(s.requests[0]);
    expect(s.current().revisionNumber).toBe(1); s.dispose();
  });

  it('holds inspector drafts and rejects a stale retry whose target was deleted', async () => {
    const s = server();
    s.controller.mutate({type: 'add_step', stepId: 'new-screen', messageId: 'new-message', afterStepId: 'start', content: {title: 'New', text: 'New'}});
    await saved(s.bridge);
    s.controller.setCompanionDraftActive(true);
    s.remote([{type: 'delete_step', stepId: 'new-screen'}]); await s.bridge.refresh();
    s.controller.renameStep('new-screen', 'Still typing'); s.controller.setCompanionDraftActive(false);
    await s.bridge.retry();
    expect(s.bridge.state().status).toBe('conflict');
    expect(s.controller.editor().document.content.steps['new-screen'].title).toBe('Still typing');
    expect(s.requests).toHaveLength(1); s.dispose();
  });

  it('does not roll a confirmed revision back when an earlier poll completes late', async () => {
    const document = createFixture();
    const initial: ConfirmedDocument = {document, revision: 'r0', revisionNumber: 0, epoch: 'epoch', verification: null};
    let releasePoll!: (value: Response) => void;
    let firstRead = true;
    const changed = applyOperations(document, [{type: 'set_step_title', stepId: 'start', title: 'Saved'}]).document;
    const fetcher: typeof fetch = async input => {
      if(input === '/api/command') return new Response(JSON.stringify({ok: true, data: {revision: 'r1'}}));
      if(firstRead) {firstRead = false; return new Promise(resolve => {releasePoll = resolve;});}
      return new Response(JSON.stringify({ok: true, data: {...initial, document: changed, revision: 'r1', revisionNumber: 1}}));
    };
    const bridge = createCompanionBridge(initial, 'csrf', {fetch: fetcher});
    const polling = bridge.refresh();
    bridge.change([{type: 'set_step_title', stepId: 'start', title: 'Saved'}]); await saved(bridge);
    releasePoll(new Response(JSON.stringify({ok: true, data: initial}))); await polling;
    expect(bridge.state().confirmed.revision).toBe('r1'); bridge.dispose();
  });

  it('renews an expired local session without changing the mutation identity', async () => {
    const initial: ConfirmedDocument = {document: createFixture(), revision: 'r0', revisionNumber: 0, epoch: 'epoch', verification: null};
    const bodies: unknown[] = [], headers: unknown[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      if(input === '/api/session') return new Response(JSON.stringify({csrfToken: 'renewed'}));
      if(input === '/api/document') return new Response(JSON.stringify({ok: true, data: {...initial, revision: 'r1', revisionNumber: 1}}));
      bodies.push(JSON.parse(init!.body as string)); headers.push(init!.headers);
      return bodies.length === 1 ? new Response(JSON.stringify({error: {code: 'SESSION_REQUIRED'}}), {status: 401}) : new Response(JSON.stringify({ok: true, data: {revision: 'r1'}}));
    };
    const bridge = createCompanionBridge(initial, 'expired', {fetch: fetcher});
    bridge.change([{type: 'set_step_title', stepId: 'start', title: 'Saved'}]); await saved(bridge);
    expect(bodies[0]).toEqual(bodies[1]); expect(headers[1]).toMatchObject({'X-CSRF-Token': 'renewed'}); bridge.dispose();
  });

  it('does not discard a newer draft created while the current document is loading', async () => {
    const s = server();
    s.controller.beginText('start', 'start-message'); s.controller.inputText('First draft');
    s.remote([{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Remote'}]);
    await s.bridge.refresh(); s.controller.finishText();
    const read = s.holdNextRead(), discarding = s.bridge.discard(); await read.requested;
    s.controller.beginText('start', 'start-message'); s.controller.inputText('Newer draft');
    read.release(); await discarding;
    expect(s.bridge.state().status).toBe('conflict');
    expect(s.bridge.state().pending).toBe(1); expect(s.bridge.state().draftActive).toBe(true);
    expect(s.controller.editor().document.content.messages['start-message']).toBe('Newer draft');
    expect(s.bridge.state().confirmed.revision).toBe('r0'); s.dispose();
  });

  it('does not silently rebase a draft started while retry is reading a remote version', async () => {
    const s = server();
    s.remote([{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Remote'}]);
    const read = s.holdNextRead(), retrying = s.bridge.retry(); await read.requested;
    s.controller.beginText('start', 'start-message'); s.controller.inputText('Newer draft');
    read.release(); await retrying;
    expect(s.bridge.state().confirmed.revision).toBe('r0');
    s.controller.finishText();
    await vi.waitFor(() => expect(s.bridge.state().status).toBe('conflict'));
    expect(s.current().document.content.messages['start-message']).toBe('Remote');
    expect(s.controller.editor().document.content.messages['start-message']).toBe('Newer draft'); s.dispose();
  });
});
