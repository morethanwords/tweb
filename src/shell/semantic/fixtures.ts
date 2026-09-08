import {createFixture} from '../core/fixture';
import type {Fixture, RequiredSuite, TestAction, TestAssertion, TestCase} from './contracts';

/** Explicit named demonstration data, never inferred from a changed document. */
export const blogFixture: Fixture = {
  startAt: 0,
  variables: {'user.name':'Тестовый читатель','user.age':25,'user.balance':1500,'user.plan':'free','user.subscribed':false,'user.telegramId':'local-reader',
    'run.answer':'','run.count':0,'run.result':null,'run.http':null,'run.payment':null,'run.productPrice':500,
    'conversation.id':'local-conversation','conversation.lastInput':'','bot.name':'AI Generated Bot'},
  tables:{orders:[]}
};
export function expectMessage(id:string,messageId:string,min=1,max:number|null=null):TestAssertion {
  return {id,when:'at_end',afterStep:null,scope:'segment',until:null,predicate:{type:'message',messageId,contains:null,min,max}};
}
const start:TestAction={type:'send_text',clientMessageId:'start-input',text:'/start'};
const click=(messageId:string,buttonId:string):TestAction=>({type:'click',messageId,buttonId,occurrence:'latest_active'});
function scenario(id:string,title:string,steps:TestAction[],expect:TestAssertion[]):TestCase {return {id,title,given:structuredClone(blogFixture),steps,expect};}
export function createBlogSuite():RequiredSuite {
  return {id:'blog-paths',version:1,cases:[
    scenario('material','Материал открывается из начала',[start,click('start-message','start-offer'),click('offer-message','offer-material')],[expectMessage('material-shown','material-message'),expectMessage('no-fallback','start-fallback-message',0,0)]),
    scenario('menu-cycle','Меню и возврат в начало',[start,click('start-message','start-menu'),click('menu-message','menu-start'),click('start-message','start-menu')],[expectMessage('menu-twice','menu-message',2,2),expectMessage('start-twice','start-message',2,2)]),
    scenario('start-fallback','Неизвестный текст в папке Старт',[start,{type:'send_text',clientMessageId:'unknown',text:'Непонятный текст'},click('start-fallback-message','start-fallback-back')],[expectMessage('fallback','start-fallback-message'),expectMessage('return','start-message',2,2)]),
    scenario('menu-fallback','Неизвестная команда в папке Меню',[start,click('start-message','start-menu'),{type:'send_text',clientMessageId:'unknown-command',text:'/unknown'}],[expectMessage('fallback','menu-fallback-message'),expectMessage('not-start-fallback','start-fallback-message',0,0)]),
    scenario('details','Объяснение и материал связаны',[start,click('start-message','start-offer'),click('offer-message','offer-more'),click('details-message','details-material')],[expectMessage('details','details-message'),expectMessage('material','material-message')])
  ]};
}
export const createDefaultDocument=createFixture;
