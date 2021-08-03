/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";

export default class AppAddContactTab extends SliderSuperTab {
  protected init() {
    this.container.classList.add('add-contact-container');
    this.setTitle('AddContactTitle');
  }
}
