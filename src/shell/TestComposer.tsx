import type {Controller} from './controller';
import {ShellLimits} from './core/types';
import {textReadiness, pendingMessageCount} from './core';
import {Composer} from './Composer';

export function TestComposer(props: {controller: Controller}) {
  const c = props.controller;
  const full = () => !!c.run() && c.run()!.messages.length + pendingMessageCount(c.run()!) >= ShellLimits.messages;
  const caption = (text: string) => full() ? 'Лимит разговора достигнут. Нажмите «Начать заново» над чатом.' : c.run() && text.trim() ? textReadiness(c.run()!, text) ?? undefined : undefined;
  return <Composer resetKey={c.run()?.id} caption={caption} onSend={c.sendText} />;
}
