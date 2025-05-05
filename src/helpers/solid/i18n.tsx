import {Accessor, createEffect, createMemo, JSX, on} from 'solid-js';
import I18n, {FormatterArgument, FormatterArguments, LangPackKey} from '../../lib/langPack';
import {attachClassName} from './classname';
import {resolveElements} from '@solid-primitives/refs';

export function I18nTsx(props: {
  key: LangPackKey,
  class?: string,
  args?: JSX.Element | (JSX.Element | FormatterArgument)[],
}) {
  const argsEls = resolveElements(() => props.args, it => it instanceof Node || typeof it === 'string');
  const args: Accessor<FormatterArguments> = () => argsEls.toArray()

  const el = new I18n.IntlElement({
    key: props.key,
    args: args()
  })

  attachClassName(el.element, () => props.class);

  createEffect(on(() => [props.key, args()] as const, ([key, args], _prev) => {
    el.update({key, args});
  }, {defer: true}))

  return el.element;
}
