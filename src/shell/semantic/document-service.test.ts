import {describe, expect, it, vi} from 'vitest';
import {createFixture} from '../core/fixture';
import type {DocumentCommand} from '../core/types';
import {DocumentService} from './document-service';
import {OperationRegistry} from './registry';
import {bytes, DomainError, hash, SemanticLimits} from './common';
import {createSemanticApp} from './app';
import {createBlogSuite} from './fixtures';

function setup() {
  const document=createFixture(),principal={id:'owner',botIds:[document.id],scopes:['bot:read','draft:write']};
  const registry=new OperationRegistry('epoch',()=>0);
  const service=new DocumentService('epoch',document,{id:'empty',version:1,cases:[]},'build',()=>0,registry);
  const operation=registry.claim(principal,document.id,'prepare','key',{}).operation;
  return {document,principal,registry,service,operation};
}
function folders():DocumentCommand[] {
  return Array.from({length:46},(_,index)=>{
    const id=(prefix:string)=>'$'+`${prefix}_${index}_`.padEnd(64,'x');
    return {type:'add_folder',title:'Folder',folderId:id('folder'),stepId:id('screen'),messageId:id('message'),fallbackStepId:id('fallback'),fallbackMessageId:id('fbmsg'),rowId:id('row'),buttonId:id('button')};
  });
}

