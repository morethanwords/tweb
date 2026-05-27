import {copyTextToClipboard} from '@helpers/clipboard';
// import SelectionSaver from "@helpers/selectionSaver";
// import selectElementContents from "@helpers/dom/selectElementContents";

export default function copyFromElement(element: HTMLElement) {
  copyTextToClipboard(element.textContent);
  // const saver = new SelectionSaver();
  // saver.save();
  // selectElementContents(element);
  // document.execCommand('copy');
  // saver.restore();
}
