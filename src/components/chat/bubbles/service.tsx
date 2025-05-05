import {createEffect, createResource, JSX, on} from 'solid-js';
import classNames from '../../../helpers/string/classNames';
import {Message} from '../../../layer';

import styles from './service.module.scss';
import wrapMessageActionTextNew from '../../wrappers/messageActionTextNew';

export function ServiceBubble(props: {
  class?: string
  message: Message.messageService
  children?: JSX.Element
}) {
  const [text, {refetch}] = createResource(() => wrapMessageActionTextNew({
    message: props.message
  }))
  createEffect(on(() => props.message, refetch))

  return (
    <div class={classNames(styles.wrap, props.class)}>
      <div class={/* @once */ styles.text}>
        {text()}
      </div>
      {props.children}
    </div>
  )
}
