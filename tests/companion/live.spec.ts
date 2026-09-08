import {test,expect} from '@playwright/test';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {installBrowserGuards} from '../browser/isolation';

test('real MCP checks and commits one candidate, UI sees it, manual edit invalidates verification',async({page,baseURL})=>{
  const manifest=JSON.parse(await readFile('companion-dist/build-manifest.json','utf8')) as {files:{path:string}[];workers:string[]};
  const legal=new Set(['/',...manifest.files.map(item=>item.path),'/api/session','/api/document','/api/context','/api/command']);
  const errors:string[]=[],network:string[]=[],guards:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.text().startsWith('__SHELL_ISOLATION__:'))guards.push(message.text());});
  await page.addInitScript(installBrowserGuards,{workers:manifest.workers,companion:true});
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==baseURL||!legal.has(url.pathname)||request.method()!==(url.pathname==='/api/command'?'POST':'GET')) {network.push(request.method()+' '+url.pathname);await route.abort();return;}
    await route.continue();
  });
  const token=(await readFile('semantic-artifacts/test-capability','utf8')).trim();
  const client=new Client({name:'robochat-production-browser-smoke',version:'1.0.0'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
  await client.connect(new StreamableHTTPClientTransport(new URL(baseURL+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
  async function call(name:string,args:Record<string,unknown>={}) {
    const response=await client.callTool({name,arguments:args});
    expect(response.isError,JSON.stringify(response.structuredContent??response.content)).toBe(false);
    const envelope=response.structuredContent as {ok:boolean;data:any};
    expect(envelope.ok,JSON.stringify(envelope)).toBe(true);return envelope.data;
  }
  let codeId:string|null=null,botId:string|null=null;
  try {
    expect((await client.listTools()).tools).toHaveLength(8);
    const context=await call('bot_context');botId=context.botId;
    const search=await call('bot_search',{botId:context.botId,query:'start-message'});
    expect(search.matches.some((item:{ref:{id:string}})=>item.ref.id==='start-message')).toBe(true);
    await page.goto('/');const message=page.getByTestId('editor-start').first();await expect(message).toBeVisible();
    const text='Материалы и идеи для экспериментов. '+randomUUID();
    const prepared=await call('bot_prepare_change',{botId:context.botId,baseRevision:context.revision,requestKey:randomUUID(),operations:[{type:'set_message_text',stepId:'start',messageId:'start-message',text}]});
    expect(prepared.state).toBe('ready');expect(prepared.tests).toHaveLength(5);expect(prepared.tests.every((item:{outcome:string})=>item.outcome==='passed')).toBe(true);
    const args={botId:context.botId,baseRevision:context.revision,requestKey:randomUUID(),changeId:prepared.changeId};
    const applied=await call('bot_apply_change',args);expect(await call('bot_apply_change',args)).toEqual(applied);
    await expect(message).toHaveValue(text);
    const open=page.getByRole('button',{name:'Открыть навигацию'});if(await open.isVisible())await open.click();
    await expect(page.getByText('Пройдены',{exact:true})).toBeVisible();
    if(await open.isVisible())await page.getByRole('button',{name:'Закрыть навигацию'}).click();
    const modified=text+' Ручная правка.';await message.fill(modified);await message.press('ControlOrMeta+Enter');
    await expect.poll(async()=> (await call('bot_context')).revision).not.toBe(applied.revision);
    await page.reload();await expect(page.getByTestId('editor-start').first()).toHaveValue(modified);
    const report=await call('execution_explain',{kind:'simulation',reportId:prepared.tests[0].reportId,offset:0,limit:20});
    expect(report.candidateHash).toBe(prepared.candidateHash);expect(report.outcome).toBe('passed');
    const current=await call('bot_context');
    const broken=await call('bot_prepare_change',{botId:context.botId,baseRevision:current.revision,requestKey:randomUUID(),operations:[{type:'set_button_transition',buttonId:'start-offer',transition:{type:'screen',screenId:'menu'}}]});
    expect(broken.state).toBe('blocked');expect(broken.tests.some((item:{outcome:string})=>['failed','blocked'].includes(item.outcome))).toBe(true);
    const rejected=await client.callTool({name:'bot_apply_change',arguments:{botId:context.botId,baseRevision:current.revision,requestKey:randomUUID(),changeId:broken.changeId}});
    expect(rejected.structuredContent).toMatchObject({ok:false,error:{code:'CHANGE_NOT_READY'}});
    expect((await call('bot_context')).revision).toBe(current.revision);
    const codeChange=await call('bot_prepare_change',{botId,baseRevision:current.revision,requestKey:randomUUID(),operations:[
      {type:'add_block',stepId:'start',afterBlockId:null,messageText:null,block:{id:'$browser_code',type:'code',name:'Проверка общего исполнителя',source:'export default function run(ctx: RoboContext) { return {outcome: \"ok\", data: \"sandbox-ready\"}; }',outcomes:[{id:'ok',name:'ok',transition:{type:'continue'}}],resultVariableId:'run.result'}},
      {type:'set_message_text',stepId:'start',messageId:'start-message',text:'Проверка VM: {{run.result}}'}
    ]});
    expect(codeChange.state).toBe('ready');
    await call('bot_apply_change',{botId,baseRevision:current.revision,requestKey:randomUUID(),changeId:codeChange.changeId});codeId=codeChange.idMap['$browser_code'];
    await expect(page.getByTestId('editor-start').first()).toHaveValue('Проверка VM: {{run.result}}');
    if(await open.isVisible())await open.click();await page.getByTestId('mode-test').click();
    await expect(page.getByTestId('run-bot').last()).toContainText('Проверка VM: sandbox-ready',{timeout:10000});
    expect(errors).toEqual([]);expect(network).toEqual([]);expect(guards).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  } finally {
    if(codeId&&botId) {
      const current=await call('bot_context');
      const cleanup=await call('bot_prepare_change',{botId,baseRevision:current.revision,requestKey:randomUUID(),operations:[{type:'delete_block',stepId:'start',blockId:codeId},{type:'set_message_text',stepId:'start',messageId:'start-message',text:'Материалы и идеи для экспериментов.'}]});
      await call('bot_apply_change',{botId,baseRevision:current.revision,requestKey:randomUUID(),changeId:cleanup.changeId});
    }
    await client.close();
  }
});
