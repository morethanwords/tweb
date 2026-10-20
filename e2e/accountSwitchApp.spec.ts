import {expect, Page, test} from '@playwright/test';

/*
 * Switching to another signed-in account from the menu happens in the tab, without a reload, and
 * leaves nothing of the previous account on the screen: every row of the chat list is a dialog of
 * the account switched to, the conversation that was open is closed, the address names the account.
 *
 * It needs a signed-in client with TWO accounts, so it runs against an authorized preview that has a
 * second one, and skips otherwise rather than reporting a pass it never made:
 *
 *   TWEB_SECOND_SEED=seed-b.json bash scripts/start-preview.sh --detach   # say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/accountSwitchApp.spec.ts
 */
// * a call needs a microphone: a fake one, which a switch without a call does not mind
test.use({launchOptions: {args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']}});

test.describe('switching accounts', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test('happens in place and shows only the new account', async({page}) => {
    test.setTimeout(5 * 60_000);

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      // * a rejection carrying an ApiError object is how a dropped request ends ("Object"); a thrown
      // * TypeError and the like is a bug - a screen of the previous account reaching for what is gone
      if(/^(TypeError|ReferenceError|RangeError)$/.test(error.name)) errors.push(error.stack || error.message);
    });

    await page.goto('/');
    await waitForChatList(page);

    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    // * survives anything but a reload
    await page.evaluate(() => (window as any).__sameDocument = true);

    const first = await readAccount(page);
    expect(first.accountInUrl).toBe(1);

    // * a row of a dialog: the archive can be the first one
    await page.locator('#folders-container .chatlist-chat[data-peer-id]').first().click();
    await page.waitForFunction(() => document.body.classList.contains('has-chat'));

    await switchFromMenu(page);
    const second = await readAccount(page);
    expect(second.sameDocument, 'the tab reloaded').toBe(true);
    expect(second.myId).not.toBe(first.myId);
    expect(second.accountInUrl).not.toBe(1);
    expect(second.hasChat, 'the previous account\'s conversation stayed open').toBe(false);
    expect(second.rows.length).toBeGreaterThan(0);
    expect(second.foreignRows, 'rows that are not dialogs of the account').toEqual([]);

    await switchFromMenu(page);
    const back = await readAccount(page);
    expect(back.sameDocument, 'the tab reloaded').toBe(true);
    expect(back.myId).toBe(first.myId);
    expect(back.accountInUrl).toBe(1);
    expect(back.foreignRows, 'rows that are not dialogs of the account').toEqual([]);

    expect(errors).toEqual([]);

    // * and the list it showed is the one a page opened on that account shows - the archive row
    // * with its preview included, which no dialog check above would see
    await page.goto(`/?account=${second.accountInUrl}`);
    await waitForChatList(page);
    await page.waitForTimeout(2000);
    const reloaded = await readAccount(page);
    expect(reloaded.myId).toBe(second.myId);
    expect(second.texts, 'the list differs from the one of a page opened on the account').toEqual(reloaded.texts);
  });
});

/*
 * A call is its account's, not the tab's: it goes on while the tab shows another account, its panel stays
 * and its own account still carries it - the other side hears it mute. The tab of account 1 calls the tab
 * of account 2, then switches to account 2 from the menu and back.
 */
