import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/sidebarRight/tabs/editBot.tsx'),
  'utf8'
);
const sectionSource = readFileSync(
  resolve(
    process.cwd(),
    'src/components/communities/editBotCommunitySection.tsx'
  ),
  'utf8'
);

describe('EditBot Community section', () => {
  it('renders the complete edit form with Solid components', () => {
    expect(source).toContain('<EditBotCommunitySection');
    expect(source).toContain('<Section');
    expect(source).toContain('<InputFieldTsx');
    expect(source).toContain('<Button.Corner');
    expect(source).toContain('createResource');
    expect(source).not.toContain('CommunityDialogList');
    expect(source).not.toContain('SettingSection');
    expect(source).not.toContain('generateSection');
    expect(source).not.toContain('EditPeer');
    expect(source).not.toContain('attachClickEvent');
    expect(source).not.toContain('new Row(');
    expect(source).not.toContain('replaceChildren(');
    expect(source).not.toContain('toggleDisability(');
    expect(source).not.toContain('add(rootScope)(\'user_update\'');
    expect(source).not.toContain('render(');
  });

  it('reuses the shared Community link section', () => {
    expect(sectionSource).toContain('<CommunityLinkSection');
    expect(sectionSource).toContain('useUser(() => botId)');
    expect(sectionSource).not.toContain('document.createElement(');
    expect(sectionSource).not.toContain('render(');
  });
});
