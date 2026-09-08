import {constants} from 'node:fs';
import {mkdir, open, stat} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {createCompanionServer, type CompanionServer} from '../src/shell/semantic/transport/server';
import type {CompanionApp} from '../src/shell/semantic/transport/contracts';

/** Never log or accept a capability in command-line arguments or URLs. */
export async function localCapability(tokenFile: string): Promise<string> {
  const path = resolve(tokenFile);
  await mkdir(dirname(path), {recursive: true, mode: 0o700});
  let file;
  try {
    file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    const token = randomBytes(32).toString('base64url');
    try {await file.writeFile(token + '\n', 'utf8'); await file.sync();} finally {await file.close();}
    return token;
  } catch(error) {
    if(!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
  }
  file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await file.stat();
    if(!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 || metadata.size > 256 || typeof process.getuid === 'function' && metadata.uid !== process.getuid()) throw new Error('Local capability file must be owner-only mode 0600.');
    const token = (await file.readFile('utf8')).trim();
    if(!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error('Invalid local capability file.');
    return token;
  } finally {await file.close();}
}

export interface LaunchCompanionOptions {
  app: CompanionApp;
  artifactRoot: string;
  manifestPath?: string;
  tokenFile?: string;
  port?: number;
}

export async function launchCompanion({app, artifactRoot, manifestPath, tokenFile = '.semantic-local/capability', port = 3130}: LaunchCompanionOptions): Promise<CompanionServer> {
  if(port < 1024 || port > 65535) throw new Error('Choose a local unprivileged port.');
  const token = await localCapability(tokenFile);
  const companion = await createCompanionServer({app, token, artifactRoot, manifestPath, port});
  const origin = await companion.listen();
  console.log(`Robochat companion ${origin}`);
  console.log(`Verified artifact ${companion.artifactHash}`);
  console.log(`MCP ${origin}/mcp; capability file ${resolve(tokenFile)}`);
  const stop = (): void => {void companion.close().then(() => process.exit(0), () => process.exit(1));};
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return companion;
}

/** Read-only check used by transport verification without printing credentials. */
export async function capabilityFileMode(path: string): Promise<number> {return (await stat(path)).mode & 0o777;}