test.describe('switching accounts in a call', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}, permissions: ['microphone', 'camera']});

  test('keeps a 1-on-1 call going', async({context}) => {
    test.setTimeout(5 * 60_000);

    const errors: string[] = [];
    const open = async(account: number) => {
      const page = await context.newPage();
      page.on('pageerror', (error) => {
        if(/^(TypeError|ReferenceError|RangeError)$/.test(error.name)) errors.push(error.stack || error.message);
      });
      await page.goto(`/?account=${account}`);
      await waitForChatList(page);
      return page;
    };

    const caller = await open(1);
    const accounts = await caller.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');
    const callee = await open(2);

    const callerId = await caller.evaluate(() => (window as any).rootScope.myId);
    const calleeId = await callee.evaluate(() => (window as any).rootScope.myId);
    const reachable = await caller.evaluate(async(peerId) => {
      for(let i = 0; i < 20; ++i) {
        if((await (window as any).rootScope.managers.appUsersManager.getUser(peerId))?.access_hash) return true;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return false;
    }, calleeId);
    test.skip(!reachable, 'account 1 does not know account 2 - nobody to call');

    await caller.evaluate(() => (window as any).__sameDocument = true);
    await caller.evaluate((peerId) => (window as any).callsController.startCallInternal(peerId, false), calleeId);
    await expect.poll(() => readCall(callee, callerId), {timeout: 30_000}).toMatchObject({state: CALL_PENDING});
    await callee.evaluate((peerId) => (window as any).callsController.getCallByUserId(peerId).acceptCall(), callerId);
    await expect.poll(() => readCall(caller, calleeId), {timeout: 40_000}).toMatchObject({state: CALL_CONNECTED});

    try {
      await switchFromMenu(caller);
      const during = await readCall(caller, calleeId);
      expect(during.sameDocument, 'the tab reloaded').toBe(true);
      expect(during.tabMyId).toBe(calleeId);
      expect(during, 'the call ended with the switch').toMatchObject({state: CALL_CONNECTED, accountNumber: 1, calling: true, panel: true});

      // * Escape still dismisses the kept panel, not what the new account's screens put on the stack
      await caller.keyboard.press('Escape');
      await expect.poll(() => readCall(caller, calleeId), {message: 'Escape left the kept panel up'}).toMatchObject({panel: false, state: CALL_CONNECTED});
      // * closing it steps back to the history entry from before the switch: the address keeps the account shown
      await expect.poll(() => caller.evaluate(() => new URL(location.href).searchParams.get('account')), {message: 'the address went back to the previous account'}).toBe('2');

      // * the call's own account still carries it: the other side hears the microphone go
      await caller.evaluate((peerId) => (window as any).callsController.getCallByUserId(peerId).toggleMuted(), calleeId);
      await expect.poll(() => readCall(callee, callerId), {timeout: 20_000}).toMatchObject({remoteMuted: true});

      await switchFromMenu(caller);
      expect(await readCall(caller, calleeId)).toMatchObject({sameDocument: true, tabMyId: callerId, state: CALL_CONNECTED});
    } finally {
      await caller.evaluate((peerId) => (window as any).callsController.getCallByUserId(peerId)?.hangUp('phoneCallDiscardReasonHangup'), calleeId);
    }

    await expect.poll(() => readCall(callee, callerId), {timeout: 20_000}).toMatchObject({state: null});
    expect(errors).toEqual([]);
  });
});

/*
 * What is open when a switch comes from elsewhere (a notification) goes with the account it shows: a
 * settings tab saves what it edited to that account, the media viewer closes even while it pages.
 */
