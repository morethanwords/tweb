export default function parseUriParams(uri: string, splitted = uri.split('?')) {
  try {
    const url = new URL(uri);
    const obj: any = {};
    for(const [key, value] of url.searchParams.entries()) {
      obj[key] = value;
    }

    return obj;
  } catch(err) {
    return parseUriParamsLine(splitted?.[1]);
  }
}

export function parseUriParamsLine(line: string) {
  const params: any = {};
  if(!line) {
    return params;
  }

  line.split('&').forEach((item) => {
    const [key, value = ''] = item.split('=');
    // * a value with a malformed escape (`%zz` - anyone can write one into a link) stays as written,
    // * instead of throwing away every other parameter of the line, and the start of the app reading them
    params[key] = tryDecodeURIComponent(value);
  });

  return params;
}

/** `decodeURIComponent`, or the string as it came when an escape in it is malformed (`%zz`) */
export function tryDecodeURIComponent(str: string) {
  try {
    return decodeURIComponent(str);
  } catch(err) {
    return str;
  }
}
