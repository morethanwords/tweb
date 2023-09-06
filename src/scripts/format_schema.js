/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

let json = require(__dirname + '/in/schema');

let top = {};
/* ['MTProto', 'API'].forEach(key => {
  let schema = json[key];
  let out = {constructors: {}, methods: {}};

  ['constructors', 'methods'].forEach(key => {
    schema[key].forEach(smth => {
      let id = smth.id;

      if(id < 0) {
        id = +id + 4294967296;
      }

      out[key][id] = smth;
      delete smth.id;
    });
  });

  top[key] = out;

  //console.log(out);
  //process.exit(0);
}); */

function uintToInt(val) {
  if(val > 2147483647) {
    val = val - 4294967296;
  }

  return val;
}

['MTProto', 'API'].forEach(key => {
  let schema = json[key];

  ['constructors', 'methods'].forEach(key => {
    schema[key].forEach(smth => {
      /* if(+smth.id < 0) {
        smth.id = +smth.id + 4294967296;
      } */
      smth.id = uintToInt(+smth.id);
    });
  });

  //console.log(out);
  //process.exit(0);
});
top = json;

/* ['API'].forEach(key => {
  let schema = json[key];
  let out = {constructors: {}, methods: {}};

  ['constructors', 'methods'].forEach(key => {
    schema[key].forEach(smth => {
      let id = smth.id;

      if(id < 0) {
        id = id + 4294967296;
      }

      out[key][id] = smth;
      delete smth.id;
    });
  });

  top[key] = out;

  //console.log(out);
  //process.exit(0);
}); */

//console.log(out);

require('fs').writeFileSync(__dirname + '/out/schema.json', JSON.stringify(top/* , null, '\t' */));