test.describe('switching accounts over open screens', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test('a settings popup saves to the account it was edited on', async({page}) => {
    test.setTimeout(5 * 60_000);

    // * the save goes out as the tab is destroyed: whichever account the call names is the one it reaches
    await recordManagerCalls(page, 'appNotificationsManager.setContactSignUpNotification');

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    const enabled = await page.evaluate(() => (window as any).rootScope.managers.appNotificationsManager.getContactSignUpNotification());
    try {
      // * a collapsed sidebar opens Settings in a popup of its own, whose tabs close after it
      await page.evaluate(() => document.getElementById('column-left').classList.add('is-collapsed'));
      await page.locator('#column-left .sidebar-tools-button').click();
      await page.locator('.btn-menu-item', {hasText: 'Settings'}).first().click();
      await expect(page.locator('.popup:has(.sidebar-slider)')).toBeVisible();
      await page.locator('.row', {hasText: 'Notifications and Sounds'}).first().click();
      await page.locator('.row', {hasText: 'Contact joined Telegram'}).first().click();

      await page.evaluate(() => (window as any).switchAccount(2));
      await waitForChatList(page);
      await expect.poll(() => readManagerCalls(page, 'appNotificationsManager.setContactSignUpNotification'), {timeout: 10_000}).toEqual([1]);
    } finally {
      // * the account keeps its setting
      await page.evaluate((enabled) => {
        return (window as any).createProxiedManagersForAccount(1).appNotificationsManager.setContactSignUpNotification(!enabled);
      }, enabled);
    }
  });

  test('the emoji panel and the OS media panel start over for the new account', async({page}) => {
    test.setTimeout(5 * 60_000);

    const errors: string[] = [];
    page.on('console', (message) => {
      if(message.type() === 'error' && /listener error/.test(message.text())) errors.push(message.text());
    });

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    const openSaved = async() => {
      await page.evaluate(() => (window as any).appImManager.setInnerPeer({peerId: (window as any).rootScope.myId}));
      await expect(page.locator('.chat.active .btn-send')).toBeVisible();
    };

    await openSaved();
    // * what a track playing tells the OS media panel: its title, its sender, its artwork
    await page.evaluate(() => {
      (window as any).appMediaPlaybackController.setMediaMetadata(new MediaMetadata({title: 'a track of account 1'}));
    });

    // * the panel opened on its first tab only: the others were never set up
    await page.locator('.chat.active .toggle-emoticons').first().click();
    await expect(page.locator('.emoji-dropdown.active')).toBeVisible();
    await page.keyboard.press('Escape');

    // * and the emoji status picker, a dropdown of its own, is up when the switch comes (its button shows
    // * for Premium only: the flag is set in this tab alone)
    await page.evaluate(() => {
      const w = window as any;
      w.rootScope.premium = true;
      w.rootScope.dispatchEventSingle('premium_toggle', true);
    });
    await page.locator('.sidebar-emoji-status').click();
    await expect(page.locator('.emoji-dropdown.active')).toBeVisible();

    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    expect(await page.evaluate(() => navigator.mediaSession.metadata), 'the previous account\'s track is still named').toBeNull();
    await expect(page.locator('.emoji-dropdown.active'), 'the previous account\'s status picker stayed open').toHaveCount(0);

    await openSaved();
    await page.locator('.chat.active .toggle-emoticons').first().click();
    await expect(page.locator('.emoji-dropdown.active'), 'the emoji panel is broken').toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a notification clicked while a switch is under way still opens its chat', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');
    const myId = await page.evaluate(() => (window as any).rootScope.myId);
    const peerId = await page.evaluate(() => {
      return document.querySelector<HTMLElement>('#folders-container .chatlist-chat[data-peer-id]').dataset.peerId.toPeerId();
    });

    // * the switch to 2 is still closing account 1's screens when account 1's notification is clicked
    await page.evaluate((peerId) => {
      const w = window as any;
      w.__switchTo2 = w.switchAccount(2);
      w.uiNotificationsManager.openForAccount(1, () => w.appImManager.setInnerPeer({peerId}));
    }, peerId);
    // * what opened at once would be up now, only for the switch to take it away
    await page.evaluate(() => (window as any).__switchTo2);

    await expect.poll(() => page.evaluate(() => {
      const w = window as any;
      return {myId: w.rootScope.myId, peerId: w.appImManager.chat?.peerId};
    }), {timeout: 30_000, message: 'the click was lost to the switch'}).toEqual({myId, peerId});
  });

  test('a voice recording still asking for the microphone lets it go', async({page}) => {
    test.setTimeout(5 * 60_000);

    // * the permission prompt answered a while after the switch
    await page.addInitScript(() => {
      const w = window as any;
      w.__streams = [];
      const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async(constraints) => {
        await new Promise((resolve) => setTimeout(resolve, w.__microphoneDelay || 0));
        const stream = await getUserMedia(constraints);
        w.__streams.push(stream);
        return stream;
      };
    });

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    await page.evaluate(() => (window as any).appImManager.setInnerPeer({peerId: (window as any).rootScope.myId}));
    await expect(page.locator('.chat.active .btn-send')).toBeVisible();
    await page.evaluate(() => (window as any).__microphoneDelay = 2500);
    await page.locator('.chat.active .btn-send').click();

    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    // * the microphone was granted after the chat had gone
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => {
      const w = window as any;
      return {
        liveTracks: w.__streams.flatMap((stream: MediaStream) => stream.getTracks()).filter((track: MediaStreamTrack) => track.readyState === 'live').length,
        voiceEntry: w.appNavigationController.navigations.some((item: any) => item.type === 'voice')
      };
    }), 'the microphone stayed on for a chat that is gone').toEqual({liveTracks: 0, voiceEntry: false});
  });

  test('the media editor finishing when a switch comes leaves nothing on the screen', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    await page.evaluate(() => (window as any).appImManager.setInnerPeer({peerId: (window as any).rootScope.myId}));
    await expect(page.locator('.chat.active .btn-send')).toBeVisible();

    // * a picture attached and opened in the editor, one change made so it can finish
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext('2d').fillRect(0, 0, 320, 240);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.chat.active .attach-file').first().click();
    await page.locator('.btn-menu-item', {hasText: 'Photo or Video'}).first().click();
    await (await chooser).setFiles({name: 'switch.png', mimeType: 'image/png', buffer: png});
    await expect(page.locator('.popup-new-media img').first()).toBeVisible();
    // * the item takes its actions once it has settled
    await page.waitForTimeout(800);
    await page.locator('.popup-new-media img').first().hover();
    await page.locator('.popup-item-media-action-menu > .popup-item-media-action:not(.spoiler-toggle)').first().click();
    await expect(page.locator('.media-editor__overlay')).toBeVisible();
    await page.locator('.media-editor__overlay input[aria-label="Enhance"]').fill('40');
    await expect(page.locator('.media-editor__finish-button:not(.media-editor__finish-button--hidden)')).toBeVisible();

    await page.evaluate(() => {
      (document.querySelector('.media-editor__finish-button') as HTMLElement).click();
      void (window as any).switchAccount(2);
    });
    await waitForChatList(page);
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => ({
      editors: document.querySelectorAll('.media-editor__overlay').length,
      // * the result's preview flies over the screens on a fixed picture of its own
      previews: [...document.body.querySelectorAll('img')].filter((img) => getComputedStyle(img).position === 'fixed').length
    })), 'the previous account\'s editor left something behind').toEqual({editors: 0, previews: 0});
  });

  test('the media editor closed before its picture renders takes the picture it flew in on along', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    await page.evaluate(() => (window as any).appImManager.setInnerPeer({peerId: (window as any).rootScope.myId}));
    await expect(page.locator('.chat.active .btn-send')).toBeVisible();

    // * a big picture: the editor takes a while to render it
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2400;
      canvas.height = 1800;
      canvas.getContext('2d').fillRect(0, 0, 2400, 1800);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.chat.active .attach-file').first().click();
    await page.locator('.btn-menu-item', {hasText: 'Photo or Video'}).first().click();
    await (await chooser).setFiles({name: 'big.png', mimeType: 'image/png', buffer: png});
    await expect(page.locator('.popup-new-media img').first()).toBeVisible();
    await page.waitForTimeout(800);
    await page.locator('.popup-new-media img').first().hover();
    await page.locator('.popup-item-media-action-menu > .popup-item-media-action:not(.spoiler-toggle)').first().click();
    await expect(page.locator('.media-editor__overlay')).toBeVisible();

    await page.evaluate(() => {
      void (window as any).switchAccount(2);
    });
    await waitForChatList(page);
    await page.waitForTimeout(2000);
    // * the picture the editor flew in on: a fixed canvas over everything until the editor's own renders
    expect(await page.evaluate(() => [...document.querySelectorAll('canvas')].filter((canvas) => {
      return canvas.style.position === 'fixed' && canvas.style.zIndex === '1000';
    }).length), 'the previous account\'s picture stayed over the screens').toBe(0);
  });

  test('the media viewer goes even mid-step', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');
    // * the rows come in pages
    await page.waitForTimeout(2000);

    // * a chat with a few photos, opened at one with more on either side
    const found = await page.evaluate(async() => {
      const w = window as any;
      const rows = [...document.querySelectorAll<HTMLElement>('#folders-container .chatlist-chat[data-peer-id]')].slice(0, 20);
      for(const row of rows) {
        const peerId = row.dataset.peerId.toPeerId();
        const history = await w.rootScope.managers.appMessagesManager.getHistory({
          peerId,
          inputFilter: {_: 'inputMessagesFilterPhotos'},
          limit: 4
        }).catch((): undefined => undefined);
        if(history?.history?.length >= 3) return {peerId, mid: history.history[1] as number};
      }
    });
    test.skip(!found, 'account 1 has no chat with photos to page through');

    await page.evaluate(({peerId, mid}) => (window as any).appImManager.setInnerPeer({peerId, lastMsgId: mid}), found);
    await page.locator(`.chat.active .bubble[data-mid="${found.mid}"] .media-photo`).first().click();
    await expect(page.locator('.media-viewer-whole.active')).toBeVisible();
    // * done opening: the step below is the only move
    await page.waitForFunction(() => !(window as any).appMediaViewer.setMoverAnimationPromise);
    await page.waitForTimeout(500);

    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => !!(window as any).appMediaViewer?.setMoverAnimationPromise, null, {polling: 'raf', timeout: 2000});
    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    await expect(page.locator('.media-viewer-whole'), 'the previous account\'s media stayed open').toHaveCount(0);
  });

  test('the stories viewer still waiting for its first story goes with the switch', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');
    const peerId = await page.evaluate(async() => {
      const all = await (window as any).rootScope.managers.appStoriesManager.getAllStories(false).catch((): undefined => undefined);
      const peer = all?.peer_stories?.find((peerStories: any) => peerStories.stories?.length)?.peer;
      return peer && (peer.user_id ? +peer.user_id : -(peer.channel_id || peer.chat_id));
    });
    test.skip(!peerId, 'account 1 sees no stories to open');

    const overlaysBefore = await page.evaluate(() => (window as any).overlayCounter.overlaysActive);
    // * the viewer is there, its first story not shown yet, when the switch comes
    await page.evaluate(async(peerId) => {
      const w = window as any;
      void w.appImManager.openStoriesForPeer(peerId);
      while(!w.appNavigationController.findItemByType('stories')) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      void w.switchAccount(2);
    }, peerId);
    await waitForChatList(page);
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => document.getElementById('stories-viewer')?.childElementCount),
      'the previous account\'s stories stayed open').toBe(0);
    // * it never showed, so it held no overlay to give back - the next modal still counts as one
    expect(await page.evaluate(() => (window as any).overlayCounter.overlaysActive)).toBe(overlaysBefore);
  });
});

