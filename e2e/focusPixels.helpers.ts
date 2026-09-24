import type {ElementHandle, Page, TestInfo} from '@playwright/test';
import {PNG} from 'pngjs';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

export type PixelFinding = {
  surface: string,
  index: number,
  selector: string,
  label: string,
  problem: 'nothing-changes' | 'covered',
  detail: string,
  shot: string
};

function decode(buffer: Buffer) {
  return PNG.sync.read(buffer);
}

/** True when the two images differ anywhere beyond encoding noise. */
function differs(a: PNG, b: PNG, threshold = 12) {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  for(let y = 0; y < h; y++) {
    for(let x = 0; x < w; x++) {
      const ia = (a.width * y + x) << 2, ib = (b.width * y + x) << 2;
      const d = Math.abs(a.data[ia] - b.data[ib]) +
        Math.abs(a.data[ia + 1] - b.data[ib + 1]) +
        Math.abs(a.data[ia + 2] - b.data[ib + 2]);
      if(d > threshold) return true;
    }
  }
  return a.width !== b.width || a.height !== b.height;
}

async function savePng(path: string, png: PNG) {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, PNG.sync.write(png));
}

/**
 * Checks keyboard focus the way a person does: press Tab, and look at whether
 * the control now looks different.
 *
 * Asking the DOM instead does not work, and failed convincingly several times
 * before this was rewritten to use pixels: a ring can be drawn on a
 * pseudo-element or on a sibling, an outline on an `opacity: 0` overlay is
 * painted and invisible, and a computed style read a frame after focus catches
 * an animation mid-flight.
 *
 * Each control is compared against ITSELF one moment apart — the frame where it
 * holds focus, and the frame right after focus is dropped. Nothing scrolls or
 * re-renders in between, so a difference is the indicator and no difference is
 * the absence of one. Comparing neighbouring stops instead looks equivalent and
 * is not: focusing an item in a long list scrolls it into view, and the same
 * coordinates then hold different content in the two frames.
 */
/**
 * A page can go out from under a sweep — a reload, a popup that navigates, a
 * renderer that dies. Everything the walk holds is then stale, and the error
 * surfaces from whichever evaluate ran next. One surface going down must not
 * take the two hundred after it with it, so the walk gives back what it managed
 * to look at and says why it stopped.
 */
