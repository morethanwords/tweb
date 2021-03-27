import Modes from "./modes";

export const DEBUG = process.env.NODE_ENV !== 'production' || Modes.debug;
const ctx: any = typeof(window) !== 'undefined' ? window : self;
export const MOUNT_CLASS_TO: any = DEBUG/*  && false */ ? ctx : {};
export default DEBUG;

//let m = DEBUG;
if(!DEBUG/*  || true */) {
  ctx.sandpitTurtle = () => {
    //if(!m) {
      for(let i in MOUNT_CLASS_TO) {
        ctx[i] = MOUNT_CLASS_TO[i];
      }
      //m = true;
    //}
  
    //DEBUG = !DEBUG;
  };
}

/* export const superDebug = (object: any, key: string) => {
  var d = object[key];
  var beforeStr = '', afterStr = '';
  for(var r of d) {
    beforeStr += r.before.hex + '\n';
    afterStr += r.after.hex + '\n';
  }

  beforeStr = beforeStr.trim();
  afterStr = afterStr.trim();
  //var beforeStr = d.map(r => r.before.hex).join('\n');
  //var afterStr = d.map(r => r.after.hex).join('\n');

  var dada = (name: string, str: string) => {
    var a = document.createElement('a');
    a.target = '_blank';
    a.download = name + '.txt';
    a.href = URL.createObjectURL(new Blob([str], {
      type: 'text/plain'
    }));
    document.body.append(a);
    a.click();
  };

  dada(key + '_' + 'before', beforeStr);
  dada(key + '_' + 'after', afterStr);
}

MOUNT_CLASS_TO.superDebug = superDebug; */