/*
 * What waits on the browser - the position, a picked file - and then writes belongs to the account session it
 * was asked in: once the tab is on another account it is not done at all, rather than done on the account
 * shown. A write that did leave would be caught on its way to the worker and never sent; one that is not sent
 * says so in the console, which is what shows the flow got as far as it.
 */
test.describe('switching accounts while the browser is asked', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}, permissions: ['geolocation'], geolocation: {latitude: 52.52, longitude: 13.4}});

  // * what the page leaves unsent, by the console's word
  const catchWrites = async(page: Page, method: string) => {
    const notSent: string[] = [];
    page.on('console', (message) => {
      if(message.type() === 'debug' && message.text().includes('not sent: its account session is over')) {
        notSent.push(message.text());
      }
    });

    await page.addInitScript((method) => {
      const w = window as any;
      w.__caught = [];
      // * the position comes a while after it is asked for
      const getCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (resolve, reject, options) => {
        setTimeout(() => getCurrentPosition(resolve, reject, options), 2500);
      };
      const interval = setInterval(() => {
        if(!w.apiManagerProxy) return;
        clearInterval(interval);
        if(w.apiManagerProxy.__caught) return;
        w.apiManagerProxy.__caught = true;
        const invoke = w.apiManagerProxy.invoke.bind(w.apiManagerProxy);
        w.apiManagerProxy.invoke = (type: string, payload: any, ...rest: any[]) => {
          if(type === 'manager' && payload?.method === method) {
            w.__caught.push(payload.accountNumber);
            return new Promise(() => {});
          }

          return invoke(type, payload, ...rest);
        };
      }, 5);
    }, method);
    return notSent;
  };

  const open = async(page: Page) => {
    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');
  };

  test('a location asked for by a bot is not sent once the tab is on another account', async({page}) => {
    test.setTimeout(5 * 60_000);
    const notSent = await catchWrites(page, 'sendOther');
    await open(page);

    await page.evaluate(() => {
      void (window as any).appImManager.requestLocation({peerId: (window as any).rootScope.myId});
    });
    await page.locator('.popup button', {hasText: 'OK'}).first().click();
    // * the browser is still finding the position
    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    await expect.poll(() => notSent.some((text) => text.includes('appMessagesManager.sendOther')), {timeout: 10_000}).toBe(true);
    expect(await page.evaluate(() => (window as any).__caught)).toEqual([]);
  });

  test('a wallpaper picked as the switch comes is uploaded to neither account', async({page}) => {
    test.setTimeout(5 * 60_000);
    const notSent = await catchWrites(page, 'prepareWallPaperUpload');
    await open(page);

    await page.locator('#column-left .sidebar-tools-button').click();
    await page.locator('.btn-menu-item', {hasText: 'Settings'}).first().click();
    await page.locator('.row', {hasText: 'General Settings'}).first().click();
    await page.locator('.row', {hasText: 'Chat Wallpaper'}).first().click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.btn-primary', {hasText: 'Upload Wallpaper'}).first().click();
    const fileChooser = await chooser;

    // * the file comes from the dialog once the tab shows another account
    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      canvas.getContext('2d').fillRect(0, 0, 640, 480);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await fileChooser.setFiles({name: 'wall.png', mimeType: 'image/png', buffer: png});
    await expect.poll(() => notSent.some((text) => text.includes('appDocsManager.prepareWallPaperUpload')), {timeout: 10_000}).toBe(true);
    expect(await page.evaluate(() => (window as any).__caught)).toEqual([]);
  });

  test('a public photo picked as the switch comes opens no editor over the next account and sets nothing', async({page}) => {
    test.setTimeout(5 * 60_000);
    await catchWrites(page, 'uploadProfilePhoto');
    await open(page);

    await page.locator('#column-left .sidebar-tools-button').click();
    await page.locator('.btn-menu-item', {hasText: 'Settings'}).first().click();
    await page.locator('.row', {hasText: 'Privacy and Security'}).first().click();
    await page.locator('.row', {hasText: 'Who can see my profile photos?'}).first().click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('text=/(Set|Update) Public Photo/').first().click();
    const fileChooser = await chooser;

    // * the file comes from the dialog once the tab shows another account
    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 640;
      canvas.getContext('2d').fillRect(0, 0, 640, 640);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const editorNotOpened = page.waitForEvent('console', {
      predicate: (message) => message.type() === 'debug' && message.text().includes('[media editor] not opened'),
      timeout: 20_000
    });
    await fileChooser.setFiles({name: 'photo.png', mimeType: 'image/png', buffer: png});
    await editorNotOpened;
    await expect(page.locator('.media-editor__overlay')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__caught)).toEqual([]);
  });
});

