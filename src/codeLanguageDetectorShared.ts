export type CodeLanguageDetectionRequest = {
  id: number,
  code: string
};

export type CodeLanguageDetectionResponse = {
  id: number,
  language?: string
};

const LANGUAGE_HINTS: Array<[language: string, pattern: RegExp]> = [
  ['php', /<\?php\b/],
  ['rust', /(?:^|\n)\s*(?:fn\s+main\s*\(|use\s+(?:crate|std)::|let\s+mut\b)|\b(?:println|eprintln)!\s*\(/],
  ['go', /(?:^|\n)\s*package\s+main\b|(?:^|\n)\s*func\s+\w+\s*\(|\bfmt\.(?:Print|Printf|Println)\s*\(/],
  ['cpp', /#include\s*<[^>]+>|\bstd::|\b(?:cout|cin)\s*(?:<<|>>)/],
  ['csharp', /(?:^|\n)\s*using\s+System\s*;|\bConsole\.(?:Write|WriteLine)\s*\(/],
  ['java', /\bpublic\s+static\s+void\s+main\s*\(|\bSystem\.out\.print(?:ln)?\s*\(/],
  ['typescript', /(?:^|\n)\s*(?:interface\s+\w+|type\s+\w+\s*=|enum\s+\w+)|\b(?:const|let|var)\s+\w+\s*:\s*[A-Za-z_$]/],
  ['javascript', /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|=>|\bconsole\.(?:log|warn|error)\s*\(/],
  ['python', /(?:^|\n)\s*(?:def|from|import)\s+[A-Za-z_]|(?:^|\n)\s*class\s+\w+\s*(?:\([^)]*\))?\s*:|\bprint\s*\([^;{}]*\)\s*$/m],
  ['sql', /(?:^|\n)\s*(?:SELECT|WITH|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE)\b/i],
  ['bash', /^#!\s*\/[^\n]*\b(?:ba|z|k)?sh\b|(?:^|\n)\s*(?:export\s+\w+=|echo\s+\$|(?:ba|z|k)?sh\s+)/],
  ['xml', /<\/?(?:html|body|head|div|span|script|style|svg|[A-Za-z][\w:-]*\s+[\w:-]+=)[^>]*>/i]
];

export function getCodeLanguageHint(code: string) {
  for(const [language, pattern] of LANGUAGE_HINTS) {
    if(pattern.test(code)) return language;
  }
}
