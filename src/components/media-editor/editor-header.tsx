import ButtonIcon from '../buttonIcon';
import Icon from '../icon';
import {i18n} from '../../lib/langPack';
import undoIcon from './svg/undo.svg';
import redoIcon from './svg/redo.svg';
import {JSXElement} from 'solid-js';

const HeaderButton = ({elem, callback}: { elem: JSXElement, callback: VoidFunction }) => {
  const button = ButtonIcon('popup-close', {noRipple: true});
  button.append(elem as Node);
  return <div onClick={() => callback()}>
    {button}
  </div>;
}

export const EditorHeader = ({undo, redo, close}: { undo: VoidFunction, redo: VoidFunction, close: VoidFunction }) => {
  return <div class='popup-header'>
    <HeaderButton elem={Icon('close')} callback={close} />
    <span class='popup-title'>{ i18n('Edit') }</span>
    <HeaderButton elem={<img src={undoIcon} alt='Undo' />} callback={undo} />
    <HeaderButton elem={<img src={redoIcon} alt='Redo' />} callback={redo} />
  </div>
}
