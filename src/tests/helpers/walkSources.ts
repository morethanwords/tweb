import {readdirSync, statSync} from 'fs';
import {join} from 'path';

/** Every .ts and .tsx file under `dir`, but in the folders `skip` names */
export default function walkSources(dir: string, skip: string[] = []): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if(statSync(path).isDirectory()) return skip.includes(name) ? [] : walkSources(path, skip);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}
