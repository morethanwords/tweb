/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {IS_FIREFOX} from '../../environment/userAgent';
import {logger} from '../../lib/logger';
import {isCustomFillerNeededBySiblingNode} from '../../lib/richTextProcessor/wrapRichText';
import ListenerSetter from '../listenerSetter';
import BOM from '../string/bom';
import compareNodes from './compareNodes';
import getCaretPosNew from './getCaretPosNew';
import placeCaretAtEnd from './placeCaretAtEnd';
import whichChild from './whichChild';

const NOT_ONLY_BOMS_REG_EXP = new RegExp(`[^${BOM}]`);

export const USING_BOMS = false;

export default class RichInputHandler {
  private static INSTANCE: RichInputHandler;

  private listenerSetter: ListenerSetter;

  private lastNode: Node;
  private lastOffset: number;
  private savedRanges: WeakMap<HTMLElement, Range>;

  private log: ReturnType<typeof logger>;

  private inputCaptureCallbacks: Function[];

  constructor() {
    this.log = logger('RICH-INPUT');
    this.listenerSetter = new ListenerSetter();
    this.savedRanges = new WeakMap();

    this.listenerSetter.add(document)('selectionchange', this.saveSelectionOnChange);
    if(USING_BOMS) {
      this.listenerSetter.add(document)('focusout', this.onFocusOut);
      this.listenerSetter.add(document)('selectionchange', this.onSelectionChange);
      this.listenerSetter.add(document)('beforeinput', this.onBeforeInput);
      this.listenerSetter.add(document)('keydown', this.onKeyDown, {capture: true});

      if(IS_FIREFOX) {
        this.inputCaptureCallbacks = [];
        this.listenerSetter.add(document)('input', () => {
          this.inputCaptureCallbacks.forEach((callback) => callback());
          this.inputCaptureCallbacks.length = 0;
        }, {capture: true});
      }
    }
  }

  private get input() {
    const selection = document.getSelection();
    const {anchorNode: node} = selection;
    if(!node) return;
    return ((node as HTMLElement).closest ? node as HTMLElement : node.parentElement).closest<HTMLElement>('[contenteditable="true"]');
  }

  private saveRangeForElement(element: HTMLElement) {
    if(element && (element.isContentEditable || element.tagName === 'INPUT')) {
      const selection = document.getSelection();
      if(selection.rangeCount) {
        this.savedRanges.set(element as HTMLElement, document.getSelection().getRangeAt(0));
      }
    }
  }

  private saveSelectionOnChange = (e: Event) => {
    const element = document.activeElement as HTMLElement; // e.target as HTMLElement;
    this.saveRangeForElement(element);
  };

  private onFocusOut = (e: FocusEvent) => {
    this.lastNode = this.lastOffset = undefined;
  };

  private findPreviousSmthIndex(input: HTMLElement, node: ChildNode, something?: NodeListOf<Element>) {
    // node = this.getFiller(node);
    // const childNodes = Array.from(node.parentElement.childNodes);
    // fillerIndex = childNodes.indexOf(node);
    // let smthIndex = -1;
    // for(let i = fillerIndex; i >= 0; --i) {
    //   const node = childNodes[i];
    //   if((node as HTMLElement)?.classList?.contains('input-something')) {
    //     smthIndex = i;
    //     break;
    //   }
    // }
    // return smthIndex;

    const elements = Array.from(something ?? input.querySelectorAll('.input-something'));
    const index = elements.findIndex((element) => compareNodes(element, 0, node, 0) >= 0);
    return index === -1 ? elements.length - 1 : Math.max(0, index - 1);
  }

