import {render} from 'solid-js/web';

import IconLibrary from './iconLibrary';

export function showIconLibrary() {
  const div = document.createElement('div');
  document.body.append(div);
  const dispose = render(() => <IconLibrary />, div);

  (window as any)['closeIcons'] = () => {
    dispose();
    div.remove();
  };
}
