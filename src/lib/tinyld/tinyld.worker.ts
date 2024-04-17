import {detect} from 'tinyld';

self.addEventListener('message', (event) => {
  const {text} = event.data;
  let lang = '';
  try {
    lang = detect(text);
  } catch(err) {
    console.error('language detection error', err);
  }

  self.postMessage({lang});
});