  private superMove(
    input: HTMLElement,
    caret: ReturnType<RichInputHandler['getCaretPosN']>,
    toLeft: boolean,
    fromSelectionChange: boolean
  ) {
    const {node, offset, move} = caret;
    const something = input.querySelectorAll('.input-something');
    const smthIndex = this.findPreviousSmthIndex(input, node, something);
    const r = document.createRange();
    r[toLeft ? 'setEnd' : 'setStart'](node, offset);

    if(fromSelectionChange) {
      move(toLeft);
    }

    const c = this.getCaretPosN();
    if(c.node?.nodeValue === BOM && (!fromSelectionChange || node === this.lastNode)) {
      const idx = this.findPreviousSmthIndex(input, c.node, something);

      let moved = !fromSelectionChange;

      do {
        const c = this.getCaretPosN();
        const idxidx = this.findPreviousSmthIndex(input, c.node, something);
        r[toLeft ? 'setStart' : 'setEnd'](c.node, c.offset);
        const rangeString = r.toString();
        const onlyBOMs = !NOT_ONLY_BOMS_REG_EXP.test(rangeString);
        this.log('test cursor', rangeString, onlyBOMs, idx, idxidx);
        if(
          onlyBOMs &&
          c.node?.nodeValue === BOM &&
          idxidx === idx &&
          // (idxidx > 1 || c.offset) &&
          // (idxidx < (getFiller(c.node).parentElement.childNodes.length - 2) || c.offset < BOM.length)
          (idxidx || c.offset) &&
          (idxidx < (something.length - 1) || c.offset < BOM.length)
        ) {
          move(toLeft);
          moved = true;
        } else if(!moved) {
          break;
        } else {
          if((!this.getFiller(node as HTMLElement).classList.contains('input-filler-text') && idx !== smthIndex) || c.offset === BOM.length) {
            move(!toLeft);
          }

          break;
        }
      } while(true);
    }
  }

  private onSelectionChange = (e: Event) => {
    const {input} = this;
    if(!input) {
      this.setSelectionClassName(document.getSelection());
      return;
    }

    // return;

    // this.log('selectionchange', document.getSelection(), document.getSelection().rangeCount && document.getSelection().getRangeAt(0), getCaretPosN());
    // let {node, offset} = getCaretPos(this.messageInput);

    let caret = this.getCaretPosN();
    do {
      const {node, offset, selection, move} = caret;

      const nodeValue = node?.nodeValue;
      // if(!nodeValue?.includes(BOM)) {
      if(nodeValue !== BOM || !this.lastNode) {
        break;
      }

      // node = getFiller(node);

      // const childIndex = whichChild(getFiller(node), true);
      // let toLeft: boolean;
      // // if(node === lastNode) toLeft = lastOffset >= offset;
      // if(node === lastNode) toLeft = lastOffset > offset;
      // else {
      //   // toLeft = whichChild(getFiller(lastNode)) > childIndex;
      //   toLeft = (lastNode.nodeValue === BOM ? whichChild(getFiller(lastNode), true) : whichChild(findUpAsChild(lastNode as any, getFiller(node).parentElement), true)) > childIndex;
      // }

      const toLeft = compareNodes(node, offset, this.lastNode as ChildNode, this.lastOffset) < 0;

      // const childNodes = Array.from(node.parentElement.childNodes);
      // if(toLeft) {
      //   for(let i = childIndex; i >= 0; --i) {
      //     const sibling = childNodes[i];
      //     const {textContent} = sibling;
      //     for()
      //   }
      // }

      // {
      //   if(toLeft === undefined) {
      //     return;
      //   }

      //   const selection = window.getSelection();
      //   selection.modify(selection.isCollapsed ? 'move' : 'extend', toLeft ? 'backward' : 'forward', 'character');
      //   return;
      // }

      // const parent = getFiller(node);
      if(toLeft !== undefined) {
        // let newNode = toLeft ? parent.previousSibling : parent.nextSibling;
        if(selection.isCollapsed) {
          this.superMove(input, caret, toLeft, true);

          // if(offset === BOM.length) {
          //   newNode = toLeft ? newNode.nextSibling.nextSibling : parent.previousSibling.previousSibling;
          // }

          // setCaretAt(newNode);
        } else {
          selection.modify(selection.isCollapsed ? 'move' : 'extend', toLeft ? 'backward' : 'forward', 'character');
          // const range = selection.getRangeAt(0);

          // if(toLeft) {
          //   newNode = parent.previousSibling.previousSibling.firstChild;
          //   const value = newNode.nodeValue;
          //   range.setStart(newNode, value?.length);
          // } else {
          //   newNode = parent.nextSibling.nextSibling.firstChild;
          //   range.setEnd(newNode, 0);
          // }
        }
      }

      this.log('selectionchange',
        node,
        offset,
        this.lastNode,
        this.lastOffset,
        node === this.lastNode,
        whichChild(this.getFiller(node)),
        whichChild(this.getFiller(this.lastNode)),
        toLeft,
        selection,
        document.getSelection(),
        document.getSelection().getRangeAt(0),
        node?.parentNode,
        this.lastNode?.parentNode
      );

      caret = this.getCaretPosN();
      this.lastNode = node;
      this.lastOffset = offset;

      break;

      // if(findPreviousSmthIndex(caret.node) !== smthIndex) {
      //   break;
      // }
    } while(true);

    this.lastNode = this.lastOffset = undefined;

    // if(offset === BOM.length) {
    //   setCaretAt(parent);
    // } else {
    //   setCaretAt(parent.nextSibling);
    // }

    this.setSelectionClassName(caret.selection, input);
  };

