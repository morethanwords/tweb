/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import InputField from '../inputField';

export default interface Monkey {
  attachToInputField: (inputField: InputField) => void;
}