/*
 * What a screen waits for from the worker can come back while the switch is closing the previous account's
 * screens: the account is still the previous one then, but what opens or writes now is over the next one.
 */
test.describe('switching accounts while a screen waits for its data', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test('an avatar viewer still asking about its photo does not open over the next account', async({page}) => {
    test.setTimeout(5 * 60_000);

    await holdManagerCallsUntilTheSwitch(page);
    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');
    await page.waitForTimeout(2000);

    // * someone with a profile photo: their avatar viewer asks whether it may delete it before it opens
    const peerId = await page.evaluate(async() => {
      const w = window as any;
      const rows = [...document.querySelectorAll<HTMLElement>('#folders-container .chatlist-chat[data-peer-id]')].slice(0, 30);
      for(const row of rows) {
        const peerId = row.dataset.peerId.toPeerId();
        if(!peerId.isUser() || peerId === w.rootScope.myId) continue;
        const photo = await w.rootScope.managers.appProfileManager.getFullPhoto(peerId).catch((): undefined => undefined);
        if(photo?._ === 'photo') {
          w.__avatarPhoto = photo;
          return peerId;
        }
      }
    });
    test.skip(!peerId, 'account 1 has no chat with someone with a profile photo');

    // * a string: the module is the app's own, as the dev server serves it
    await page.evaluate(`(async() => {
      const {default: AppMediaViewerAvatar} = await import('/src/components/mediaViewer/avatar.ts');
      window.__hold = 'appUsersManager.getUser';
      new AppMediaViewerAvatar(${peerId}).openMedia({photoId: window.__avatarPhoto.id, photo: window.__avatarPhoto});
    })()`);
    await expect.poll(() => page.evaluate(() => (window as any).__held.length)).toBeGreaterThan(0);

    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    await page.waitForTimeout(1500);
    await expect(page.locator('.media-viewer-whole'), 'the previous account\'s avatar opened over the next one').toHaveCount(0);
  });

  test('a voice message\'s sender read as the switch comes is not named in the OS media panel', async({page}) => {
    test.setTimeout(5 * 60_000);

    await holdManagerCallsUntilTheSwitch(page);
    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    // * a voice message playing: the panel is told its sender, whose photo is asked for first
    await page.evaluate(() => {
      const w = window as any;
      const controller = w.appMediaPlaybackController;
      const audio = new Audio();
      Object.defineProperty(audio, 'readyState', {get: () => 4});
      controller.playingMedia = audio;
      w.__hold = 'appPeersManager.getPeerPhoto';
      controller.setNewMediadata({
        _: 'message',
        mid: 1,
        peerId: w.rootScope.myId,
        fromId: w.rootScope.myId,
        media: {_: 'messageMediaDocument', document: {_: 'document', id: '1', type: 'voice', mime_type: 'audio/ogg'}}
      }, audio);
    });
    await expect.poll(() => page.evaluate(() => (window as any).__held.length)).toBeGreaterThan(0);

    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => navigator.mediaSession.metadata?.title ?? null),
      'the previous account\'s voice message is named').toBeNull();
  });

  test('files still read as the switch comes are attached to no chat of the next account', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    const openSaved = async() => {
      await page.evaluate(() => (window as any).appImManager.setInnerPeer({peerId: (window as any).rootScope.myId}));
      await expect(page.locator('.chat.active .btn-send')).toBeVisible();
    };
    await openSaved();

    // * a folder pasted into the chat: its files are read one by one, and this one takes till after the switch
    await page.evaluate(() => {
      const w = window as any;
      w.__getAsEntry = DataTransferItem.prototype.webkitGetAsEntry;
      DataTransferItem.prototype.webkitGetAsEntry = function(this: DataTransferItem) {
        const file = this.getAsFile();
        return {
          isDirectory: true,
          createReader: () => ({readEntries: (callback: (entries: File[]) => void) => w.__finishReading = () => callback([file])})
        } as any;
      };

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      canvas.getContext('2d').fillRect(0, 0, 64, 64);
      const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'folder.png', {type: 'image/png'}));
      document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
    });
    await expect.poll(() => page.evaluate(() => !!(window as any).__finishReading)).toBe(true);

    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    // * and a chat of the next account is open by the time the folder is read
    await openSaved();
    await page.evaluate(() => {
      const w = window as any;
      DataTransferItem.prototype.webkitGetAsEntry = w.__getAsEntry;
      w.__finishReading();
    });
    await page.waitForTimeout(2000);
    await expect(page.locator('.popup-new-media'), 'the previous account\'s files are about to go from the next one').toHaveCount(0);
  });

  test('a switch back queued behind the running one keeps the session it leaves leaving', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    // * a string: the module is the app's own, as the dev server serves it
    const leaving = await page.evaluate(`(async() => {
      const {getAccountSession, isSessionLeaving} = await import('/src/lib/accounts/getCurrentAccount.ts');
      const session = getAccountSession();
      const there = window.switchAccount(2);
      const back = window.switchAccount(1);
      // * what account 1 still asks to open now would stand over account 2
      const leaving = isSessionLeaving(session);
      await there;
      const leavingAfter = isSessionLeaving(session);
      await back;
      return {leaving, leavingAfter};
    })()`);
    expect(leaving, 'account 1 looked like staying while it was being left').toEqual({leaving: true, leavingAfter: true});
    await waitForChatList(page);
  });

  test('a forum asked for twice as the switch comes opens on neither account', async({page}) => {
    test.setTimeout(5 * 60_000);

    await holdManagerCallsUntilTheSwitch(page);
    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');
    await page.waitForTimeout(2000);

    const peerId = await page.evaluate(async() => {
      const w = window as any;
      const lists = await Promise.all([0, 1].map((filterId) => {
        return w.rootScope.managers.dialogsStorage.getDialogs({filterId, limit: 200}).catch((): undefined => undefined);
      }));
      return lists.flatMap((list) => list?.dialogs || []).map((dialog: any) => dialog.peerId as PeerId)
      .find((peerId) => !peerId.isUser() && w.apiManagerProxy.getChat(peerId.toChatId())?.pFlags?.forum);
    });
    test.skip(!peerId, 'account 1 is in no forum');

    // * two clicks on the forum: the first one's dialog read comes back only once the tab is on account 2,
    // * the second one waits behind it
    await page.evaluate((peerId) => {
      const w = window as any;
      w.__hold = 'dialogsStorage.getDialogOnly';
      w.__holdPastTheSwitch = true;
      w.__forumChat = w.apiManagerProxy.getPeer(peerId);
      w.__forumOpens = [
        w.appDialogsManager.toggleForumTabByPeerId(peerId, true),
        w.appDialogsManager.toggleForumTabByPeerId(peerId, true)
      ].map((promise: Promise<any>) => promise.catch((): undefined => undefined));
    }, peerId);
    await expect.poll(() => page.evaluate(() => (window as any).__held.length)).toBeGreaterThan(0);

    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    // * what is asked about the forum from here on, and of which account - account 2 knowing the forum too, as
    // * when both are in it
    await page.evaluate((peerId) => {
      const w = window as any;
      w.apiManagerProxy.mirrors.peers[peerId] = w.__forumChat;
      w.__forumAskedOf = [];
      const invoke = w.apiManagerProxy.invoke.bind(w.apiManagerProxy);
      w.apiManagerProxy.invoke = (type: string, payload: any, ...rest: any[]) => {
        if(type === 'manager' && payload?.method === 'getDialogOnly' && payload.args?.[0] === peerId) {
          w.__forumAskedOf.push(payload.accountNumber);
        }

        return invoke(type, payload, ...rest);
      };
    }, peerId);
    await page.evaluate(() => {
      const w = window as any;
      w.__releaseHeld();
      return Promise.all(w.__forumOpens);
    });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).__forumAskedOf), 'account 1\'s forum was asked of account 2').not.toContain(2);
    expect(await page.evaluate((peerId) => {
      const w = window as any;
      return w.appDialogsManager.forumTab?.peerId === peerId ||
        w.appSidebarLeft.getHistory().some((tab: any) => tab.peerId === peerId);
    }, peerId), 'account 1\'s forum opened on account 2').toBe(false);
  });

  test('the tab knows who the new account is as soon as it takes the account\'s events', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');

    // * an incoming call is checked against whom it is addressed to: the account's own id
    const userId = await page.evaluate(async() => (await (window as any).AccountController.get(2)).userId);
    await page.evaluate(() => {
      const w = window as any;
      const update = w.apiManagerProxy.updateTabState.bind(w.apiManagerProxy);
      w.apiManagerProxy.updateTabState = (key: string, value: any) => {
        if(key === 'accountNumber') w.__myIdThen = w.rootScope.myId;
        return update(key, value);
      };
    });
    await page.evaluate(() => (window as any).switchAccount(2));
    expect(await page.evaluate(() => (window as any).__myIdThen), 'the new account\'s events met the previous account\'s id').toBe(userId);
  });

  test('the birthday suggestions ask the new account for its contacts\' birthdays', async({page}) => {
    test.setTimeout(5 * 60_000);

    await recordManagerCalls(page, 'appPromoManager.getContactBirthdays');
    await page.goto('/?account=1');
    await waitForChatList(page);
    const accounts = await page.evaluate(() => (window as any).AccountController.getTotalAccounts());
    test.skip(accounts < 2, 'the preview has one account - start it with TWEB_SECOND_SEED');
    const asked = await page.waitForFunction(() => {
      return (window as any).__calls['appPromoManager.getContactBirthdays'].includes(1);
    }, null, {timeout: 15_000}).then(() => true, () => false);
    test.skip(!asked, 'the suggestions ask for no birthdays here (purchases blocked)');

    await page.evaluate(() => (window as any).switchAccount(2));
    await waitForChatList(page);
    await expect.poll(() => readManagerCalls(page, 'appPromoManager.getContactBirthdays'), {
      timeout: 10_000,
      message: 'the previous account\'s birthdays stayed'
    }).toContain(2);
  });
});

