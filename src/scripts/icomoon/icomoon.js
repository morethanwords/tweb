// @ts-check
// Thanks to https://github.com/Yuyz0112/icomoon-cli

const fs = require('fs-extra');
const path = require('path');
const extract = require('extract-zip');
const puppeteer = require('puppeteer');

const DEFAULT_TIMEOUT = 60000;

const PAGE = {
  IMPORT_CONFIG_BUTTON: '.file.unit',
  IMPORT_SELECTION_INPUT: '.file.unit input[type="file"]',
  OVERLAY_CONFIRM: '.overlay button.mrl',
  NEW_SET_BUTTON: '.menuList1 button',
  MAIN_MENU_BUTTON: '.bar-top button .icon-menu',
  MENU_BUTTON: 'h1 button .icon-menu',
  MENU: '.menuList2.menuList3',
  ICON_INPUT: '.menuList2.menuList3 .file input[type="file"]',
  FIRST_ICON_BOX: '#set0 .miBox:not(.mi-selected)',
  REMOVE_SET_BUTTON: '.menuList2.menuList3 li:last-child button',
  SELECT_ALL_BUTTON: 'button[ng-click="selectAllNone($index, true)"]',
  GENERATE_LINK: 'a[href="#/select/font"]',
  GLYPH_SET: '#glyphSet0',
  GLYPH_NAME: '.glyphName',
  DOWNLOAD_BUTTON: '.btn4',
  PREFERENCES: '#pref',
  SHOW_METRICS: '[ng-class*="showMetricsFocused"] label',
  CLOSE_OVERLAY: 'button[ng-click*="visiblePanels.fontPref = false"]',

  STROKE_TO_FILL_URL: '[href="https://icomoon.io/#docs/stroke-to-fill"]',
  CLOSE_STROKE_OVERLAY: '[ng-click="message.hide()"]',
  STROKE_CONTINUE: '[ng-click="message.hide(message.secondButton.caption)"]',

  IE8_SUPPORTED: '[ng-class*="noie8Focused"] .icon-checked',
  IE8_DISABLE: 'label[ng-class*="noie8Focused"]',

  FONT_NAME_INPUT: '[ng-model="fontPref.metadata.fontFamily"]',
  CLASS_PREFIX_INPUT: '[ng-model="fontPref.prefix"]',
  CSS_VARS_LABEL: '[ng-class*="fontPref.cssVars"]',
  SHOW_CSS_SELECTOR: '[ng-class="{fgc10: showSelectorFocused, mbn: !fontPref.showSelector}"] .hoverE0',
  CSS_CLASS_SELECTOR: '[ng-class="{mbm: fontPref.selector === \'class\', \'fgc10\': classSelectorFocused}"]',
  CSS_CLASS_SELECTOR_INPUT: '[ng-model="fontPref.classSelector"]',
  EM_HEIGHT_INPUT: '[model="fontPref.metrics.emSize"] input',
  BASELINE_HEIGHT_INPUT: '[model="fontPref.metrics.baseline"] input',
  WHITESPACE_WIDTH_INPUT: '[model="fontPref.metrics.whitespace"] input'
};
const DEFAULT_OPTIONS = {
  outputDir: path.join(__dirname, 'output')
};

const logger = (...args) => {
  console.log('[icomoon-cli]', ...args);
};

const sleep = time => new Promise(resolve => setTimeout(resolve, time));

const getAbsolutePath = inputPath => {
  let absoluteSelectionPath = inputPath;
  if(!path.isAbsolute(inputPath)) {
    if(!process.env.PWD) {
      process.env.PWD = process.cwd();
    }
    absoluteSelectionPath = path.resolve(process.env.PWD, inputPath);
  }
  return absoluteSelectionPath;
};

const checkDownload = dest => new Promise((resolve, reject) => {
  const interval = 1000;
  let downloadSize = 0;
  let timeCount = 0;
  const timer = setInterval(async() => {
    timeCount += interval;
    /* const exist = await fs.exists(dest);
    if (!exist) {
      return;
    } */
    const stats = fs.statSync(dest);
    if(stats.size > 0 && stats.size === downloadSize) {
      clearInterval(timer);
      resolve();
    } else {
      downloadSize = stats.size;
    }
    if(timeCount > DEFAULT_TIMEOUT) {
      reject('Timeout when download file, please check your network.');
    }
  }, interval);
});

