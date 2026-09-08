import {createEditor,replaceDocument,undo as undoEditor} from '../core/editor';
import {validateDocument} from '../core/document';
import type {DocumentCommand,EditorState,ShellDocument} from '../core/types';
import {compileSemantic,semanticDiff} from './compiler';
import {applyOperations} from './operations';
import {hasPositiveAssertion} from './assertions';
import {casesSchema} from './test-schemas';
import {bytes,checkHandle,freeze,handle,hash,requireThat,SemanticLimits} from './common';
import type {CaseResult,Principal,RequiredSuite,Target,TestContract} from './contracts';
import type {Operation,OperationRegistry} from './registry';
import {z} from 'zod';

const handleSchema=z.string().min(1).max(128);
export const documentReceiptSchema=z.strictObject({revision:handleSchema,revisionNumber:z.number().int().min(0),documentHash:z.string().regex(/^[a-f0-9]{64}$/),changed:z.boolean()});
export const manualReceiptSchema=documentReceiptSchema.extend({idMap:z.record(z.string().max(65),z.string().max(64))});
export const applyReceiptSchema=documentReceiptSchema.extend({changeId:handleSchema,candidateHash:z.string().regex(/^[a-f0-9]{64}$/),testContractHash:z.string().regex(/^[a-f0-9]{64}$/)});
function compactDetail(value:unknown):unknown {
  const size=bytes(value);
  return size<=1536?value:{truncated:true,totalBytes:size,preview:JSON.stringify(value).slice(0,256)};
}

