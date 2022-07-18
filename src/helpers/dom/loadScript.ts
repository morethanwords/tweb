/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function loadScript(url: string) {
  const script = document.createElement('script');
  const promise = new Promise<HTMLScriptElement>((resolve) => {
    script.onload = script.onerror = () => {
      resolve(script);
    };
  });
  script.src = url;
  document.body.appendChild(script);
  return promise;
}
