// @vitest-environment node
import {buildSync} from 'esbuild';
import {resolve} from 'node:path';

test('rich-message validation and shared format rules have no runtime UI or editor dependency', () => {
  const root = resolve(__dirname, '../..');
  const {metafile} = buildSync({
    absWorkingDir: root,
    entryPoints: [
      'src/lib/appManagers/utils/richMessage/validateRichMessage.ts',
      'src/lib/richTextProcessor/orderedList.ts',
      'src/lib/richTextProcessor/hasRichTextContent.ts'
    ],
    bundle: true,
    write: false,
    outdir: 'unused',
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    metafile: true,
    logLevel: 'silent'
  });
  const uiDependencies = Object.keys(metafile.inputs).filter(path => (
    path.startsWith('src/components/') || path.includes('@tiptap/') || path.endsWith('.scss')
  ));
  expect(uiDependencies).toEqual([]);
});