// * the accounts a manager method ('appPromoManager.getContactBirthdays') is called on, in order
function recordManagerCalls(page: Page, key: string) {
  return page.addInitScript((key) => {
    const w = window as any;
    w.__calls ??= {};
    w.__calls[key] = [];
    const interval = setInterval(() => {
      if(!w.apiManagerProxy) return;
      clearInterval(interval);
      if(w.apiManagerProxy.__recording) return;
      w.apiManagerProxy.__recording = true;
      const invoke = w.apiManagerProxy.invoke.bind(w.apiManagerProxy);
      w.apiManagerProxy.invoke = (type: string, payload: any, ...rest: any[]) => {
        if(type === 'manager') {
          w.__calls[`${payload?.name}.${payload?.method}`]?.push(payload.accountNumber);
        }

        return invoke(type, payload, ...rest);
      };
    }, 5);
  }, key);
}

function readManagerCalls(page: Page, key: string): Promise<number[]> {
  return page.evaluate((key) => (window as any).__calls[key], key);
}

/**
 * Holds back the manager call `window.__hold` names ('appUsersManager.getUser') until the switch has closed what
 * was open, and lets it go then: what it brings comes back while the switch is still at the previous account.
 * With `window.__holdPastTheSwitch` it is let go only by `window.__releaseHeld()`, and only the first such call
 * is held: the next account's screens make the same calls.
 */
