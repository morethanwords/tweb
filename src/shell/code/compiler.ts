import ts from 'typescript-browser';
import standardLibrary from './generated/standard-library';
import type {CodeDiagnostic, CodeRequest} from './contracts';

export function compile(request: Omit<CodeRequest, 'signal'>): {javascript?: string; diagnostics: CodeDiagnostic[]} {
  const scopes = new Map<string, string[]>();
  for(const scope of ['user', 'conversation', 'run', 'bot', 'event', 'system']) scopes.set(scope, []);
  for(const [path, type] of Object.entries(request.variableTypes ?? {})) {
    const [scope, name] = path.split('.');
    scopes.get(scope)?.push(`readonly ${JSON.stringify(name)}: ${type === 'json' ? 'ReadonlyJsonValue' : type}`);
  }
  const declarations = `type ReadonlyJsonValue = null | boolean | number | string | ReadonlyArray<ReadonlyJsonValue> | {readonly [key:string]:ReadonlyJsonValue};
  type JsonValue = null | boolean | number | string | JsonValue[] | {[key:string]:JsonValue};
  type RoboContext = {${[...scopes].map(([scope, fields]) => `readonly ${scope}: {${fields.join(';')}}`).join(';')}};
  type Outcome = ${request.outcomes.map(value => JSON.stringify(value)).join(' | ')};
  type CodeResult = {outcome: Outcome; data?: JsonValue};`;
  const parsed = ts.createSourceFile('/bot.ts', request.source, ts.ScriptTarget.ES2020, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'run' && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) as ts.FunctionDeclaration | undefined;
  const annotation = declaration && !declaration.type && declaration.body ? (declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? ': Promise<CodeResult> ' : ': CodeResult ') : '';
  const insertion = annotation ? declaration!.body!.getStart(parsed) : 0;
  const checkedSource = annotation ? request.source.slice(0, insertion) + annotation + request.source.slice(insertion) : request.source;
  const footer = '\nconst __checkedRun: (ctx: RoboContext) => CodeResult | Promise<CodeResult> = run;';
  const files: Record<string, string> = {'/bot.ts': checkedSource + footer, '/context.d.ts': declarations, ...standardLibrary};
  let javascript: string | undefined;
  const options: ts.CompilerOptions = {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, strict: true, noImplicitReturns: true, noEmitOnError: true, noLib: true, skipLibCheck: true, types: []};
  const host: ts.CompilerHost = {
    getSourceFile: (name, languageVersion) => Object.hasOwn(files, name) ? ts.createSourceFile(name, files[name], languageVersion, true) : undefined,
    getDefaultLibFileName: () => '/lib.es2020.d.ts', writeFile: (name, text) => {if(name.endsWith('bot.js')) javascript = text;},
    getCurrentDirectory: () => '/', getDirectories: () => [], fileExists: name => Object.hasOwn(files, name), readFile: name => files[name],
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n'
  };
  const program = ts.createProgram(Object.keys(files), options, host);
  const source = program.getSourceFile('/bot.ts')!;
  const diagnostics: CodeDiagnostic[] = [];
  function report(start: number, length: number, message: string): void {
    const from = Math.min(start >= insertion && annotation ? Math.max(insertion, start - annotation.length) : start, request.source.length), location = parsed.getLineAndCharacterOfPosition(from);
    diagnostics.push({line: location.line + 1, column: location.character + 1, from, to: Math.min(from + Math.max(1, length), request.source.length), message});
  }
  function inspect(node: ts.Node): void {
    if(ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) || ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) report(node.getStart(source), node.getWidth(source), 'Импорты и повторные экспорты недоступны.');
    if(ts.isIdentifier(node) && ['eval', 'Function', 'Date', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'globalThis', 'window', 'document', 'performance', 'crypto', 'setTimeout', 'setInterval', 'localStorage', 'indexedDB'].includes(node.text)) report(node.getStart(source), node.getWidth(source), `${node.text} недоступен в изолированном коде.`);
    if(ts.isPropertyAccessExpression(node) && node.expression.getText(source) === 'Math' && node.name.text === 'random') report(node.getStart(source), node.getWidth(source), 'Случайные значения недоступны.');
    ts.forEachChild(node, inspect);
  }
  inspect(source);
  const exportedRun = source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'run' && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  if(exportedRun.length !== 1) report(0, 1, 'Определите export default function run(ctx: RoboContext).');
  for(const diagnostic of ts.getPreEmitDiagnostics(program)) {
    if(diagnostic.file?.fileName === '/bot.ts') report(diagnostic.start ?? 0, diagnostic.length ?? 1, ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    else if(diagnostic.category === ts.DiagnosticCategory.Error) report(0, 1, ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  }
  if(!diagnostics.length) program.emit();
  return {javascript, diagnostics};
}
