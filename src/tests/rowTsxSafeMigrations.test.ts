import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {relative, resolve} from 'node:path';
import {parseSync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const rowControllerFiles = [
  'src/lib/appDialogsManager.ts'
].sort();

const ignoredDirectories = new Set(['node_modules', 'solid', 'tests', 'vendor']);

const collectSourceFiles = (directory: string): string[] => readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
  const path = resolve(directory, entry.name);
  if(entry.isDirectory()) {
    return ignoredDirectories.has(entry.name) ? [] : collectSourceFiles(path);
  }

  return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
});

const importsRowController = (file: string) => {
  const source = readFileSync(file, 'utf8');
  const ast = parseSync(source, {
    filename: file,
    parserOpts: {plugins: file.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript']}
  });
  return ast.program.body.some((statement) => (
    statement.type === 'ImportDeclaration' &&
    statement.source.value === '@components/rowTsxController'
  ));
};

const getJsxName = (name: any): string => {
  if(name.type === 'JSXIdentifier') {
    return name.name;
  }

  return `${getJsxName(name.object)}.${getJsxName(name.property)}`;
};

const walkAst = (node: any, ancestors: any[], visit: (node: any, ancestors: any[]) => void) => {
  if(!node || typeof(node) !== 'object') {
    return;
  }

  visit(node, ancestors);
  const nextAncestors = [...ancestors, node];
  Object.values(node).forEach((value) => {
    if(Array.isArray(value)) {
      value.forEach((child) => walkAst(child, nextAncestors, visit));
    } else if(value && typeof(value) === 'object' && 'type' in value) {
      walkAst(value, nextAncestors, visit);
    }
  });
};

describe('RowTsx migration boundary', () => {
  it('keeps the imperative controller limited to the explicit allowlist', () => {
    const root = process.cwd();
    const actual = collectSourceFiles(resolve(root, 'src'))
    .filter((file) => file !== resolve(root, 'src/components/rowTsxController.tsx'))
    .filter(importsRowController)
    .map((file) => relative(root, file))
    .sort();

    expect(actual).toEqual(rowControllerFiles);
  });

  it('does not expose the removed createRow factory', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/rowTsxController.tsx'), 'utf8');

    expect(source).not.toMatch(/\bcreateRow\s*(?:=|\()/);
  });

  it('uses semantic radio fields instead of the removed StaticRadio', () => {
    const root = process.cwd();
    const imports = collectSourceFiles(resolve(root, 'src'))
    .filter((file) => readFileSync(file, 'utf8').includes('@components/staticRadio'))
    .map((file) => relative(root, file));

    expect(imports).toEqual([]);
    expect(existsSync(resolve(root, 'src/components/staticRadio.tsx'))).toBe(false);
    expect(existsSync(resolve(root, 'src/components/staticRadio.module.scss'))).toBe(false);
  });

  it('keeps RadioField caption-free and mounted only through Row.RadioField', () => {
    const root = process.cwd();
    const radioFieldTsx = resolve(root, 'src/components/radioFieldTsx.tsx');
    const standalone: string[] = [];
    const forbiddenProps: string[] = [];
    const directImports: string[] = [];

    collectSourceFiles(resolve(root, 'src')).forEach((file) => {
      const source = readFileSync(file, 'utf8');
      if(file !== radioFieldTsx && source.includes('from \'@components/radioField\'')) {
        directImports.push(relative(root, file));
      }

      if(!source.includes('RadioFieldTsx')) {
        return;
      }

      const ast = parseSync(source, {
        filename: file,
        parserOpts: {plugins: file.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript']}
      });
      walkAst(ast, [], (node, ancestors) => {
        if(node.type !== 'JSXElement' || getJsxName(node.openingElement.name) !== 'RadioFieldTsx') {
          return;
        }

        const path = relative(root, file);
        const attributes = node.openingElement.attributes
        .filter((attribute: any) => attribute.type === 'JSXAttribute')
        .map((attribute: any) => attribute.name.name);
        const forbidden = attributes.filter((name: string) => (
          name === 'text' || name === 'textElement' || name === 'langKey' ||
          name === 'mainClass' || name === 'compact'
        ));
        forbidden.forEach((name: string) => forbiddenProps.push(`${path}:${name}`));

        const insideRowRadioField = ancestors.some((ancestor) => (
          ancestor.type === 'JSXElement' && (
            getJsxName(ancestor.openingElement.name) === 'Row.RadioField' ||
            getJsxName(ancestor.openingElement.name) === 'RowTsx.RadioField'
          )
        ));
        if(!insideRowRadioField) {
          standalone.push(path);
        }
      });
    });

    expect(directImports).toEqual([]);
    expect(forbiddenProps).toEqual([]);
    expect(standalone).toEqual([]);
  });

  it('preserves payment row styling and primary-title layout', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/popups/paymentMethods.tsx'), 'utf8');

    expect(source).toContain('class="payment-item-row"');
    expect(source).toContain('<Row.Title>{props.title}</Row.Title>');
    expect(source).not.toContain('<Row.Subtitle>{props.title}</Row.Subtitle>');
  });

  it('preserves secondary styling for premium option prices', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/premium/premiumOptionsForm.tsx'
    ), 'utf8');

    expect(source).toContain('<RowTsx.RightContent class="row-title-right-secondary">');
  });

  it('keeps imperative siblings outside Solid render roots', () => {
    const payment = readFileSync(resolve(process.cwd(), 'src/components/popups/payment.tsx'), 'utf8');
    const editContact = readFileSync(resolve(
      process.cwd(),
      'src/components/sidebarRight/tabs/editContact.tsx'
    ), 'utf8');
    const editInvite = readFileSync(resolve(
      process.cwd(),
      'src/components/sidebarRight/tabs/editChatInviteLink.tsx'
    ), 'utf8');
    const chatType = readFileSync(resolve(
      process.cwd(),
      'src/components/sidebarRight/tabs/chatType.tsx'
    ), 'utf8');

    expect(payment).toContain('element: rowsContainer');
    expect(editContact.match(/element: rowsContainer/g)).toHaveLength(2);
    expect(editInvite).not.toContain('renderComponent');
    expect(editInvite).toContain('timePeriodContent.append(range.container, row);');
    expect(editInvite).toContain('usersLimitContent.append(range.container, row);');
    expect(chatType).toContain('publicContainer.append(publicSection.container, usernamesSection);');
  });

  it('mounts radio forms through Solid component boundaries', () => {
    const root = process.cwd();
    const mute = readFileSync(resolve(root, 'src/components/popups/mute.ts'), 'utf8');
    const shippingMethods = readFileSync(resolve(
      root,
      'src/components/popups/paymentShippingMethods.ts'
    ), 'utf8');

    expect(mute).toContain('createComponent(RadioFormTsx<number | string>');
    expect(shippingMethods).toContain('createComponent(RadioFormTsx<string>');
    expect(mute).not.toContain('RadioFormTsx({');
    expect(shippingMethods).not.toContain('RadioFormTsx({');
  });

  it('uses the shared Community dialog row in peer profile', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/peerProfile.tsx'
    ), 'utf8');
    const communityDialogStart = source.indexOf(
      'function CommunityProfileDialog'
    );
    const communityDialog = source.slice(
      communityDialogStart,
      source.indexOf('PeerProfile.LinkedCommunity =', communityDialogStart)
    );

    expect(communityDialog).toContain('<CommunityPeerDialogList');
    expect(communityDialog).toContain('getCommunity={(community) => community}');
    expect(communityDialog).toContain('if(event.ctrlKey || event.metaKey)');
    expect(communityDialog).toContain(
      'appDialogsManager.openDialogInNewTab(row);'
    );
    expect(communityDialog).toContain('void appImManager.op({peer: community});');
    expect(communityDialog).not.toContain('replaceWith(');
    expect(communityDialog).not.toMatch(/dialogElement\.media\s*=/);
    expect(communityDialog).not.toContain('addDialogNew(');
  });

  it('preserves the reactions, suggestions, loop order in sticker settings', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/sidebarLeft/tabs/stickersAndEmoji.tsx'
    ), 'utf8');
    const reactionsRow = source.indexOf('<ReactionStickerPreview');
    const suggestStickersRow = source.indexOf('ref={suggestStickersRow}');
    const loopRow = source.indexOf('stateKey={joinDeepPath(\'settings\', \'stickers\', \'loop\')}');

    expect(reactionsRow).toBeGreaterThan(-1);
    expect(reactionsRow).toBeLessThan(suggestStickersRow);
    expect(suggestStickersRow).toBeLessThan(loopRow);
  });

  it('disables native checkbox inputs together with their rows', () => {
    const poll = readFileSync(resolve(
      process.cwd(),
      'src/components/popups/createPoll/pollSettingsSectionContent.tsx'
    ), 'utf8');
    const pollSettingsOption = poll.slice(
      poll.indexOf('const SettingsOption'),
      poll.indexOf('const durationOptions')
    );
    const sellStarGift = readFileSync(resolve(
      process.cwd(),
      'src/components/popups/sellStarGift.tsx'
    ), 'utf8');

    expect(pollSettingsOption.match(/disabled=\{props\.disabled\}/g)).toHaveLength(2);
    expect(sellStarGift).toMatch(/<CheckboxFieldTsx checked=\{ton\(\)\} disabled=\{loading\(\)\}/);
  });

  it('keeps subscriber-row behavior independent of the clicked label part', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/popups/boostsViaGifts.tsx'
    ), 'utf8');
    const handler = source.slice(
      source.indexOf('const onSubscriberTypeClick'),
      source.indexOf('const allSubscribersCheckboxField')
    );

    expect(handler).toContain('const wasSelected = onlyNewSubscribers() === onlyNew;');
    expect(handler).not.toContain('checkbox.checked');
  });

  it('keeps chat-reaction JSX declarative and registers toggles before titles', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/sidebarRight/tabs/chatReactions.tsx'
    ), 'utf8');
    const loaderStart = source.indexOf('promiseCollector.collect((async() => {');
    const loaderEnd = source.indexOf('})());', loaderStart);
    const loader = source.slice(loaderStart, loaderEnd);

    expect(loaderStart).toBeGreaterThan(-1);
    expect(loaderEnd).toBeGreaterThan(loaderStart);
    expect(loader).not.toMatch(/<[A-Z]|new CheckboxField/);
    expect(source).toMatch(
      /<Row>\s*<Row\.CheckboxFieldToggle>[\s\S]*?<\/Row\.CheckboxFieldToggle>\s*<Row\.Title>\{i18n\('EnableReactions'\)\}<\/Row\.Title>/
    );
    expect(source).toMatch(
      /<Row havePadding>\s*<Row\.CheckboxFieldToggle>[\s\S]*?<\/Row\.CheckboxFieldToggle>\s*<Row\.Title>\{availableReaction\.title\}<\/Row\.Title>/
    );
  });

  it('renders the automatic media download control as a toggle', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/sidebarLeft/tabs/dataAndStorage/index.tsx'
    ), 'utf8');

    expect(source).toMatch(
      /<Row\.CheckboxFieldToggle>\s*<CheckboxFieldTsx[\s\S]*?\btoggle\b[\s\S]*?<\/Row\.CheckboxFieldToggle>\s*<Row\.Title>\{i18n\('AutoDownloadMedia'\)\}<\/Row\.Title>/
    );
  });

  it('renders every per-chat auto-download option as a toggle', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/sidebarLeft/tabs/autoDownload/peerTypeSection.tsx'
    ), 'utf8');

    expect(source).toMatch(
      /options\.map[\s\S]*?<Row\.CheckboxFieldToggle>\s*<CheckboxFieldTsx[\s\S]*?\btoggle\b[\s\S]*?<\/Row\.CheckboxFieldToggle>\s*<Row\.Title>/
    );
    expect(source).not.toMatch(/<Row\.CheckboxField>/);
  });

  it('renders independent settings as toggles instead of square checkboxes', () => {
    const root = process.cwd();
    const background = readFileSync(resolve(
      root,
      'src/components/sidebarLeft/tabs/background.tsx'
    ), 'utf8');
    const privacy = readFileSync(resolve(
      root,
      'src/components/sidebarLeft/tabs/privacyAndSecurity.tsx'
    ), 'utf8');
    const editContact = readFileSync(resolve(
      root,
      'src/components/sidebarRight/tabs/editContact.tsx'
    ), 'utf8');
    const editTopic = readFileSync(resolve(
      root,
      'src/components/sidebarRight/tabs/editTopic.tsx'
    ), 'utf8');

    expect(background).toContain('<Row disabled={blurDisabled()}>');
    expect(background).toMatch(
      /<Row\.CheckboxFieldToggle>\s*<CheckboxFieldTsx[\s\S]*?disabled=\{blurDisabled\(\)\}[\s\S]*?signal=\{blurSignal\}[\s\S]*?\btoggle\b[\s\S]*?<\/Row\.CheckboxFieldToggle>/
    );
    expect(background).toContain('setBlurDisabled(getBlurDisabled())');
    expect(background).not.toContain('new CheckboxField');
    expect(background).not.toContain('toggleDisability');
    expect(privacy).toMatch(
      /<Row\.CheckboxFieldToggle>\s*<CheckboxFieldTsx signal=\{archiveAndMuteSignal\} toggle \/>\s*<\/Row\.CheckboxFieldToggle>/
    );
    expect(privacy).toMatch(
      /<Row\.CheckboxFieldToggle>\s*<CheckboxFieldTsx signal=\{sensitiveSignal\} toggle onChange=\{onSensitiveChange\} \/>\s*<\/Row\.CheckboxFieldToggle>/
    );
    expect(editContact).toMatch(
      /<Row\.CheckboxFieldToggle>[\s\S]*?signal=\{notificationsSignal\}[\s\S]*?\btoggle\b[\s\S]*?<\/Row\.CheckboxFieldToggle>/
    );
    expect(editTopic).toMatch(
      /<Row\.CheckboxFieldToggle>[\s\S]*?signal=\{hiddenSignal\}[\s\S]*?\btoggle\b[\s\S]*?<\/Row\.CheckboxFieldToggle>/
    );
  });

  it('keeps language-row content and identity inside RowTsx', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/chat/translation.tsx'), 'utf8');

    expect(source).toContain('element.dataset.peerId = String(iso2);');
    expect(source).toContain('{checkbox}');
    expect(source).toContain('popup.selector.middlewareHelperLoader.get()');
    expect(source).not.toContain('), popup.middleware);');
    expect(source).not.toMatch(/row\.append|row\.dataset/);
  });

  it('keeps selector-specific peer identity and result lifetime out of the RowTsx API', () => {
    const rowSource = readFileSync(resolve(process.cwd(), 'src/components/rowTsx.tsx'), 'utf8');
    const countrySource = readFileSync(resolve(process.cwd(), 'src/components/popups/pickCountry.tsx'), 'utf8');

    expect(rowSource).not.toContain('data-peer-id');
    expect(countrySource).toContain('element.dataset.peerId = String(iso2);');
    expect(countrySource).toContain('popup.selector.middlewareHelperLoader.get()');
    expect(countrySource).not.toContain('), popup.middleware);');
  });

  it('keeps the discussion chat list inside the Solid-owned section tree', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/sidebarRight/tabs/chatDiscussion.tsx'
    ), 'utf8');

    expect(source).toContain('setChatlistElement(chatlist);');
    expect(source).toContain('<Show keyed when={chatlistElement()}>{(element) => element}</Show>');
    expect(source).not.toContain('sectionContent.append(chatlist)');
  });

  it('disposes forum-topic rows with their search result generation', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/popups/pickUser.tsx'), 'utf8');

    expect(source).toContain('const middleware = fs.middlewareHelperLoader.get();');
    expect(source).toContain('wrapTopicRow({peerId, threadId, middleware})');
    expect(source).toMatch(/await Promise\.all\(promises\);\s+if\(!middleware\(\)\)/);
    expect(source).not.toContain('wrapTopicRow({peerId, threadId, middleware: fsMiddleware})');
  });

  it('keeps usernamesSection free of imperative row DOM management', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/usernamesSection.tsx'), 'utf8');

    expect(source).not.toMatch(/document\.createElement|\.append\(|\.remove\(|\.classList|\.dataset|positionElementByIndex|SortedList/);
    expect(source).not.toContain('@helpers/dom/sortable');
    expect(source).toContain('@helpers/solid/createSortableList');
  });
});