function holdManagerCallsUntilTheSwitch(page: Page) {
  return page.addInitScript(() => {
    const w = window as any;
    w.__held = [];
    const interval = setInterval(() => {
      if(!w.apiManagerProxy || !w.appMediaPlaybackController) return;
      clearInterval(interval);
      if(w.apiManagerProxy.__holding) return;
      w.apiManagerProxy.__holding = true;
      const invoke = w.apiManagerProxy.invoke.bind(w.apiManagerProxy);
      w.apiManagerProxy.invoke = (type: string, payload: any, ...rest: any[]) => {
        if(type === 'manager' && w.__hold === `${payload?.name}.${payload?.method}`) {
          if(w.__holdPastTheSwitch) w.__hold = undefined;
          return new Promise((resolve) => w.__held.push(resolve)).then(() => invoke(type, payload, ...rest));
        }

        return invoke(type, payload, ...rest);
      };

      w.__releaseHeld = () => {
        w.__hold = undefined;
        w.__held.splice(0).forEach((resolve: () => void) => resolve());
      };

      // * the switch's first step closes what floats above the screens, playback among them
      const controller = w.appMediaPlaybackController;
      const reset = controller.resetForAccountSwitch.bind(controller);
      controller.resetForAccountSwitch = () => {
        reset();
        if(!w.__holdPastTheSwitch) setTimeout(w.__releaseHeld, 0);
      };
    }, 5);
  });
}

