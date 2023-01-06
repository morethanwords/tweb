/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Database} from '.';

const DATABASE_SESSION: Database<'session'> = {
  name: 'telegram',
  version: 1,
  stores: [{
    name: 'session'
  }]
};

export default DATABASE_SESSION;
