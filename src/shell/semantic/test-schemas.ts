import {z} from 'zod';
import type {TestAction, TestCase, TestAssertion} from './contracts';
import {SemanticLimits} from './common';

export const jsonSchema = z.json();
const id = z.string().min(1).max(128);
const count = z.number().int().min(0).max(1000);
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const actionSchema: z.ZodType<TestAction> = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('send_text'), clientMessageId: id, text: z.string().max(8192)}),
  z.strictObject({type: z.literal('click'), messageId: id, occurrence: z.union([z.literal('latest_active'), z.strictObject({id})]), buttonId: id}),
  z.strictObject({type: z.literal('choose_answer'), blockId: id, activationId: id, choiceId: id}),
  z.strictObject({type: z.literal('advance_by'), milliseconds: time}),
  z.strictObject({type: z.literal('emit_event'), eventId: id, name: id, data: jsonSchema}),
  z.strictObject({type: z.literal('retry_failed'), activationId: id})
]);
const predicateSchema = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('variable'), variableId: id, operator: z.enum(['eq','neq','gte','lte','exists']), value: jsonSchema}),
  z.strictObject({type: z.literal('message'), messageId: id, contains: z.string().max(4096).nullable(), min: count, max: count.nullable()}),
  z.strictObject({type: z.literal('screen'), stepId: id, min: count, max: count.nullable()}),
  z.strictObject({type: z.literal('effect'), blockId: id, min: count, max: count.nullable()}),
  z.strictObject({type: z.literal('table'), table: z.literal('orders'), where: z.record(id, jsonSchema), min: count, max: count.nullable()}),
  z.strictObject({type: z.literal('receipt'), actionIndex: count, disposition: z.enum(['accepted','duplicate','ignored','rejected']), code: id.nullable()}),
  z.strictObject({type: z.literal('stop'), reason: id})
]);
export const assertionSchema: z.ZodType<TestAssertion> = z.strictObject({id, when: z.enum(['at_end','after_step','always']), afterStep: count.nullable(), scope: z.enum(['segment','whole_run']), until: time.nullable(), predicate: predicateSchema}).superRefine((value, ctx) => {
  if((value.when === 'after_step') !== (value.afterStep !== null)) ctx.addIssue({code: 'custom', message: 'afterStep belongs to after_step assertions'});
  if(value.until !== null && !['message','screen','effect'].includes(value.predicate.type)) ctx.addIssue({code:'custom',message:'until applies to occurrence assertions only'});
  if(value.when === 'always' && !['variable','table'].includes(value.predicate.type)) ctx.addIssue({code:'custom',message:'always observes variable/table invariants'});
  if('max' in value.predicate && value.predicate.max !== null && value.predicate.max < value.predicate.min) ctx.addIssue({code: 'custom', message: 'max must be at least min'});
});
export const fixtureSchema = z.strictObject({startAt: time, variables: z.record(id, jsonSchema), tables: z.strictObject({orders: z.array(z.record(id,jsonSchema)).max(500)})});
export const caseSchema: z.ZodType<TestCase> = z.strictObject({id, title: z.string().min(1).max(256), given: fixtureSchema, steps: z.array(actionSchema).min(1).max(SemanticLimits.actions), expect: z.array(assertionSchema).max(100)}).superRefine((value,ctx) => {
  if(new Set(value.expect.map(item=>item.id)).size !== value.expect.length) ctx.addIssue({code:'custom',message:'Duplicate assertion ID'});
  if(value.expect.some(item=>item.afterStep !== null && item.afterStep >= value.steps.length)) ctx.addIssue({code:'custom',message:'afterStep is outside the case'});
});
export const casesSchema = z.array(caseSchema).min(1).max(SemanticLimits.cases).superRefine((value,ctx)=>{
  if(new Set(value.map(item=>item.id)).size !== value.length) ctx.addIssue({code:'custom',message:'Duplicate case ID'});
});
export const targetSchema = z.discriminatedUnion('kind', [z.strictObject({kind:z.literal('revision'),revision:id.nullable()}),z.strictObject({kind:z.literal('change'),changeId:id})]);
export const testRequestSchema = z.discriminatedUnion('mode',[
  z.strictObject({mode:z.literal('run'),botId:id,target:targetSchema,requestKey:id,source:z.discriminatedUnion('kind',[
    z.strictObject({kind:z.literal('required_suite'),caseIds:z.array(id).min(1).max(20).nullable()}),
    z.strictObject({kind:z.literal('ad_hoc'),cases:casesSchema})])}),
  z.strictObject({mode:z.literal('continue'),runId:id,expectedRunVersion:time,requestKey:id,steps:z.array(actionSchema).min(1).max(50),expect:z.array(assertionSchema).max(100)}),
  z.strictObject({mode:z.literal('status'),operationId:id}),
  z.strictObject({mode:z.literal('cancel'),operationId:id})
]);
export type TestRequest = z.infer<typeof testRequestSchema>;