// * CALL_STATE
const CALL_CONNECTED = 0;
const CALL_PENDING = 3;

function readCall(page: Page, peerId: PeerId) {
  return page.evaluate((peerId) => {
    const w = window as any;
    const call = w.callsController.getCallByUserId(peerId);
    return {
      sameDocument: !!w.__sameDocument,
      tabMyId: w.rootScope.myId,
      state: call ? call.connectionState : null,
      accountNumber: call?.accountNumber,
      remoteMuted: !!call?.getMediaState('output')?.muted,
      calling: document.body.classList.contains('is-calling'),
      panel: !!document.querySelector('.popup-call')
    };
  }, peerId);
}

async function waitForChatList(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('#folders-container .chatlist-chat').length > 0,
    null, {timeout: 180_000});
}

// * the burger menu lists the other accounts; picking one is the switch
async function switchFromMenu(page: Page) {
  const myId = await page.evaluate(() => (window as any).rootScope.myId);
  await page.locator('#column-left .sidebar-tools-button').click();
  await page.locator('.btn-menu-account-item').first().click();
  await page.waitForFunction((myId) => (window as any).rootScope.myId !== myId, myId);
  await waitForChatList(page);
  // * the rows come in pages; the first one is what is checked
  await page.waitForTimeout(2000);
}

async function readAccount(page: Page) {
  return page.evaluate(async() => {
    const w = window as any;
    const elements = [...document.querySelectorAll<HTMLElement>('#folders-container .chatlist-chat')];
    const rows = elements.map((row) => row.dataset.peerId).filter(Boolean);
    // * the first rows as they read: titles of the dialogs, the whole text of anything else (the archive)
    const texts = elements.slice(0, 8).map((row) => {
      return row.dataset.peerId ?
        row.querySelector('.peer-title')?.textContent :
        row.textContent.replace(/\s+/g, ' ').trim();
    });
    const dialogs = await Promise.all(rows.map((peerId) => w.rootScope.managers.dialogsStorage.getAnyDialog(peerId.toPeerId())));
    return {
      sameDocument: !!w.__sameDocument,
      myId: w.rootScope.myId,
      accountInUrl: +(new URL(location.href).searchParams.get('account') || 1),
      hasChat: document.body.classList.contains('has-chat'),
      rows,
      texts,
      foreignRows: rows.filter((_, index) => !dialogs[index])
    };
  });
}