async function sweepOneSurface(page: Page, opts: {
  surface: string,
  name: string,
  outDir: string,
  maxStops?: number,
  settleMs?: number,
  /** how many controls of one kind on a surface are worth photographing */
  perKind?: number,
  /**
   * How focus moves through this surface. A menu is a composite widget: Tab
   * leaves it and the arrows walk it, which is the pattern the menus here
   * implement — sweeping one with Tab would step straight out of it and report
   * a menu nobody looked at as a clean one.
   */
  walkKey?: 'Tab' | 'ArrowDown'
}) {
  const {surface, name, outDir, maxStops = 40, settleMs = 300, perKind = 2, walkKey = 'Tab'} = opts;
  const findings: PixelFinding[] = [];
  const unjudged: string[] = [];

  // The client keeps several chat lists and several sliders in the DOM at once,
  // so the last element a selector matches is often a hidden twin. Focusing one
  // of those puts the walk somewhere the page can only leave by wrapping around
  // to the top of the document — and the surface reads as having no controls.
  const onScreen = page.locator(surface).filter({visible: true});
  const located = (await onScreen.count()) ? onScreen.last() : page.locator(surface).last();
  const root = await located.elementHandle() as ElementHandle<HTMLElement>;
  const surfaceBox = root && await located.boundingBox();
  if(!surfaceBox) return {stops: 0, findings, unjudged};

  // A screenshot only holds what is on screen. A surface can be taller than the
  // viewport, and a clip reaching past the edge does not come back empty — it
  // comes back holding something else, which reads as a control that never
  // changes. So everything is kept inside the viewport, and a control that does
  // not fit in it is not judged.
  const view = page.viewportSize() ?? {width: 1280, height: 720};
  const bounds = {
    x: Math.max(0, Math.floor(surfaceBox.x)),
    y: Math.max(0, Math.floor(surfaceBox.y)),
    width: 0,
    height: 0
  };
  bounds.width = Math.min(Math.ceil(surfaceBox.width), view.width - bounds.x);
  bounds.height = Math.min(Math.ceil(surfaceBox.height), view.height - bounds.y);
  if(bounds.width < 4 || bounds.height < 4) return {stops: 0, findings, unjudged};

  // Start inside the surface. Tab carries on from wherever focus happens to be,
  // so without this the walk begins outside and ends at once — reporting a
  // surface it never looked at as a clean one.
  await page.evaluate((root) => {
    (document.activeElement as HTMLElement)?.blur?.();
    if(!root.hasAttribute('tabindex')) root.setAttribute('data-focus-sweep-temp', '');
    root.tabIndex = -1;
    root.focus({preventScroll: true});
  }, root);
  await page.waitForTimeout(settleMs);

  const seen = new Set<string>();
  // A month grid is thirty-one identical day cells and a peer list is a hundred
  // identical rows; they are one control repeated, and photographing every one
  // buys nothing but hours. A couple of each kind is the check.
  const perKindSeen = new Map<string, number>();
  let stops = 0;

  for(let i = 0; i < maxStops; i++) {
    await page.keyboard.press(walkKey);
    await page.waitForTimeout(settleMs);

    const info = await page.evaluate((root) => {
      const el = document.activeElement as HTMLElement;
      if(!el || el === document.body || !root || !root.contains(el)) return null;
      const r = el.getBoundingClientRect();
      return {
        key: el.tagName + '|' + (el.className || '') + '|' + Math.round(r.x) + ',' + Math.round(r.y),
        describe: el.tagName.toLowerCase() +
          (typeof el.className === 'string' && el.className ?
            '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        label: (el.getAttribute('aria-label') ||
          el.closest('.row')?.querySelector('.row-title')?.textContent ||
          el.textContent || '').trim().slice(0, 40),
        // Two kinds of stop this sweep cannot rule on.
        //
        // Text entry is judged by its caret, which W3C names as a focus
        // indicator and which this design relies on. A caret blinks, so a
        // screenshot catches it or not at random — these are left out rather
        // than reported on the strength of a coin flip.
        //
        // A frame is left out for a different reason: it is not a control.
        // Focusing it hands the keyboard to the document inside, which draws
        // its own indicator on whatever it focuses — nothing that belongs to
        // this page changes, and there is nothing here to fix.
        judgedElsewhere: el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'IFRAME' ||
          (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'color']
          .includes((el as HTMLInputElement).type))
      };
    }, root);

    if(!info || seen.has(info.key)) break;
    seen.add(info.key);
    stops++;
    if(info.judgedElsewhere) continue;

    const kindCount = (perKindSeen.get(info.describe) ?? 0) + 1;
    perKindSeen.set(info.describe, kindCount);
    if(kindCount > perKind) continue;

    // Geometry comes from Playwright, in the same coordinate space its clip
    // expects. Reading getBoundingClientRect() in the page instead mixes
    // viewport coordinates with document ones, and the crop then holds whatever
    // occupies that place in the other space — which is what made earlier
    // versions of this sweep report perfectly good rows as unmarked.
    await page.evaluate((): void => {
      (document.activeElement as HTMLElement)?.setAttribute('data-focus-sweep-at', '');
    });

    // Focus can also land on something another element sits on top of — a row
    // that scrolled under a sticky footer. There is nothing to see there,
    // whatever the styles say.
    const covered = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-focus-sweep-at]');
      if(!el) return null;
      const target = (el.closest('.row') || el.closest('.checkbox-field, .radio-field') || el) as HTMLElement;
      const r = target.getBoundingClientRect();
      // Only a control small enough for its points to stand for the whole of it
      // can be judged this way. A scroll container spans the popup, and its
      // centre sits under a floating footer while the container itself is in
      // plain view — that is the footer's position, not a hidden control.
      if(r.height > innerHeight * 0.5 || r.width > innerWidth * 0.8) return null;

      // One point is not enough either. A ripple layer, a badge or a chevron
      // can own the exact centre of a control that is otherwise in full view,
      // and reporting those buries the real ones. A control counts as covered
      // only when there is nowhere on it left to look.
      const inset = 0.2;
      const points = [
        [r.x + r.width / 2, r.y + r.height / 2],
        [r.x + r.width * inset, r.y + r.height * inset],
        [r.x + r.width * (1 - inset), r.y + r.height * inset],
        [r.x + r.width * inset, r.y + r.height * (1 - inset)],
        [r.x + r.width * (1 - inset), r.y + r.height * (1 - inset)]
      ];

      let over: Element;
      for(const [x, y] of points) {
        const at = document.elementFromPoint(x, y);
        // anything of the control's own — its ripple, its label, its icon —
        // means that point is visible
        if(at && (target.contains(at) || at.contains(target))) return null;
        over ||= at;
      }
      if(!over) return 'nothing is drawn where it is';
      return over.tagName.toLowerCase() +
        (typeof over.className === 'string' && over.className ?
          '.' + over.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    });

    const drop = () => page.evaluate((): void => {
      document.querySelector('[data-focus-sweep-at]')?.removeAttribute('data-focus-sweep-at');
    });

    // The indicator does not always sit on the control itself: a radio's circle
    // is a pseudo-element on a sibling, and a toggle's ring is on its row. What
    // gets photographed is that host, not the control.
    const marked = page.locator('[data-focus-sweep-at]');
    const hostBox = await marked.evaluate((el) => {
      const target = (el.closest('.row') || el.closest('.checkbox-field, .radio-field') || el) as HTMLElement;
      target.setAttribute('data-focus-sweep-host', '');
      return true;
    }).then(() => page.locator('[data-focus-sweep-host]').boundingBox()).catch((): null => null);

    const dropHost = () => page.evaluate((): void => {
      document.querySelector('[data-focus-sweep-host]')?.removeAttribute('data-focus-sweep-host');
    });

    if(!hostBox || hostBox.width < 4 || hostBox.height < 4) {
      unjudged.push(`${name}#${i} ${info.describe} (nothing visible to compare)`);
      await drop(); await dropHost();
      continue;
    }

    // the ring may be offset outside the control, so a little room is kept
    const pad = 8;
    const area = {
      x: Math.max(0, Math.floor(hostBox.x) - pad),
      y: Math.max(0, Math.floor(hostBox.y) - pad),
      width: 0, height: 0
    };
    area.width = Math.min(Math.ceil(hostBox.width) + pad * 2, view.width - area.x);
    area.height = Math.min(Math.ceil(hostBox.height) + pad * 2, view.height - area.y);
    if(area.width < 4 || area.height < 4) {
      unjudged.push(`${name}#${i} ${info.describe} (not on screen)`);
      await drop(); await dropHost();
      continue;
    }

    const focused = decode(await page.screenshot({clip: area}));

    await page.evaluate((): void => {
      (document.activeElement as HTMLElement)?.blur?.();
    });
    await page.waitForTimeout(settleMs);

    const stillThere = await page.locator('[data-focus-sweep-host]').boundingBox().catch((): null => null);
    const unfocused = decode(await page.screenshot({clip: area}));

    const restored = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-focus-sweep-at]');
      el?.removeAttribute('data-focus-sweep-at');
      el?.focus({preventScroll: true});
      return document.activeElement === el;
    });
    await dropHost();

    if(!stillThere || Math.round(stillThere.y) !== Math.round(hostBox.y) ||
      Math.round(stillThere.x) !== Math.round(hostBox.x)) {
      unjudged.push(`${name}#${i} ${info.describe} (moved between the two frames)`);
      if(!restored) break;
      continue;
    }

    if(!differs(focused, unfocused)) {
      const stem = `${outDir}/${name.replace(/[^\w-]/g, '_')}-${i}`;
      await savePng(`${stem}-focused.png`, focused);
      await savePng(`${stem}-unfocused.png`, unfocused);
      // Nothing changed. Whether something is drawn on top says which of the
      // two problems it is, and an overlay that does not hide the indicator has
      // already been ruled out by the pixels themselves.
      findings.push({
        surface: name, index: i, selector: info.describe, label: info.label,
        problem: covered ? 'covered' : 'nothing-changes',
        detail: covered ?
          `keyboard focus lands here, but ${covered} is drawn on top of it` :
          'the control looks exactly the same whether or not it holds keyboard focus',
        shot: `${stem}-focused.png`
      });
    }

    if(!restored) break; // the walk lost its place; stop rather than wander on
  }

  await page.evaluate(() => {
    document.querySelectorAll('[data-focus-sweep-temp]').forEach((el) => {
      el.removeAttribute('tabindex');
      el.removeAttribute('data-focus-sweep-temp');
    });
  }).catch(() => {});

  return {stops, findings, unjudged};
}