  public restoreSavedRange(input: HTMLElement) {
    const range = this.getSavedRange(input);
    if(!range) {
      return false;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  }

  public getSavedRange(input: HTMLElement) {
    return this.savedRanges.get(input);
  }

  public makeFocused(input: HTMLElement) {
    if(document.activeElement !== input && !this.restoreSavedRange(input)) {
      placeCaretAtEnd(input, false, false);
    }
  }

  private fixInsertedLineBreaks(input: HTMLElement) {
    input.querySelectorAll('br').forEach((br) => {
      br.classList.add('br-not-br');
    });
  }

  private fixBuggedCaret() {
    const selection = document.getSelection();
    const range = selection.getRangeAt(0);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  public onBeforeInput = (e: Pick<InputEvent, 'inputType'>) => {
    const {input, log} = this;
    if(!input) {
      return;
    }

    const addInputCallback = this.addInputCallback.bind(this, input);

    const caretPos = this.getCaretPosN();
    let {node, offset, selection, move} = caretPos;
    log('beforeinput', e, node, offset, selection, caretPos);
    this.lastNode = this.lastOffset = undefined;

    if(e.inputType.startsWith('delete')) { // delete current BOM
      addInputCallback(() => {
        this.processEmptiedFillers(input);
        this.removeExtraBOMs(input);
        this.fixInsertedLineBreaks(input);
      });

      if(node?.nodeValue === BOM && selection.isCollapsed && e.inputType.includes('deleteContent')) {
        const toLeft = e.inputType.includes('Backward');
        const moveFirst = (offset === BOM.length && toLeft) || (!offset && !toLeft);
        this.superMove(input, caretPos, toLeft, moveFirst);
        // if((offset === BOM.length && toLeft) || (!offset && !toLeft)) {
        //   move(toLeft);
        // }

        // addInputCallback(() => {
        //   removePossibleBOMSiblingsByNode(getFiller(node));
        // });

        // if(node.parentNode.childNodes.length === 1) {
        //   (node.parentNode as HTMLElement).remove();
        //   move(e.inputType.includes('Backward') ? false : true);
        // } else {
        //   move(e.inputType.includes('Backward') ? true : false);
        //   addInputCallback(() => {
        //     move(e.inputType.includes('Backward') ? false : true);
        //   });
        // }

        // for(let i = 0, length = BOM.length + (direction === 'backward' ? offset : BOM.length - offset); i < length; ++i) {
        //   selection.modify('extend', direction, 'character');
        // }

        // selection.modify('extend', direction, 'character');
        // selection.modify('extend', direction, 'character');

        // selection.deleteFromDocument();
        // e.preventDefault();
      } else {
        // const filler = getFiller(node);
        // if(filler?.classList?.contains('input-filler-text')) {
        //   const {previousSibling, nextSibling} = filler;
        //   addInputCallback(() => {
        //     if(!filler.isConnected) {
        //       removePossibleBOMSiblings(previousSibling, nextSibling);
        //     }
        //     // removeExtraBOMs();
        //     // processEmptiedFillers();
        //   });
        // }
        // addInputCallback(() => {
        //   this.fixInsertedLineBreaks(input);
        // });
      }
    } else if(e.inputType.startsWith('insert')) { // clear current BOM
      if((node as HTMLElement)?.classList?.contains('input-something')/*  || (node.textContent === BOM && offset === BOM.length) */) {
        node = node.previousSibling.firstChild;
        const range = selection.getRangeAt(0);
        range.setStart(node, 0);
        range.setEnd(node, 0);
        range.collapse(true);
        // selection.modify('move', 'backward', 'character');

        const c = this.getCaretPosN();
        node = c.node;
        selection = c.selection;
        offset = c.offset;
      }
      if(node && node.textContent === BOM && offset === BOM.length) {
        // const range = selection.getRangeAt(0);
        // range.setStart(node, 0);
        // range.setEnd(node, 0);
        // range.collapse(true);
        selection.modify('move', 'backward', 'character');

        const c = this.getCaretPosN();
        node = c.node;
        selection = c.selection;
        offset = c.offset;
      }
      // if(node && node.textContent === BOM && offset === 0) {
      //   selection.modify('move', 'forward', 'character');
      //   offset = BOM.length;
      // }

      if(e.inputType === 'insertLineBreak' || true) {
        // const appendix = 'X';
        // const textNode = document.createTextNode(appendix);
        // if(node.parentElement !== this.messageInput) node.parentElement.after(textNode);
        // else node.after(textNode);
        // selection.modify('move', 'forward', 'character');
        // selection.modify('move', 'forward', 'character');
        // addInputCallback(() => {
        //   textNode.remove();
        // });

        /* if(node?.nodeValue === BOM) */ {
          // const parent = node.parentElement;
          // parent.contentEditable = 'false';
          // addInputCallback(() => {
          //   parent.contentEditable = 'inherit';
          // });
          // node.parentElement.remove();

          // const textNode = document.createTextNode(appendix);
          // if(node.parentElement !== this.messageInput) node.parentElement.after(textNode);
          // else node.after(textNode);
          // // selection.modify('move', 'forward', 'character');
          // // selection.modify('move', 'forward', 'character');
          // addInputCallback(() => {
          //   textNode.remove();
          // });

          // fix case when focused somehow on span instead of text node
          if(node && node.nodeType === node.ELEMENT_NODE) {
            node = node.firstChild;
            log.warn('fixing focus on span');
          }

          const isBOM = node?.nodeValue === BOM;
          log('inserting line break', isBOM, node, `"${node?.nodeValue}"`, node?.parentElement ? Array.from(node.parentElement.childNodes).slice() : []);
          if(isBOM) {
            // (node as ChildNode).replaceWith(this.messageInput.querySelector('.lol'));

            const parentElement = node.parentElement;
            parentElement.classList.replace('input-filler', 'input-filler-text');
            const childNodesLength = parentElement.childNodes.length;
            addInputCallback(() => {
              const newChildNodesLength = parentElement.childNodes.length;
              if(newChildNodesLength > 1/*  && newChildNodesLength !== childNodesLength */) {
                log('inserting line break, remove');
                node = Array.from(parentElement.childNodes).find((node) => node.nodeValue === BOM);
                (parentElement as any).t = node;
                // node?.remove();

                // const n = parentElement.firstChild;
                // const range = selection.getRangeAt(0);
                // range.setStart(n, n.nodeValue.length);
                // range.setEnd(n, n.nodeValue.length);
              } else if(node.nodeValue !== BOM) {
                log('inserting line break, deleteData');
                (node as CharacterData).deleteData(node.nodeValue.indexOf(BOM), BOM.length);
                // node = document.createTextNode(BOM);
              }

              this.fixInsertedLineBreaks(input);
              // (parentElement as any).t = node;
              // node.remove();
            });
            // addInputCallback(() => {
            //   node.parentElement.classList.replace('input-filler', 'input-filler3');
            //   const s = document.createElement('span');
            //   s.style.display = 'none';
            //   node.replaceWith(s);
            //   s.prepend(node);
            // });
          } else if(e.inputType === 'insertLineBreak') {
            addInputCallback(() => {
              this.fixInsertedLineBreaks(input);
            });
            // const range = selection.getRangeAt(0);
            // this.messageInput.querySelectorAll<HTMLElement>('.input-something').forEach((el) => {
            //   el.contentEditable = 'inherit';
            // });

            // addInputCallback(() => {
            //   this.messageInput.querySelectorAll<HTMLElement>('.input-something').forEach((el) => {
            //     el.contentEditable = 'false';
            //   });

            //   selection.removeAllRanges();
            //   selection.addRange(range);
            // }, false);
          }/*  else if(node &&
            node.nodeType === node.TEXT_NODE &&
            node.nodeValue.length === offset) {

          } */

          // if(e.inputType === 'insertLineBreak') {
          //   e.preventDefault();
          //   document.execCommand('insertHTML', false, '<span class="lol">\n</span>');

          //   this.messageInputField.simulateInputEvent();
          // }

          // node.parentElement.replaceWith(node);
          // selection.removeAllRanges();
          // const range = new Range();
          // range.setStart(node, 0);
          // range.setEnd(node, node.nodeValue.length);
          // selection.addRange(range);
          // node.parentElement.classList.remove('input-filler');
          // node.parentElement
        }

        // document.execCommand('insertHTML', false, '\n');
        // e.preventDefault();
        // (node as CharacterData).deleteData(node.nodeValue.indexOf(BOM), BOM.length);
        // if(node?.nodeValue === BOM) {
        //   addInputCallback(() => {
        //     node.remove();
        //   });
        // }
        // this.messageInputField.simulateInputEvent();

        // this.messageInput.querySelectorAll<HTMLElement>('.input-something').forEach((el) => {
        //   el.contentEditable = 'inherit';
        // });
        // addInputCallback(() => {
        //   this.messageInput.querySelectorAll<HTMLElement>('.input-something').forEach((el) => {
        //     el.contentEditable = 'false';
        //   });
        // });
        return;
      }

      if(node?.nodeValue === BOM) {
        // node.nodeValue = ''; // ! will move cursor forward
        // addInputCallback(() => {
        //   (node as CharacterData).deleteData(node.nodeValue.indexOf(BOM), BOM.length);
        // });

        if(e.inputType === 'insertLineBreak') {
          if(offset === BOM.length) {
            selection.modify('move', 'backward', 'character');
          }

          // if(offset !== BOM.length) {
          //   selection.modify('move', 'forward', 'character');
          // }

          addInputCallback(() => {
            node.remove();
            // (node as CharacterData).deleteData(node.nodeValue.indexOf(BOM), BOM.length);
            // selection.modify('move', 'forward', 'character');

            setTimeout(() => {
              selection.modify('move', 'forward', 'character');
            }, 0);
          });
        }

        // node.parentElement.replaceWith(node);

        // node.parentElement.replaceWith(node);
        if(e.inputType === 'insertLineBreak') {
          // const previousParentSibling = node.parentNode.previousSibling;
          // addInputCallback(() => {
          //   if(previousParentSibling.nextSibling.nodeValue === '\n') {
          //     previousParentSibling.nextSibling.remove();

          //     setTimeout(() => {
          //       // selection.modify('move', 'forward', 'character');
          //       // selection.modify('move', 'forward', 'character');
          //     }, 0);
          //   } else {
          //     previousParentSibling.nextSibling.nodeValue = previousParentSibling.nextSibling.nodeValue.replace('\n\n', '\n');
          //   }
          // });
        } else {
          // if(node.parentElement !== this.messageInput) {
          //   node.parentElement.replaceWith(node);
          // }

          // setTimeout(() => {
          //   this.log(JSON.stringify(node.parentElement.innerHTML));
          //   node.nodeValue = node.nodeValue.replace(BOM, '');
          //   // (node as CharacterData).deleteData(node.nodeValue.indexOf(BOM), BOM.length);
          //   this.log(JSON.stringify(node.parentElement.innerHTML));
          // }, 1000);

          addInputCallback(() => {
            (node as CharacterData).deleteData(node.nodeValue.indexOf(BOM), BOM.length);
            if(!node.nodeValue) {
              node.remove();
            }

            // selection.modify('move', 'forward', 'character');
          });
        }

        if(selection.isCollapsed && false) {
          node.parentElement.replaceWith(node);
          // const textNode = document.createTextNode(BOM);
          // (node.parentNode as any as ChildNode).after(textNode);
          // setCaretAt(textNode.nextSibling);
          // selection.modify('move', 'forward', 'character');
          node.remove();
          // (node as CharacterData).deleteData(node.nodeValue.indexOf(BOM), BOM.length);
          // selection.modify('move', 'forward', 'character');
          // selection.collapseToEnd();

          // addInputCallback(() => {
          //   (textNode as CharacterData).deleteData(textNode.nodeValue.indexOf(BOM), BOM.length);
          //   node.parentElement.remove();
          // });
        }
      } else if(e.inputType === 'insertLineBreak' &&
        node &&
        node.nodeType === node.TEXT_NODE &&
        node.nodeValue.length === offset) {
        log('inserting line break');
        // const appendix = '\x01';

        input.querySelectorAll<HTMLElement>('.input-something').forEach((el) => {
          el.contentEditable = 'inherit';
        });
        addInputCallback(() => {
          input.querySelectorAll<HTMLElement>('.input-something').forEach((el) => {
            el.contentEditable = 'false';
          });
        });

        // const textNode = document.createTextNode(appendix);
        // if(node.parentElement !== this.messageInput) node.parentElement.after(textNode);
        // else node.after(textNode);
        // // selection.modify('move', 'forward', 'character');
        // addInputCallback(() => {
        //   textNode.remove();
        // });

        // const offset = node.nodeValue.length;
        // (node as CharacterData).insertData(offset, appendix);
        // addInputCallback(() => {
        //   selection.modify('move', 'forward', 'character');
        //   (node as CharacterData).deleteData(node.nodeValue.indexOf(appendix), appendix.length);
        //   if(!node.nodeValue) {
        //     node.remove();
        //   }
        // });
      }
    } else if(e.inputType === 'historyUndo') { // have to remove extra BOMs
      addInputCallback(() => {
        this.processFilledFillers(input);
        this.processEmptiedFillers(input);
        this.removeExtraBOMs(input);
        this.removeEmptyTextNodes(input);

        // ! lol what, caret will be at the wrong position, have to set it to the same
        this.fixBuggedCaret();

        // lol
        // this.messageInput.querySelectorAll('.has-text').forEach((el) => {
        //   if(el.textContent === BOM) {
        //     el.firstElementChild.replaceWith(el.firstElementChild.firstChild);
        //     el.classList.replace('input-filler3', 'input-filler');
        //   }
        // });
      });
    } else if(e.inputType === 'historyRedo') {
      // if(node?.nodeValue === BOM && offset === BOM.length) {
      //   selection.modify('move', 'backward', 'character');
      // }

      addInputCallback(() => {
        this.processFilledFillers(input);
        this.processEmptiedFillers(input);

        // fix contenteditable attribute
        input.querySelectorAll<HTMLElement>('.input-something:not([contenteditable])').forEach((el) => {
          el.contentEditable = 'false';
        });

        this.removeExtraBOMs(input);

        // ! lol what, caret will be at the wrong position, have to set it to the same
        this.fixBuggedCaret();
      });
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const key = e.key;

    // // have to ignore line up and down
    if(key === 'ArrowDown' || key === 'ArrowUp') {
      this.lastNode = this.lastOffset = undefined;
    } else {
      const {node, offset} = this.getCaretPosN();
      this.lastNode = node/* getFiller(node) */, this.lastOffset = offset;
      if(this.lastNode === this.input) {
        this.lastNode = this.lastOffset = undefined;
      }
    }

    this.log('keydown', this.lastNode, this.lastNode?.parentNode, this.lastOffset, this.getCaretPosN(), e);
  };

  private addInputCallback(input: HTMLElement, callback: () => void, capture = true) {
    const newCallback = () => {
      this.log('input modify callback');
      callback();
    };

    if(capture && IS_FIREFOX) this.inputCaptureCallbacks.push(newCallback);
    else this.listenerSetter.add(input)('input', newCallback, {once: true, capture});
  }

  public removeExtraBOMs(input: HTMLElement) {
    const c = (sibling: ChildNode) => {
      return (sibling as HTMLElement)?.classList?.contains('input-something');
    };

    input.querySelectorAll('.input-filler').forEach((el) => {
      const {previousSibling, nextSibling} = el;
      let needed = false;

      // if(!(previousSibling as HTMLElement)?.classList?.contains('input-filler') && isCustomFillerNeededBySiblingNode(previousSibling)) {
      if(!(nextSibling as HTMLElement)?.classList?.contains('input-filler') && isCustomFillerNeededBySiblingNode(nextSibling)) {
        needed = c(previousSibling) || c(nextSibling);
      }

      if(!needed) {
        this.log.warn('removing empty bom node', el);
        el.remove();
      }
    });
  }

  private getFiller(node: Node) {
    return node && node.nodeType === node.TEXT_NODE && node.parentElement !== this.input ? node.parentElement : node as HTMLElement;
  }

  private getCaretPosN() {
    const ret = getCaretPosNew(this.input);
    // const {node} = ret;
    // if((node as HTMLElement)?.classList?.contains('input-something')) {
    //   ret.node = node.previousSibling;
    //   ret.offset = ret.node.textContent.length;
    // }

    return {...ret, move: this.move.bind(this, ret.selection)};
  }

  private removeEmptyTextNodes(input: HTMLElement) {
    const {log} = this;
    // let i = -1;
    // remove empty text nodes
    const treeWalker = document.createTreeWalker(
      input,
      NodeFilter.SHOW_TEXT,
      {acceptNode: (node) => node.parentElement === input && !node.nodeValue/*  && !++i */ ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT}
    );

    let textNode: Text;
    while(textNode = treeWalker.nextNode() as Text) {
      log.warn('removing empty text node', textNode);
      textNode.remove();
    }
  }

  private removePossibleBOMSiblings(previousSibling: ChildNode, nextSibling: ChildNode) {
    [previousSibling, nextSibling].forEach((sibling) => {
      if((sibling as HTMLElement)?.classList?.contains('input-filler')) {
        sibling.remove();
      }
    });
  }

  private removePossibleBOMSiblingsByNode(node: ChildNode) {
    const {previousSibling, nextSibling} = node;
    this.removePossibleBOMSiblings(previousSibling, nextSibling);
  };

  private processEmptiedFillers(input: HTMLElement) {
    input.querySelectorAll<HTMLElement>('.input-filler-text').forEach((el) => {
      this.removeExtraBOMs(el);

      let cleanSiblings = true;
      if(!el.textContent) {
        el.classList.replace('input-filler-text', 'input-filler');

        const textNode = Array.from(el.childNodes).find((node) => node.nodeType === node.TEXT_NODE);
        if(textNode) {
          (textNode as CharacterData).insertData(0, BOM);
        } else if(((el as any).t as ChildNode)?.nodeValue) {
          el.append((el as any).t);
        } else {
          el.append(document.createTextNode(BOM));
        }
      } else if(!NOT_ONLY_BOMS_REG_EXP.test(el.textContent) && !el.querySelector('.input-something')) {
        el.classList.replace('input-filler-text', 'input-filler');
      } else {
        cleanSiblings = false;
      }

      if(cleanSiblings) {
        this.removePossibleBOMSiblingsByNode(el);
      }
    });
  }

  private processFilledFillers(input: HTMLElement) {
    // remove the BOM when changing to text
    input.querySelectorAll('.input-filler').forEach((el) => {
      if(el.textContent !== BOM) {
        el.classList.replace('input-filler', 'input-filler-text');
        const t = (el as any).t as ChildNode;
        const bomNode = Array.from(el.childNodes).find((node) => node.nodeType === node.TEXT_NODE && node.nodeValue.includes(BOM));
        if(bomNode && !t?.nodeValue) {
          const idx = bomNode.nodeValue.indexOf(BOM);
          if(idx !== -1) {
            (bomNode as CharacterData).deleteData(idx, BOM.length);
          }
        }

        // t?.remove();
      }
    });
  }

  private setSelectionClassName(selection: Selection, input?: HTMLElement) {
    // Array.from(this.messageInput.querySelectorAll('.selection')).forEach((element) => {
    //   element.classList.remove('selection');
    // });

    if(selection.rangeCount) {
      const range = selection.getRangeAt(0);

      if(input) {
        Array.from(input.querySelectorAll('.input-selectable')).forEach((element) => {
          element.classList.toggle('selection', !range.collapsed && range.intersectsNode(element));
        });
      } else {
        Array.from(document.querySelectorAll('.input-selectable.selection')).forEach((element) => element.classList.remove('selection'));
      }
    }
  }

  private move(selection: Selection, left: boolean) {
    const {focusNode: focusNodeBefore, focusOffset: focusOffsetBefore} = selection;
    selection.modify('extend', left ? 'backward' : 'forward', 'character');
    // if(offset === nodeValue.length) {
    //   selection.modify('extend', !left ? 'backward' : 'forward', 'character');
    // }
    if(left) selection.collapseToStart();
    else selection.collapseToEnd();
    const {focusNode: focusNodeAfter, focusOffset: focusOffsetAfter} = selection;
    this.log(
      'moving cursor',
      left,
      focusNodeBefore,
      focusNodeBefore.nodeType === focusNodeBefore.ELEMENT_NODE ? focusNodeBefore : focusNodeBefore.parentElement,
      focusOffsetBefore,
      focusNodeAfter,
      focusNodeAfter.nodeType === focusNodeAfter.ELEMENT_NODE ? focusNodeAfter : focusNodeAfter.parentElement,
      focusOffsetAfter
    );
  }

  public prepareApplyingMarkdown() {
    const {input} = this;

    // do not wrap fillers into spans
    const fillers = input.querySelectorAll<HTMLElement>('.input-filler');
    // fillers.forEach((el) => {
    //   el.contentEditable = 'false';
    // });

    const smths = input.querySelectorAll<HTMLElement>('.input-something');
    smths.forEach((el) => {
      el.contentEditable = 'inherit';
    });

    return () => {
      fillers.forEach((el) => {
        el.contentEditable = 'inherit';
      });

      smths.forEach((el) => {
        el.contentEditable = 'false';
      });

      this.removeExtraBOMs(input);
    };
  }

  public static getInstance() {
    return this.INSTANCE ??= new RichInputHandler();
  }
}