describe('bounded document contracts',()=>{
  it('paginates every generated identity and diff with explicit coverage',()=>{
    const {service,operation,principal}=setup();
    const change=service.prepare(service.revision,folders(),principal,operation);
    const identities:Record<string,string>={},refs=new Set<string>();let offset:number|null=0;
    while(offset!==null) {
      const page=service.describe(change,offset) as {idMap:Record<string,string>;diff:{ref:unknown}[];coverage:{nextOffset:number|null;collections:{idMap:{total:number}}}};
      expect(bytes(page)).toBeLessThanOrEqual(24*1024);
      Object.assign(identities,page.idMap);page.diff.forEach(item=>refs.add(JSON.stringify(item.ref)));
      expect(page.coverage.collections.idMap.total).toBe(Object.keys(change.idMap).length);
      offset=page.coverage.nextOffset;
    }
    expect(identities).toEqual(change.idMap);expect(refs.size).toBe(change.diff.length);
  });
  it('labels long content as incomplete without putting it in the compact response',()=>{
    const {service,operation,principal}=setup();
    const change=service.prepare(service.revision,[{type:'set_message_text',stepId:'start',messageId:'start-message',text:'界'.repeat(30000)}],principal,operation);
    const page=service.describe(change) as {diff:{label:string;labelTruncated:boolean}[];coverage:{complete:boolean}};
    expect(bytes(page)).toBeLessThan(4096);expect(page.diff[0].label).toHaveLength(80);expect(page.diff[0].labelTruncated).toBe(true);expect(page.coverage.complete).toBe(false);
  });
  it('rejects an oversized manual receipt before changing the authoritative document',()=>{
    const {service,operation,principal,document}=setup();
    expect(()=>service.manual(service.revision,folders(),principal,operation)).toThrow('OUTPUT_LIMIT');
    expect(service.document).toEqual(document);expect(service.revisionNumber).toBe(0);expect(operation.status).toBe('pending');
  });
  it('keeps context available for long titles and explicitly omits a large fixture',async()=>{
    const document=createFixture();Object.values(document.content.steps).forEach(step=>{step.title='界'.repeat(30000);});
    const suite=createBlogSuite();suite.cases[0].given.variables['run.result']='x'.repeat(10000);
    const app=createSemanticApp({document,suite,engineBuild:'build',executeCode:async()=>({ok:true,outcome:'done',data:null}),validateCode:async()=>({valid:true,infrastructure:false,diagnostics:[]})});
    const response=await app.handle('bot_context',{},app.principal,new AbortController().signal) as {ok:boolean;data:{screens:{labelTruncated:boolean}[];fixtures:{contentComplete:boolean;given?:unknown}[]}};
    expect(response.ok).toBe(true);expect(bytes(response)).toBeLessThan(SemanticLimits.responseBytes);
    expect(response.data.screens.every(screen=>screen.labelTruncated)).toBe(true);
    expect(response.data.fixtures[0].contentComplete).toBe(false);expect(response.data.fixtures[0].given).toBeUndefined();
  });
  it('runs the actual response guard before changing the document or recording success',()=>{
    const {document,registry,principal,operation}=setup();
    const service=new DocumentService('epoch',document,{id:'empty',version:1,cases:[]},'build',()=>0,registry,()=>{},()=>{throw new Error('Broken public output schema');});
    expect(()=>service.manual(service.revision,[{type:'set_step_title',stepId:'start',title:'Changed'}],principal,operation)).toThrow('Broken public output schema');
    expect(service.document).toEqual(document);expect(service.revisionNumber).toBe(0);expect(operation.status).toBe('pending');
  });
  it('distinguishes handles from a previous server instance from a concurrent revision',()=>{
    const {service,principal,operation}=setup();
    expect(()=>service.prepare('old:revision:0',[{type:'set_entry',stepId:'start'}],principal,operation)).toThrow('INSTANCE_EXPIRED');
    expect(()=>service.manual('old:revision:0',[{type:'set_entry',stepId:'start'}],principal,operation)).toThrow('INSTANCE_EXPIRED');
    expect(()=>service.undo('old:revision:0',principal,operation)).toThrow('INSTANCE_EXPIRED');
    expect(()=>service.manual('epoch:revision:9',[{type:'set_entry',stepId:'start'}],principal,operation)).toThrow('REVISION_CONFLICT');
  });
  it('charges distinct retained revision objects even when their content hashes repeat',()=>{
    const {service,principal,registry}=setup();
    for(let index=0;index<24;index++) {
      const operation=registry.claim(principal,service.document.id,'manual',String(index),{}).operation;
      service.manual(service.revision,[{type:'set_step_title',stepId:'start',title:index%2?'A':'B'}],principal,operation);
    }
    const before=service.retainedBytes();
    const prior=service.document;
    const operation=registry.claim(principal,service.document.id,'manual','next',{}).operation;
    service.manual(service.revision,[{type:'set_step_title',stepId:'start',title:'B'}],principal,operation);
    expect(service.document).not.toBe(prior);
    // History is already capped and titles have equal length; this growth is the
    // newly retained revision, not a new content hash or an expanding undo stack.
    expect(service.retainedBytes()-before).toBeGreaterThanOrEqual(bytes(service.document));
  });
  it('rejects certificate growth before mutating an existing prepared candidate',()=>{
    const {document,principal,registry,operation}=setup(),capacity=vi.fn();
    const service=new DocumentService('epoch',document,createBlogSuite(),'build',()=>0,registry,capacity);
    const change=service.prepare(service.revision,[{type:'set_step_title',stepId:'start',title:'Prepared'}],principal,operation);
    const required=change.contract.suite.cases[0];
    capacity.mockImplementation(()=>{throw new DomainError('RESOURCE_LIMIT');});
    const certificate={caseId:required.id,caseDefinitionHash:hash(required),origin:'required_suite' as const,candidateHash:change.candidateHash,testContractHash:change.contract.hash,
      outcome:'passed' as const,complete:true,title:required.title,stepsApplied:1,attemptedStepCount:1,resultHash:'hash',expiresAt:1000,runId:'epoch:run:1',reportId:'epoch:report:1',runVersion:1,error:null};
    expect(()=>service.certificate(change,certificate)).toThrow('RESOURCE_LIMIT');
    expect(change.certificates).toEqual({});
  });
  it('reserves validation diagnostics before changing candidate readiness',()=>{
    const {document,principal,registry,operation}=setup(),capacity=vi.fn();
    const service=new DocumentService('epoch',document,createBlogSuite(),'build',()=>0,registry,capacity);
    const change=service.prepare(service.revision,[{type:'set_step_title',stepId:'start',title:'Prepared'}],principal,operation),before=structuredClone(change.diagnostics);
    capacity.mockImplementation(()=>{throw new DomainError('RESOURCE_LIMIT');});
    expect(()=>service.completeValidation(change,{valid:true,diagnostics:[{message:'New diagnostic'}]})).toThrow('RESOURCE_LIMIT');
    expect(change.diagnostics).toEqual(before);expect(change.validationComplete).toBe(false);
  });
  it('reserves document and receipt growth together before the document CAS',()=>{
    const {document,principal}=setup();
    let limit=Infinity,service:DocumentService;
    const capacity=(extra:number)=>{if(service.retainedBytes()+registry.retainedBytes()+extra>limit)throw new DomainError('RESOURCE_LIMIT');};
    const registry=new OperationRegistry('epoch',()=>0,capacity);
    service=new DocumentService('epoch',document,{id:'empty',version:1,cases:[]},'build',()=>0,registry,capacity);
    const operation=registry.claim(principal,document.id,'manual','tight-budget',{}).operation;
    // Room for the new document and undo copy, but not also its success receipt.
    limit=service.retainedBytes()+registry.retainedBytes()+bytes(document)*2+100;
    expect(()=>service.manual(service.revision,[{type:'set_step_title',stepId:'start',title:document.content.steps.start.title+'!'}],principal,operation)).toThrow('RESOURCE_LIMIT');
    expect(service.revisionNumber).toBe(0);expect(service.document).toEqual(document);expect(operation.status).toBe('pending');
  });
});
