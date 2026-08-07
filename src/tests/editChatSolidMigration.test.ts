import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/sidebarRight/tabs/editChat.tsx'),
  'utf8'
);

describe('EditChat Solid migration', () => {
  it('uses the shared Solid section, row and button components', () => {
    expect(source).toContain('from \'@components/section\'');
    expect(source).toContain('from \'@components/rowTsx\'');
    expect(source).toContain('from \'@components/buttonTsx\'');
    expect(source).toContain('<Section');
    expect(source).toContain('<Row');
    expect(source).toContain('<Button');
    expect(source).toContain('useHotReloadGuard()');
  });

  it('does not restore the imperative settings primitives', () => {
    expect(source).not.toContain('SettingSection');
    expect(source).not.toContain('from \'@components/row\'');
    expect(source).not.toContain('from \'@components/button\'');
    expect(source).not.toContain('new Row(');
    expect(source).not.toContain('new CheckboxField(');
    expect(source).not.toContain('render(');
    expect(source).not.toContain('replaceChildren(');
    expect(source).not.toContain(
      'from \'@components/communities/editChatCommunitySection\''
    );
    expect(source).not.toContain('from \'@components/popups/boost\'');
    expect(source).not.toContain('from \'@components/popups/deleteDialog\'');
  });
});
