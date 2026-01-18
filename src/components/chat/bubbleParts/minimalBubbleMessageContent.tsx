import {JSX, ParentProps, Show} from 'solid-js';
import {getDirection} from '@helpers/dom/setInnerHTML';
import {generateTail, makeTime} from '@components/chat/utils';


export const MinimalBubbleMessageContent = (props: ParentProps<{
  name?: JSX.Element;
  date: Date;
}>) => {
  return (
    <div class="bubble-content-wrapper">
      <div class="bubble-content">
        <Show when={props.name}>
          <div class="name colored-name next-is-message">
            {props.name}
          </div>
        </Show>
        <div class="message spoilers-container" dir={getDirection()}>
          {props.children}
          <div class="time">
            {makeTime(props.date)}
            <div class="time-inner">
              {makeTime(props.date)}
            </div>
          </div>
          <div class='clearfix' />
        </div>
        {generateTail()}
      </div>
    </div>
  );
};
