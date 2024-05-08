export const DEEP_PATH_JOINER = '\x01';

export function joinDeepPath(...args: any[]) {
  return args.join(DEEP_PATH_JOINER);
}

export function splitDeepPath(path: string) {
  return path.split(DEEP_PATH_JOINER);
}

export default function setDeepProperty(
  object: any,
  key: string,
  value?: any,
  deleteIfUndefined?: boolean
) {
  const splitted = key.split(DEEP_PATH_JOINER);
  const length = splitted.length;
  let lastObject = object/* , fractalPart: string */; // fix fractal number key
  for(let i = 0; i < length - 1; ++i) {
    const part = splitted[i];
    // if(fractalPart) {
    //   part = fractalPart + '.' + part;
    //   fractalPart = undefined;
    // } else if(!Number.isNaN(+part)) {
    //   fractalPart = part;
    //   continue;
    // }
    lastObject = lastObject[part] ??= {};
  }

  const lastKey = /* (fractalPart ? fractalPart + '.' : '') +  */splitted[length - 1];
  if(value === undefined && deleteIfUndefined/*  && arguments.length === 2 */) {
    delete lastObject[lastKey];
  } else {
    lastObject[lastKey] = value;
  }
}
