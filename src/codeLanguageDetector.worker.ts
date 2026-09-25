import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

import {
  CodeLanguageDetectionRequest,
  CodeLanguageDetectionResponse,
  getCodeLanguageHint
} from '@/codeLanguageDetectorShared';

const languages = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  graphql,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml
};

for(const language in languages) {
  hljs.registerLanguage(language, languages[language as keyof typeof languages]);
}

self.addEventListener('message', (event: MessageEvent<CodeLanguageDetectionRequest>) => {
  const {id, code} = event.data;
  let language = getCodeLanguageHint(code);

  if(!language) {
    try {
      language = hljs.highlightAuto(code).language;
    } catch(error) {
      console.error('Code language detection error', error);
    }
  }

  const response: CodeLanguageDetectionResponse = {id, language};
  self.postMessage(response);
});
