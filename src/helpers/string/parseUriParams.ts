/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

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
    params[key] = decodeURIComponent(value);
  });

  return params;
}
