import {ParentProps, JSX} from 'solid-js';
import {getDirection} from '../../../helpers/dom/setInnerHTML';
import {generateTail, makeTime} from '../utils';


export const MinimalBubbleMessageContent = (props: ParentProps<{
  name?: JSX.Element;
  date: Date;
}>) => {
  return (
    <div class="bubble-content-wrapper">
      <div class="bubble-content">
        {props.name}
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
