import {onMount} from 'solid-js';
import {EmoticonsDropdown} from '../../emoticonsDropdown';
import rootScope from '../../../lib/rootScope';

export const MediaEditorStickersSettings = () => {
  let element: HTMLDivElement;

  onMount(() => {
    const mmp = new EmoticonsDropdown({
      mediaEditor: true,
      customParentElement: element,
      customOnSelect: em => console.info('em', em),
      mediaEditorSelect: async(val, doc) => {
        console.info('val', val);
        const gr = await rootScope.managers.appDocsManager.getDoc(doc);
        console.info(gr);
      }
    });
    mmp.toggle(true);
  })

  return <div class='stickers-container' ref={element}></div>
}
