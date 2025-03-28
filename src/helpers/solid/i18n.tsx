import {Accessor, createEffect, createMemo, JSX, on} from 'solid-js';
import I18n, {FormatterArgument, FormatterArguments, LangPackKey} from '../../lib/langPack';
import {resolveElements} from '@solid-primitives/refs';
import {attachClassName} from './classname';

export function I18nTsx(props: {
  key: LangPackKey,
  class?: string,
  args?: JSX.Element | (JSX.Element | FormatterArgument)[],
}) {
  const argsEls = resolveElements(() => props.args, it => it instanceof Element || typeof it === 'string');
  const args: Accessor<FormatterArguments> = createMemo(() => {
    const argsEls$ = argsEls();
    if(!argsEls$) return undefined;
    if(!Array.isArray(argsEls$)) return [argsEls$];
    return argsEls$;
  })

  const el = new I18n.IntlElement({
    key: props.key,
    args: args()
  })

  attachClassName(el.element, () => props.class);

  createEffect(on(() => [props.key, args()] as const, ([key, args]) => {
    el.update({key, args});
  }, {defer: true}))

  return el.element;
}
