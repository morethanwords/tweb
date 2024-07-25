import ButtonIcon from '../buttonIcon';
import Icon from '../icon';
import {i18n} from '../../lib/langPack';
import undoIcon from './svg/undo.svg';
import redoIcon from './svg/redo.svg';
import {createEffect, JSXElement} from 'solid-js';

const HeaderButton = (props: { active?: boolean, elem: JSXElement, callback: VoidFunction }) => {
  const button = ButtonIcon('popup-close', {noRipple: true});
  button.append(props.elem as Node);
  createEffect(() => {
    if(props.active === false) {
      button.setAttribute('disabled', 'true');
    } else {
      button.removeAttribute('disabled');
    }
  })
  return <div style={{'pointer-events': (props.active === false) ? 'none' : 'auto'}} onClick={() => props.callback()}>
    {button}
  </div>;
}

export const EditorHeader = (props: { redoActive: boolean, undoActive: boolean, undo: VoidFunction, redo: VoidFunction, close: VoidFunction }) => {
  return <div class='popup-header'>
    <HeaderButton elem={Icon('close')} callback={close} />
    <span class='popup-title'>{ i18n('Edit') }</span>
    <HeaderButton elem={<img src={undoIcon} alt='Undo' />} active={props.undoActive} callback={props.undo} />
    <HeaderButton elem={<img src={redoIcon} alt='Redo' />} active={props.redoActive} callback={props.redo} />
  </div>
}