export interface PreparedChange {
  id:string;owner:string;baseRevision:string;document:ShellDocument;candidateHash:string;contract:TestContract;
  diff:ReturnType<typeof semanticDiff>;idMap:Record<string,string>;diagnostics:unknown[];certificates:Record<string,CaseResult>;
  createdAt:number;accessedAt:number;validationComplete:boolean;appliedRevision:string|null;
}
export class DocumentService {
  private editor:EditorState;
  private changes=new Map<string,PreparedChange>();
  private revisions=new Map<string,{document:ShellDocument;createdAt:number}>();
  private suite:RequiredSuite;
  constructor(readonly epoch:string,document:ShellDocument,suite:RequiredSuite,readonly engineBuild:string,readonly now:()=>number,private registry:OperationRegistry,private ensureCapacity:(extra:number)=>void=()=>{},
    private readonly checkReceipt:(result:unknown,kind:'apply'|'manual'|'undo')=>void=()=>{}) {
    this.editor=createEditor(document);this.editor.document=freeze(this.editor.document);
    if(suite.cases.length) {casesSchema.parse(suite.cases);requireThat(suite.cases.every(item=>hasPositiveAssertion(item.expect)),'INVALID_REQUIRED_SUITE');}
    this.suite=freeze(structuredClone(suite));this.remember();
  }
  get document():ShellDocument{return this.editor.document;}
  get revision():string{return `${this.epoch}:revision:${this.editor.revision}`;}
  get revisionNumber():number{return this.editor.revision;}
  get requiredSuite():RequiredSuite{return structuredClone(this.suite);}
  authorize(principal:Principal,scope:string):void {requireThat(principal.botIds.includes(this.document.id)&&principal.scopes.includes(scope),'FORBIDDEN');}
  contract():TestContract {
    const data={origin:'required_suite' as const,suite:this.suite,engineBuild:this.engineBuild,fixturePolicy:'explicit-v1' as const};return freeze({...data,hash:hash(data)});
  }
  private remember():void {this.revisions.set(this.revision,{document:this.document,createdAt:this.now()});}
  sweep():void {
    const now=this.now();
    for(const [key,record] of this.changes) if(now-record.accessedAt>=SemanticLimits.idleMs||now-record.createdAt>=SemanticLimits.lifetimeMs)this.changes.delete(key);
    for(const [key,record] of this.revisions)if(key!==this.revision&&now-record.createdAt>=SemanticLimits.lifetimeMs)this.revisions.delete(key);
  }
  retainedBytes():number {
    // Equal content is not shared allocation: every editor revision is detached.
    const docs=new Set<ShellDocument>();let metadata=0;
    for(const [revision,item] of this.revisions){docs.add(item.document);metadata+=bytes({revision,createdAt:item.createdAt});}
    for(const item of this.changes.values()){docs.add(item.document);metadata+=bytes({...item,document:null});}
    return [...docs].reduce((sum,doc)=>sum+bytes(doc),0)+metadata+bytes(this.editor.history)+bytes(this.suite);
  }
  private candidateBytes():number {return [...this.changes.values()].reduce((sum,item)=>sum+bytes(item.document),0);}
  resolve(target:Target,principal:Principal):{document:ShellDocument;contract:TestContract;change:PreparedChange|null} {
    this.authorize(principal,'bot:read');this.sweep();
    if(target.kind==='change'){const change=this.getChange(target.changeId,principal);return {document:change.document,contract:change.contract,change};}
    const revision=target.revision??this.revision;checkHandle(this.epoch,revision);const item=this.revisions.get(revision);requireThat(item,'REVISION_EXPIRED');
    return {document:item.document,contract:this.contract(),change:null};
  }
  getChange(id:string,principal:Principal):PreparedChange {
    checkHandle(this.epoch,id);this.sweep();const item=this.changes.get(id);
    requireThat(item,'CHANGE_EXPIRED');requireThat(item.owner===principal.id&&principal.botIds.includes(item.document.id),'NOT_FOUND');item.accessedAt=this.now();return item;
  }
  prepare(baseRevision:string,operations:DocumentCommand[],principal:Principal,operation:Operation):PreparedChange {
    this.authorize(principal,'draft:write');checkHandle(this.epoch,baseRevision);requireThat(baseRevision===this.revision,'REVISION_CONFLICT');
    const built=applyOperations(this.document,operations,placeholder=>'entity_'+hash({operation:operation.id,placeholder}).slice(0,24));
    const document=freeze(validateDocument(built.document));const candidateHash=hash(document),diff=semanticDiff(this.document,document);
    requireThat(this.candidateBytes()+bytes(document)<=SemanticLimits.candidateBytes,'RESOURCE_LIMIT');
    const now=this.now();const change:PreparedChange={id:handle(this.epoch,'change'),owner:principal.id,baseRevision,document,candidateHash,contract:this.contract(),diff,idMap:built.idMap,
      diagnostics:compileSemantic(document).diagnostics,certificates:{},createdAt:now,accessedAt:now,validationComplete:false,appliedRevision:null};
    this.ensureCapacity(bytes(change));this.changes.set(change.id,change);return change;
  }
  certificate(change:PreparedChange,result:CaseResult):void {
    requireThat(this.changes.get(change.id)===change,'CHANGE_EXPIRED');
    const required=change.contract.suite.cases.find(item=>item.id===result.caseId);
    requireThat(required,'CASE_NOT_REQUIRED');
    requireThat(result.origin==='required_suite'&&result.candidateHash===change.candidateHash&&result.testContractHash===change.contract.hash&&result.caseDefinitionHash===hash(required),'CERTIFICATE_MISMATCH');
    const certificates={...change.certificates,[result.caseId]:freeze(structuredClone(result))};
    this.ensureCapacity(Math.max(0,bytes(certificates)-bytes(change.certificates)));
    change.certificates=certificates;
  }
  completeValidation(change:PreparedChange,result:{valid:boolean;diagnostics:unknown[]}):void {
    this.sweep();requireThat(this.changes.get(change.id)===change,'CHANGE_EXPIRED');
    const diagnostics=[...change.diagnostics,...structuredClone(result.diagnostics)];
    this.ensureCapacity(Math.max(0,bytes(diagnostics)-bytes(change.diagnostics))+8);
    change.diagnostics=diagnostics;change.validationComplete=result.valid;
  }
  state(change:PreparedChange):'applied'|'stale'|'blocked'|'ready' {
    if(change.appliedRevision)return 'applied';
    if(change.baseRevision!==this.revision||change.contract.hash!==this.contract().hash)return 'stale';
    if(!change.validationComplete||!change.contract.suite.cases.length||change.contract.suite.cases.some(item=>change.certificates[item.id]?.outcome!=='passed'||!change.certificates[item.id]?.complete))return 'blocked';
    return 'ready';
  }
  describe(change:PreparedChange,offset=0):unknown {
    const allTests=Object.values(change.certificates),allIds=Object.entries(change.idMap);
    const totals={diff:change.diff.length,diagnostics:change.diagnostics.length,tests:allTests.length,idMap:allIds.length};
    const length=Math.max(...Object.values(totals));
    requireThat(Number.isInteger(offset)&&offset>=0&&offset<=length,'INVALID_OFFSET');
    let width=12;
    while(true) {
      const diff=change.diff.slice(offset,offset+width).map(({type,ref,label,categories})=>({type,ref,label:label.slice(0,80),labelTruncated:label.length>80,categories}));
      const diagnostics=change.diagnostics.slice(offset,offset+width).map(compactDetail);
      const tests=allTests.slice(offset,offset+width).map(result=>({...result,error:result.error?{...result.error,details:compactDetail(result.error.details)}:null}));
      const ids=allIds.slice(offset,offset+width),idMap=Object.fromEntries(ids);
      const nextOffset=offset+width<length?offset+width:null;
      const contentTruncated=diff.some(item=>item.labelTruncated)||diagnostics.some((item,index)=>item!==change.diagnostics[offset+index])||tests.some((item,index)=>item.error?.details!==allTests[offset+index].error?.details);
      const result={changeId:change.id,baseRevision:change.baseRevision,candidateHash:change.candidateHash,testContractHash:change.contract.hash,state:this.state(change),
        idMap,diff,diagnostics,tests,missingRequiredCases:change.contract.suite.cases.filter(item=>!change.certificates[item.id]).map(item=>item.id),
        coverage:{offset,nextOffset,complete:offset===0&&nextOffset===null&&!contentTruncated,collections:{
          diff:{returned:diff.length,total:totals.diff},diagnostics:{returned:diagnostics.length,total:totals.diagnostics},tests:{returned:tests.length,total:totals.tests},idMap:{returned:ids.length,total:totals.idMap}}},
        reason:change.contract.suite.cases.length?null:'TESTS_NOT_CONFIGURED',expiresAt:Math.min(change.createdAt+SemanticLimits.lifetimeMs,change.accessedAt+SemanticLimits.idleMs)};
      if(bytes(result)<=24*1024)return result;
      requireThat(width>1,'OUTPUT_LIMIT');width=Math.max(1,Math.floor(width/2));
    }
  }
  snapshot():unknown {
    const last=[...this.changes.values()].reverse().find(item=>item.appliedRevision===this.revision);
    return {document:this.document,revision:this.revision,revisionNumber:this.revisionNumber,epoch:this.epoch,
      verification:last?{outcome:'passed',candidateHash:last.candidateHash,testContractHash:last.contract.hash,cases:Object.values(last.certificates)}:{outcome:'unverified',cases:[]}};
  }
  private commit(next:EditorState,operation:Operation,extra:Record<string,unknown>={}):unknown {
    requireThat(!next.error,'DOCUMENT_REJECTED',next.error);
    const revision=`${this.epoch}:revision:${next.revision}`;
    const result={revision,revisionNumber:next.revision,documentHash:hash(next.document),changed:next.revision!==this.editor.revision,...extra};
    const receiptSchema='changeId' in extra?applyReceiptSchema:'idMap' in extra?manualReceiptSchema:documentReceiptSchema;
    requireThat(receiptSchema.safeParse(result).success,'INVALID_OPERATION_RESULT');requireThat(bytes(result)<=SemanticLimits.responseBytes-1024,'OUTPUT_LIMIT');
    const checked=this.checkReceipt(result,'changeId' in extra?'apply':'idMap' in extra?'manual':'undo');
    requireThat(checked===undefined,'ASYNC_RECEIPT_GUARD');
    const allocation=bytes(next.document)+bytes(next.history)+bytes({revision,createdAt:this.now()});
    this.ensureCapacity(allocation);this.registry.checkCommit(operation,result,allocation);
    // No asynchronous work or user callbacks in this critical section.
    this.editor={...next,document:freeze(next.document)};this.remember();this.registry.commit(operation,result);
    return result;
  }
  apply(id:string,baseRevision:string,principal:Principal,operation:Operation):unknown {
    this.authorize(principal,'draft:write');const change=this.getChange(id,principal);
    checkHandle(this.epoch,baseRevision);
    requireThat(baseRevision===this.revision&&baseRevision===change.baseRevision,'REVISION_CONFLICT');
    requireThat(this.state(change)==='ready','CHANGE_NOT_READY');requireThat(hash(change.document)===change.candidateHash,'CANDIDATE_CHANGED');
    const result=this.commit(replaceDocument(this.editor,change.document,this.editor.revision),operation,{changeId:id,candidateHash:change.candidateHash,testContractHash:change.contract.hash});
    change.appliedRevision=this.revision;return result;
  }
  manual(baseRevision:string,operations:DocumentCommand[],principal:Principal,operation:Operation):unknown {
    this.authorize(principal,'draft:write');checkHandle(this.epoch,baseRevision);requireThat(baseRevision===this.revision,'REVISION_CONFLICT');
    const result=applyOperations(this.document,operations,placeholder=>'entity_'+hash({operation:operation.id,placeholder}).slice(0,24));
    return this.commit(replaceDocument(this.editor,result.document,this.editor.revision),operation,{idMap:result.idMap});
  }
  undo(baseRevision:string,principal:Principal,operation:Operation):unknown {
    this.authorize(principal,'draft:write');checkHandle(this.epoch,baseRevision);requireThat(baseRevision===this.revision,'REVISION_CONFLICT');return this.commit(undoEditor(this.editor),operation);
  }
}
