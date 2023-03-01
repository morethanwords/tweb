/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function parseUriParams(uri: string, splitted = uri.split('?')) {
  return parseUriParamsLine(splitted?.[1]);
}

export function parseUriParamsLine(line: string) {
  const params: any = {};
  if(!line) {
    return params;
  }

  line.split('&').forEach((item) => {
    params[item.split('=')[0]] = decodeURIComponent(item.split('=')[1]);
  });

  return params;
}
