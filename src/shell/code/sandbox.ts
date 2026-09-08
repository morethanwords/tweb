import {DefaultIntrinsics, newQuickJSWASMModuleFromVariant, newVariant, type QuickJSRuntime} from 'quickjs-emscripten-core';
import {CodeLimits, jsonSize, type CodeRequest, type CodeResult} from './contracts';

const variant = {
  type: 'sync' as const,
  importFFI: () => import('@jitl/quickjs-wasmfile-release-sync/ffi').then(module => module.QuickJSFFI),
  importModuleLoader: () => import('./generated/quickjs-loader.js').then(module => module.default)
};

/** VM setup is infrastructure: it must never take a bot's guest-error branch. */
export class SandboxInfrastructureError extends Error {
  constructor() {super('Не удалось запустить изолированное исполнение.'); this.name = 'SandboxInfrastructureError';}
}

async function initializeSandbox(wasmModule: WebAssembly.Module) {
  let runtime: QuickJSRuntime | undefined;
  try {
    const memory = new WebAssembly.Memory({initial: CodeLimits.memoryPages, maximum: CodeLimits.memoryPages});
    const module = await newQuickJSWASMModuleFromVariant(newVariant(variant, {wasmModule, wasmMemory: memory}));
    if(module.getWasmMemory().buffer !== memory.buffer) throw new SandboxInfrastructureError();
    runtime = module.newRuntime();
    runtime.setMemoryLimit(CodeLimits.heapBytes);
    runtime.setMaxStackSize(256 * 1024);
    const vm = runtime.newContext({intrinsics: {...DefaultIntrinsics, Date: false, Proxy: false}});
    return {memory, runtime, vm};
  } catch {
    try {runtime?.dispose();} catch { /* A broken VM is disposed with its worker. */ }
    throw new SandboxInfrastructureError();
  }
}

/** A fresh fixed-memory VM per activation. No handle or host function enters it. */
export async function executeSandbox(javascript: string, request: Omit<CodeRequest, 'signal'>, wasmModule: WebAssembly.Module): Promise<CodeResult> {
  const {memory, runtime, vm} = await initializeSandbox(wasmModule);
  const deadline = performance.now() + CodeLimits.executionMs;
  runtime.setInterruptHandler(() => performance.now() >= deadline);
  function evaluate(source: string): string {
    const result = vm.evalCode(source, 'bot.js');
    try {
      if(result.error) {
        const error = vm.dump(result.error) as {message?: string};
        throw new Error(error?.message || 'Ошибка исполнения кода.');
      }
      return vm.typeof(result.value) === 'string' ? vm.getString(result.value) : '';
    } finally {result.dispose();}
  }
  try {
    evaluate(`'use strict';
      delete globalThis.Date; delete globalThis.eval;
      Object.defineProperty(Function.prototype, 'constructor', {value:undefined});
      Object.defineProperty(Object.getPrototypeOf(async function(){}), 'constructor', {value:undefined});
      Object.defineProperty(Object.getPrototypeOf(function*(){}), 'constructor', {value:undefined});
      delete globalThis.Function;
      Object.defineProperty(Math, 'random', {value:undefined});
      for(const builtin of [Object, Array, String, Number, Boolean, RegExp, JSON, Math, Set, Map, Promise, Error, TypeError]) {
        if(builtin.prototype) Object.freeze(builtin.prototype); Object.freeze(builtin);
      }
      Object.freeze(globalThis);
      let __roboSettled = false, __roboResult = '', __roboError = '';
      (function() {
        const stringify = JSON.stringify;
        const freeze = value => {
          if(value && typeof value === 'object') { for(const key of Object.keys(value)) freeze(value[key]); Object.freeze(value); }
          return value;
        };
        const ctx = freeze(JSON.parse(${JSON.stringify(jsonSize(request.context))}));
        const exports = {};
        ${javascript}
        Promise.resolve(exports.default(ctx)).then(value => {
          if(!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Верните объект с outcome.');
          const fields = Object.getOwnPropertyDescriptors(value);
          if(Object.keys(fields).some(key => !['outcome','data'].includes(key)) || Object.values(fields).some(field => !('value' in field))) throw new Error('Недопустимый результат.');
          if(!${JSON.stringify(request.outcomes)}.includes(value.outcome)) throw new Error('Неизвестный исход.');
          const seen = new Set();
          const check = (item, depth) => {
            if(depth > 20) throw new Error('Вложенность результата превышает лимит.');
            if(item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return;
            if(!item || typeof item !== 'object' || seen.has(item)) throw new Error('Результат должен быть JSON без циклов.');
            const prototype = Object.getPrototypeOf(item);
            if(!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new Error('Результат должен быть обычным JSON-объектом.');
            seen.add(item);
            for(const [key, field] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
              if(Array.isArray(item) && key === 'length') continue;
              if(!('value' in field) || ['__proto__','prototype','constructor'].includes(key)) throw new Error('Недопустимое поле результата.');
              check(field.value, depth + 1);
            }
            seen.delete(item);
          };
          check(value, 0);
          const result = stringify(value);
          if(result.length > ${CodeLimits.outputBytes}) throw new Error('Результат превышает 64 КБ.');
          __roboResult = result; __roboSettled = true;
        }).catch(error => { __roboError = typeof error?.message === 'string' ? error.message.slice(0,1000) : 'Ошибка исполнения кода.'; __roboSettled = true; });
      })();`);
    while(runtime.hasPendingJob()) {
      if(performance.now() >= deadline) throw new Error('Время исполнения превышает 500 мс.');
      const result = runtime.executePendingJobs(1);
      try {if(result.error) throw new Error('Не удалось завершить асинхронный код.');} finally {result.dispose();}
    }
    const settled = evaluate('String(__roboSettled)');
    if(settled !== 'true') throw new Error('Асинхронный код не завершился. Внешние ожидания недоступны.');
    const failure = evaluate('__roboError');
    if(failure) throw new Error(failure);
    const serialized = evaluate('__roboResult');
    if(new TextEncoder().encode(serialized).length > CodeLimits.outputBytes) throw new Error('Результат превышает 64 КБ.');
    const result = JSON.parse(serialized) as CodeResult;
    jsonSize(result);
    if(!request.outcomes.includes(result.outcome)) throw new Error('Неизвестный исход.');
    if(memory.buffer.byteLength !== CodeLimits.memoryPages * 65536) throw new Error('Нарушено ограничение памяти.');
    return result;
  } finally {vm.dispose(); runtime.dispose();}
}
