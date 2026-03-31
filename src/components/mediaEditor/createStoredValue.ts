import {StateSettings} from '@config/state';
import getDeepProperty from '@helpers/object/getDeepProperty';
import asyncThrottle from '@helpers/schedulers/asyncThrottle';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createSignal} from 'solid-js';
import {ColoredBrushType} from './context';


type Optional<T> = { hasValue: true; value: T } | { hasValue: false };
type Validator<T> = (raw: any) => Optional<T>;

export type StoredValueKey = keyof StateSettings['mediaEditor'] | ['colorByBrush', ColoredBrushType];

type CreateStoredValueArgs<T> = {
  key: StoredValueKey;
  defaultValue: T;
  validate: Validator<T>;
  skipSaving?: (value: T) => boolean;
};

export const Optional = {
  value: <T>(value: T): Optional<T> => ({hasValue: true, value}),
  none: <T = never>(): Optional<T> => ({hasValue: false})
};

export function createStoredValue<T>({key, defaultValue, validate, skipSaving = () => false}: CreateStoredValueArgs<T>) {
  const {useAppSettings} = useHotReloadGuard();

  const [appSettings, setAppSettings] = useAppSettings();

  let initialValue: T = defaultValue;

  try {
    const raw: any = getDeepProperty(appSettings.mediaEditor, key);
    if(raw !== undefined) {
      const parsed = validate(raw);
      if(parsed.hasValue) {
        initialValue = parsed.value;
      }
    }
  } catch{}

  const [value, setValue] = createSignal(initialValue);

  const throttledSave = asyncThrottle(async() => {
    try {
      if(key instanceof Array) {
        await setAppSettings('mediaEditor', ...key, value());
      } else {
        await setAppSettings('mediaEditor', key, value());
      }
    } catch{ }
  }, 0);

  createEffect(() => {
    const current = value();

    if(skipSaving(current)) return;

    throttledSave();
  });

  return [value, setValue] as const;
}