export async function sweepFocusPixels(page: Page, opts: Parameters<typeof sweepOneSurface>[1]) {
  try {
    return await sweepOneSurface(page, opts);
  } catch(err) {
    return {
      stops: 0,
      findings: [] as PixelFinding[],
      unjudged: [`${opts.name}: the page went out from under the walk (${(err as Error).message.split('\n')[0].slice(0, 80)})`]
    };
  }
}

/**
 * The bookkeeping every sweep does: what each surface walked, what it found,
 * what it could not judge, and a progress file written as it goes so a run that
 * is interrupted still says how far it got.
 *
 * A surface selector can match a hidden twin the client keeps in the DOM, so
 * "did this surface appear" is asked of the on-screen matches only — the same
 * rule `sweepFocusPixels` uses when it picks which element to walk.
 */
export function createSweepRecorder(page: Page, testInfo: TestInfo, progressFile: string) {
  const findings: PixelFinding[] = [];
  const walked: Record<string, number> = {};
  const notes: string[] = [];
  const outDir = testInfo.outputPath('shots');

  // Whatever the caller last told us about its own progress — how many surfaces
  // of how many — is kept, so a file written by a sweep in between does not drop
  // it and leave the run looking like it never started counting.
  let extras: Record<string, unknown> = {};

  const save = async(extra?: Record<string, unknown>) => {
    if(extra) extras = {...extras, ...extra};
    const progress = testInfo.outputPath(progressFile);
    await mkdir(dirname(progress), {recursive: true});
    await writeFile(progress, JSON.stringify({...extras, walked, findings, notes}, null, 2));
  };

  const sweep = async(name: string, surface: string, walkKey?: 'Tab' | 'ArrowDown') => {
    const shown = await page.locator(surface).filter({visible: true}).count().catch(() => 0);
    if(!shown) {
      notes.push(`${name}: ${surface} never appeared`);
      await save();
      return 0;
    }

    const result = await sweepFocusPixels(page, {surface, name, outDir, walkKey});
    walked[name] = result.stops;
    findings.push(...result.findings);
    notes.push(...result.unjudged);
    if(!result.stops) notes.push(`${name}: walked nothing`);
    await save();
    return result.stops;
  };

  return {
    findings,
    walked,
    notes,
    save,
    sweep,
    note: async(text: string) => {
      notes.push(text);
      await save();
    },
    total: () => Object.values(walked).reduce((a, b) => a + b, 0),
    /** One line per finding, for the message an assertion fails with. */
    summary: () => findings
    .map((f) => `${f.surface} #${f.index} ${f.selector} [${f.problem}] ${f.label}`).join('\n')
  };
}
