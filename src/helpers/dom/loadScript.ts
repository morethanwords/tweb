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
