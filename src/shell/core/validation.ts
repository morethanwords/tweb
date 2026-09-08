import {ShellLimits} from './types';
const forbiddenIds = new Set(['__proto__', 'prototype', 'constructor']);

export function fail(path: string, reason: string): never {
  throw new Error(`${path}: ${reason}`);
}

export function validId(value: unknown, path = 'id'): asserts value is string {
  if(typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value) || forbiddenIds.has(value)) {
    fail(path, 'нужен безопасный идентификатор длиной 1–64 символа');
  }
}

export function object(value: unknown, path: string): Record<string, unknown> {
  if(value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'ожидается объект');
  const prototype = Object.getPrototypeOf(value);
  if(prototype !== Object.prototype && prototype !== null) fail(path, 'ожидается простой объект');
  for(const key of Reflect.ownKeys(value)) {
    if(typeof key !== 'string') fail(path, 'символьные поля недопустимы');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if(!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail(path, 'ожидаются обычные поля данных');
  }
  return value as Record<string, unknown>;
}

export function fields(value: unknown, expected: string[], path: string): Record<string, unknown> {
  const result = object(value, path);
  const actual = Object.keys(result);
  if(actual.length !== expected.length || actual.some((key) => !expected.includes(key))) {
    fail(path, `допустимы только поля: ${expected.join(', ')}`);
  }
  return result;
}

export function string(value: unknown, path: string): string {
  if(typeof value !== 'string') fail(path, 'ожидается текст');
  if(value.length > ShellLimits.documentBytes) fail(path, 'текст превышает предел размера документа');
  return value;
}

export function array(value: unknown, path: string, maximum: number): unknown[] {
  if(!Array.isArray(value) || value.length > maximum) fail(path, `ожидается массив, максимум ${maximum}`);
  // Sparse arrays and extra own properties must not disappear during JSON serialization.
  if(Object.keys(value).length !== value.length || Object.keys(value).some((key, index) => key !== String(index))) {
    fail(path, 'ожидается плотный массив без дополнительных полей');
  }
  if(Reflect.ownKeys(value).length !== value.length + 1) fail(path, 'дополнительные поля массива недопустимы');
  for(let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if(!descriptor || !('value' in descriptor)) fail(path, 'ожидаются обычные элементы данных');
  }
  return value;
}

export function matchingKeys(map: Record<string, unknown>, ids: string[], path: string): void {
  const keys = Object.keys(map);
  if(keys.length !== ids.length || keys.some((key) => !ids.includes(key))) fail(path, 'идентификаторы должны точно соответствовать структуре');
}