const checkDuplicateName = ({selectionPath, icons, names}, forceOverride) => {
  const iconNames = icons.map((icon, index) => {
    if(names[index]) {
      return names[index];
    }
    return path.basename(icon).replace(path.extname(icon), '');
  });
  const duplicates = [];
  const selection = fs.readJSONSync(selectionPath);
  selection.icons.forEach((icon, index) => {
    const name = icon.tags[0];
    if(iconNames.includes(name)) {
      duplicates.push({name, index});
    }
  });
  if(!duplicates.length) {
    return;
  }
  if(forceOverride) {
    selection.icons = selection.icons.filter((icon, index) => !duplicates.some(d => d.index === index));
    fs.writeJSONSync(selectionPath, selection, {spaces: 2});
  } else {
    throw new Error(`Found duplicate icon names: ${duplicates.map(d => d.name).join(',')}`);
  }
};

async function pipeline(options = {}) {
  try {
    const {
      icons,
      names = [],
      selectionPath,
      forceOverride = false,
      whenFinished,
      visible = false
    } = options;
    const outputDir = options.outputDir ? getAbsolutePath(options.outputDir) : DEFAULT_OPTIONS.outputDir;
    // prepare stage
    logger('Preparing...');
    if(!icons || !icons.length) {
      if(whenFinished) {
        whenFinished({outputDir});
      }
      return logger('No new icons found.');
    }
    if(!selectionPath) {
      throw new Error('Please config a valid selection file path.');
    }
    const absoluteSelectionPath = getAbsolutePath(selectionPath);
    // checkDuplicateName({
    //   selectionPath: absoluteSelectionPath,
    //   icons,
    //   names,
    // }, forceOverride);
    await fs.remove(outputDir);
    await fs.ensureDir(outputDir);

    const browser = await puppeteer.launch({headless: !visible});
    logger('Started a new chrome instance, going to load icomoon.io.');
    const page = await browser.newPage();
    (await browser.target().createCDPSession()).send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: outputDir
    });
    await page.goto('https://icomoon.io/app/#/select');
    await page.waitForSelector(PAGE.IMPORT_CONFIG_BUTTON);
    logger('Dashboard is visible, going to upload config file');
    // remove init set
    await page.click(PAGE.MENU_BUTTON);
    await page.click(PAGE.REMOVE_SET_BUTTON);

    const importInput = await page.waitForSelector(PAGE.IMPORT_SELECTION_INPUT);
    await importInput.uploadFile(absoluteSelectionPath);
    logger('Uploaded config, going to upload new icon files');
    try {
      await Promise.race([
        sleep(1000).then(() => {
          throw 0;
        }),
        page.waitForSelector(PAGE.OVERLAY_CONFIRM, {visible: true})
      ]);
      await page.click(PAGE.OVERLAY_CONFIRM);
    } catch(err) {
      logger('Overlay is missed?');
    }

    const selection = fs.readJSONSync(selectionPath);
    /* if (selection.icons.length === 0) {
      logger('Selection icons is empty, going to create an empty set');
      await page.click(PAGE.MAIN_MENU_BUTTON);
      await page.waitForSelector(PAGE.NEW_SET_BUTTON, { visible: true });
      await page.click(PAGE.NEW_SET_BUTTON);
    } */

    await page.click(PAGE.MENU_BUTTON);
    const iconInput = await page.waitForSelector(PAGE.ICON_INPUT);
    const iconPaths = icons.map(getAbsolutePath);
    await iconInput.uploadFile(...iconPaths);
    let haveStrokes = false;
    try {
      await Promise.race([
        sleep(1000).then(() => {
          throw 0;
        }),
        page.waitForSelector(PAGE.STROKE_TO_FILL_URL)
      ]);
      await page.click(PAGE.CLOSE_STROKE_OVERLAY);
      haveStrokes = true;
      logger('Have wrong strokes');
    } catch(err) {

    }

    await page.waitForSelector(PAGE.FIRST_ICON_BOX);
    await page.click(PAGE.SELECT_ALL_BUTTON);
    logger('Uploaded and selected all new icons');
    await page.click(PAGE.GENERATE_LINK);
    await page.waitForSelector(PAGE.GLYPH_SET);

    if(haveStrokes) try {
      await page.click(PAGE.STROKE_CONTINUE);
    } catch(err) {

    }

    await page.click(PAGE.PREFERENCES);

    try {
      await Promise.race([
        sleep(1000).then(() => {
          throw 0;
        }),
        page.waitForSelector(PAGE.IE8_SUPPORTED)
      ]);
      await page.click(PAGE.IE8_DISABLE);
    } catch(err) {
      logger('IE8 is already disabled');
    }

    async function fillInput(selector, value) {
      if(typeof(value) !== 'string') {
        value = '' + value;
      }

      await page.focus(selector);
      for(let i = 0; i < 100; ++i) {
        await page.keyboard.press('Backspace');
      }
      await page.keyboard.type(value);
    }

    await fillInput(PAGE.FONT_NAME_INPUT, selection.preferences.fontPref.metadata.fontFamily);
    await fillInput(PAGE.CLASS_PREFIX_INPUT, selection.preferences.fontPref.prefix);
    await page.click(PAGE.CSS_VARS_LABEL);
    await page.click(PAGE.SHOW_CSS_SELECTOR);
    await sleep(200);
    await page.click(PAGE.CSS_CLASS_SELECTOR);
    await fillInput(PAGE.CSS_CLASS_SELECTOR_INPUT, '.' + selection.preferences.fontPref.metadata.fontFamily);
    await page.click(PAGE.SHOW_METRICS);
    await fillInput(PAGE.EM_HEIGHT_INPUT, selection.preferences.fontPref.metrics.emSize);
    await fillInput(PAGE.BASELINE_HEIGHT_INPUT, selection.preferences.fontPref.metrics.baseline);
    await fillInput(PAGE.WHITESPACE_WIDTH_INPUT, selection.preferences.fontPref.metrics.whitespace);

    // await sleep(100000);
    await page.click(PAGE.CLOSE_OVERLAY);
    // (await page.waitForSelector(PAGE.FONT_NAME_INPUT)).;

    // if(names.length) {
    //   logger('Changed names of icons');
    //   // sleep to ensure indexedDB is ready
    //   await sleep(1000);
    //   await page.evaluate(names => {
    //     const request = indexedDB.open('IDBWrapper-storage', 1);
    //     request.onsuccess = function() {
    //       const db = request.result;
    //       const tx = db.transaction('storage', 'readwrite');
    //       const store = tx.objectStore('storage');
    //       const keys = store.getAllKeys();
    //       keys.onsuccess = function() {
    //         let timestamp;
    //         keys.result.forEach(function(key) {
    //           if (typeof key === 'number') {
    //             timestamp = key;
    //           }
    //         });
    //         const main = store.get(timestamp);
    //         main.onsuccess = function() {
    //           const data = main.result;
    //           for (let i = 0; i < names.length; i++) {
    //             data.obj.iconSets[0].selection[i].name = names[i];
    //           }
    //           store.put(data);
    //         };
    //       };
    //     };
    //   }, names);
    // }

    // // sleep to ensure the code was executed
    // await sleep(1000);
    // // reload the page let icomoon read latest indexedDB data
    // await page.reload();
    await sleep(2000);

    await page.waitForSelector(PAGE.DOWNLOAD_BUTTON);
    await page.click(PAGE.DOWNLOAD_BUTTON);
    const meta = selection.preferences.fontPref.metadata;
    const zipName = meta.majorVersion ?
      `${meta.fontFamily}-v${meta.majorVersion}.${meta.minorVersion || 0}.zip` :
      `${meta.fontFamily}.zip`;
    logger(`Started to download ${zipName}`);
    const zipPath = path.join(outputDir, zipName);
    await checkDownload(zipPath);
    logger('Successfully downloaded, going to unzip it.');
    await page.close();
    await browser.close();
    // unzip stage
    extract(zipPath, {dir: outputDir}, async(err) => {
      if(err) {
        throw err;
      }
      await fs.remove(zipPath);
      logger(`Finished. The output directory is ${outputDir}.`);
      if(whenFinished) {
        whenFinished({outputDir});
      }
    });
  } catch(error) {
    console.error(error);
    if (error?.message?.includes(PAGE.GLYPH_SET)) {
      console.log('perhaps some icon is invalid (e.g. contains a stroke)?')
    }
  }
}

module.exports = pipeline;
