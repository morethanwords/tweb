import {randomUUID} from 'node:crypto';
import type {CodeRequest,ShellDocument} from '../core/types';
import {compileSemantic,searchSemantic,inspectSemantic,type EntityRef} from './compiler';
import {OperationRegistry,type Operation} from './registry';
import {DocumentService} from './document-service';
import {TestService} from './test-service';
import {createDefaultDocument,createBlogSuite} from './fixtures';
import {toolDefinitions,manualSchema,undoSchema} from './tool-schemas';
import {boundedInput,bytes,canonical,DomainError,errorCode,hash,requireThat,SemanticLimits} from './common';
import type {BatchResult,CodeExecution,Principal,RequiredSuite,Target} from './contracts';
import type {CompanionApp} from './transport/contracts';
import type {TestRequest} from './test-schemas';

export interface AppOptions {
  document?:ShellDocument;suite?:RequiredSuite;epoch?:string;now?:()=>number;engineBuild:string;executeCode:CodeExecution;
  validateCode:(request:CodeRequest,signal:AbortSignal)=>Promise<{valid:boolean;infrastructure:boolean;diagnostics:unknown[]}>;
}
export function createSemanticApp(options:AppOptions):CompanionApp & {documents:DocumentService;tests:TestService;registry:OperationRegistry} {
  const epoch=options.epoch??randomUUID(),now=options.now??Date.now;
  const document=options.document??createDefaultDocument();
  let documents:DocumentService,tests:TestService;
  const registry=new OperationRegistry(epoch,now,extra=>capacity(extra));
  const capacity=(extra:number)=>{requireThat((documents?.retainedBytes()??0)+(tests?.retainedBytes()??0)+registry.retainedBytes()+Math.max(0,extra)<=SemanticLimits.retainedBytes,'RESOURCE_LIMIT');};
  documents=new DocumentService(epoch,document,options.suite??(options.document?{id:'unconfigured',version:1,cases:[]}:createBlogSuite()),options.engineBuild,now,registry,capacity,(result,kind)=>{if(kind==='apply')checkOutput(toolDefinitions.find(item=>item.name==='bot_apply_change')!,{ok:true,data:result});});
  tests=new TestService(epoch,now,options.executeCode,capacity);
  const principal:Principal={id:'local-owner',botIds:[document.id],scopes:['bot:read','draft:write','simulation:run','simulation:read']};
  let verification:{candidateHash:string;result:BatchResult}|null=null;
  async function validateCode(candidate:ShellDocument,signal:AbortSignal) {
    const diagnostics:unknown[]=[];let valid=true;
    for(const block of Object.values(candidate.blocks))if(block.type==='code') {
      requireThat(!signal.aborted,'CANCELLED');
      const result=await options.validateCode({source:block.source,context:{user:{},run:{},conversation:{},bot:{},system:{},event:{}},outcomes:block.outcomes.map(item=>item.name),variableTypes:Object.fromEntries(Object.values(candidate.variables).map(item=>[item.id,item.valueType]))},signal);
      requireThat(!signal.aborted,'CANCELLED');requireThat(!result.infrastructure,'CODE_INFRASTRUCTURE');
      valid=valid&&result.valid;diagnostics.push({blockId:block.id,valid:result.valid,diagnostics:result.diagnostics});
    }
    return {valid,diagnostics};
  }
  async function boundedRead<T>(signal:AbortSignal,work:(signal:AbortSignal)=>Promise<T>):Promise<T> {
    requireThat(!signal.aborted,'CANCELLED');
    const controller=new AbortController();
    let rejectStopped!:(reason:DomainError)=>void;
    const stopped=new Promise<never>((_resolve,reject)=>{rejectStopped=reject;});
    const stop=(code:string)=>{
      if(controller.signal.aborted)return;
      const reason=new DomainError(code);rejectStopped(reason);controller.abort(reason);
    };
    const abort=()=>stop('CANCELLED');signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>stop('DEADLINE_EXCEEDED'),SemanticLimits.workMs);
    try {return await Promise.race([work(controller.signal),stopped]);}
    finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  async function operation(principal:Principal,method:string,key:string,raw:unknown,signal:AbortSignal,work:(operation:Operation)=>Promise<unknown>|unknown):Promise<unknown> {
    const claim=registry.claim(principal,document.id,method,key,raw);if(!claim.fresh)return registry.replay(claim.operation);
    const op=claim.operation;
    const abort=()=>{if(op.status==='pending'){op.status='cancelled';op.error='CANCELLED';op.controller.abort();}};
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    const timer=setTimeout(()=>{if(op.status==='pending'){op.status='rejected';op.error='DEADLINE_EXCEEDED';op.controller.abort();}},SemanticLimits.workMs);
    try {
      requireThat(op.status==='pending','CANCELLED');const result=await work(op);
      if((op as Operation).status==='committed')return registry.replay(op);
      if((op as Operation).status!=='pending') {
        const definition=toolDefinitions.find(item=>method===item.name||method.startsWith(item.name+':'));
        if(definition)checkOutput(definition,{ok:true,data:result});
        registry.retainTerminalResult(op,result);
        return registry.replay(op);
      }
      const definition=toolDefinitions.find(item=>method===item.name||method.startsWith(item.name+':'));
      if(definition) checkOutput(definition,{ok:true,data:result});
      registry.commit(op,result);return registry.replay(op);
    } catch(cause) {
      registry.reject(op,errorCode(cause));
      // The first caller and a retry must observe the same terminal identity,
      // including a deadline which caused an adapter to return CANCELLED.
      return registry.replay(op);
    }
    finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  function checkOutput(definition:typeof toolDefinitions[number],value:unknown):void {
    requireThat(bytes(value)<=SemanticLimits.responseBytes-1024,'OUTPUT_LIMIT');
    requireThat(definition.outputSchema.safeParse(value).success,'OUTPUT_CONTRACT');
  }
  async function handle(name:string,input:unknown,actor:Principal,signal:AbortSignal):Promise<unknown> {
    try {
      boundedInput(input);documents.sweep();tests.sweep();
      const definition=toolDefinitions.find(item=>item.name===name);
      if(definition) for(const scope of definition.requiredScopes)documents.authorize(actor,scope);
      else requireThat(['document_snapshot','manual_change','undo_change'].includes(name),'UNKNOWN_TOOL');
      const parsed=definition?.inputSchema.parse(input)??(name==='manual_change'?manualSchema.parse(input):name==='undo_change'?undoSchema.parse(input):{});
      const args=parsed as Record<string,any>;
      if(args.botId!==undefined)requireThat(args.botId===document.id,'NOT_FOUND');
      let data:unknown;
      if(name==='document_snapshot') {
        documents.authorize(actor,'bot:read');const snapshot=documents.snapshot() as Record<string,unknown>;
        if(verification?.candidateHash===hash(documents.document))snapshot.verification={outcome:verification.result.outcome,candidateHash:verification.candidateHash,cases:verification.result.cases};
        data=snapshot;
      } else if(name==='bot_context') {
        const index=compileSemantic(documents.document),suite=documents.requiredSuite;
        const allScreens=index.entities.filter(item=>item.ref.kind==='screen'),allVariables=Object.values(documents.document.variables);
        const firstFixture=suite.cases[0]?.given,fixtureComplete=firstFixture!==undefined&&bytes(firstFixture)<=4096;
        const screenWindow=allScreens.slice(0,12).map(item=>({ref:item.ref,label:item.label.slice(0,80),labelTruncated:item.label.length>80}));
        const variableWindow=allVariables.slice(0,12).map(item=>({...item,label:item.label.slice(0,80),labelTruncated:item.label.length>80}));
        const caseWindow=suite.cases.slice(0,12).map(item=>({id:item.id,title:item.title.slice(0,80),titleTruncated:item.title.length>80}));
        data={epoch,botId:document.id,revision:documents.revision,documentHash:hash(documents.document),
          capabilities:{simulation:true,externalDelivery:false,independentReminders:false,code:'pure_quickjs',wait:'sequential',schemaVersion:6,
            testing:{wholeRunInvariants:'initial_run_only',continuationInvariants:'segment'},
            contextCoverage:{contentComplete:false,screens:{returned:screenWindow.length,total:allScreens.length},variables:{returned:variableWindow.length,total:allVariables.length},requiredCases:{returned:caseWindow.length,total:suite.cases.length},
              opaqueCodeBlocks:index.opaqueCode.length,more:'Inspect the bot entity for complete ownership references; inspect individual entities for full content. Code dependencies remain unknown.'}},
          counts:{screens:Object.keys(documents.document.steps).length,blocks:Object.keys(documents.document.blocks).length,messages:Object.keys(documents.document.messages).length,buttons:Object.keys(documents.document.buttons).length},
          screens:screenWindow,variables:variableWindow,
          fixtures:firstFixture?[{id:suite.id+'-seed',contentComplete:fixtureComplete,...(fixtureComplete?{given:firstFixture}:{reason:'FIXTURE_TOO_LARGE',variableIds:Object.keys(firstFixture.variables).slice(0,12),ordersCount:firstFixture.tables.orders.length})}]:[],
          requiredSuite:{id:suite.id,hash:documents.contract().hash,cases:caseWindow}};
      } else if(name==='bot_search') {
        const found=searchSemantic(compileSemantic(documents.document),args.query,args.limit),matches=[...found];
        while(matches.length&&bytes(matches)>24*1024)matches.pop();
        data={revision:documents.revision,matches,coverage:{returned:matches.length,requestedLimit:args.limit,limited:matches.length<found.length||found.length===args.limit}};
      }
      else if(name==='bot_inspect') {
        if(args.changeId)data=documents.describe(documents.getChange(args.changeId,actor),args.offset);
        else {
          const content=inspectSemantic(compileSemantic(documents.document),args.ref as EntityRef);requireThat(content,'ENTITY_NOT_FOUND');
          const serialized=canonical(content),offset=args.offset as number;requireThat(offset<=serialized.length,'INVALID_OFFSET');const complete=offset===0&&bytes(content)<24000;
          const fragment=serialized.slice(offset,offset+7000),next=complete?null:offset+fragment.length<serialized.length?offset+fragment.length:null;
          data={revision:documents.revision,contentComplete:complete,representation:complete?'structured':'json_fragment',content:complete?content:fragment,contentHash:hash(content),offset,nextOffset:next,totalCharacters:serialized.length};
        }
      } else if(name==='bot_validate') {
        const selected=documents.resolve(args.target as Target,actor),index=compileSemantic(selected.document),code=await boundedRead(signal,inner=>validateCode(selected.document,inner));
        data={candidateHash:hash(selected.document),valid:code.valid,diagnostics:index.diagnostics,code};
      } else if(name==='bot_prepare_change') data=await operation(actor,name,args.requestKey,parsed,signal,async op=>{
        const change=documents.prepare(args.baseRevision,args.operations,actor,op),code=await validateCode(change.document,op.controller.signal);
        documents.completeValidation(change,code);
        if(code.valid&&change.contract.suite.cases.length)await tests.batch(change.document,change.contract,change.contract.suite.cases,actor,op,result=>documents.certificate(change,result));
        return {...documents.describe(change) as object,operationId:op.id};
      });
      else if(name==='bot_apply_change')data=await operation(actor,name,args.requestKey,parsed,signal,op=>documents.apply(args.changeId,args.baseRevision,actor,op));
      else if(name==='manual_change'||name==='undo_change') {
        documents.authorize(actor,'draft:write');data=await operation(actor,name,args.requestKey,parsed,signal,op=>name==='manual_change'?documents.manual(args.baseRevision,args.operations,actor,op):documents.undo(args.baseRevision,actor,op));
      } else if(name==='execution_explain')data=args.detail?tests.reportFragment(args.reportId,actor,args.detail):tests.report(args.reportId,actor,args.offset,args.limit);
      else if(name==='bot_test') {
        const request=parsed as TestRequest;
        if(request.mode==='status'){const op=registry.get(request.operationId,actor);data={operationId:op.id,executionStatus:op.status,result:op.result,error:op.error};}
        else if(request.mode==='cancel')data=registry.cancel(request.operationId,actor);
        else if(request.mode==='continue')data=await operation(actor,name+':'+request.runId,request.requestKey,request,signal,op=>tests.continue(request.runId,request.expectedRunVersion,request.steps,request.expect,actor,op));
        else data=await operation(actor,name,request.requestKey,request,signal,async op=>{
          const selected=documents.resolve(request.target,actor);let contract=selected.contract,cases;
          if(request.source.kind==='required_suite') {
            const requested=request.source.caseIds;requireThat(contract.suite.cases.length,'TESTS_NOT_CONFIGURED');
            requireThat(requested===null||new Set(requested).size===requested.length,'DUPLICATE_CASE_ID');
            requireThat(requested===null||requested.every(id=>contract.suite.cases.some(item=>item.id===id)),'CASE_NOT_REQUIRED');
            cases=contract.suite.cases.filter(item=>requested===null||requested.includes(item.id));
          } else {cases=request.source.cases;const base={origin:'ad_hoc' as const,suite:{id:'ad-hoc',version:1,cases},engineBuild:options.engineBuild,fixturePolicy:'explicit-v1' as const};contract={...base,hash:hash(base)};}
          const result=await tests.batch(selected.document,contract,cases,actor,op,request.source.kind==='required_suite'&&selected.change?test=>documents.certificate(selected.change!,test):undefined);
          if(request.source.kind==='required_suite'&&cases.length===selected.contract.suite.cases.length)verification={candidateHash:result.candidateHash,result};
          return result;
        });
      } else throw new DomainError('UNKNOWN_TOOL');
      const result=JSON.parse(JSON.stringify({ok:true,data}));
      if(definition) checkOutput(definition,result);
      return result;
    } catch(cause) {
      const validation=cause&&typeof cause==='object'&&'issues' in cause;
      const code=validation?'INVALID_INPUT':errorCode(cause);const details=cause instanceof DomainError?cause.details:null;
      return {ok:false,error:{code,message:code,details}};
    }
  }
  return {principal,tools:toolDefinitions,instructions:'Local Robochat authoring and deterministic simulation. Read context, prepare typed changes with frozen required tests, apply that exact candidate. Never claim external delivery or weaken acceptance tests. Reuse requestKey for uncertain retries.',handle,documents,tests,registry};
}
