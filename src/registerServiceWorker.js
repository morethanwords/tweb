/*
 *  Copyright (c) 2018-present, Evgeny Nadymov
 *
 * This source code is licensed under the GPL v.3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

//import TdLibController from './Controllers/TdLibController';

// In production, we register a service worker to serve assets from local cache.

// This lets the app load faster on subsequent visits in production, and gives
// it offline capabilities. However, it also means that developers (and users)
// will only see deployed updates on the "N+1" visit to a page, since previously
// cached resources are updated in the background.

// To learn more about the benefits of this model, read https://goo.gl/KwvDNy.
// This link also includes instructions on opting out of this behavior.

const isLocalhost =
    //false;
    Boolean(
        window.location.hostname === 'localhost' ||
            // [::1] is the IPv6 localhost address.
            window.location.hostname === '[::1]' ||
            // 127.0.0.1/8 is considered localhost for IPv4.
            window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
    );

export default async function register() {
    console.log('[SW] Register');

    if('serviceWorker' in navigator) {
        // The URL constructor is available in all browsers that support SW.
        const publicUrl = new URL(process.env.PUBLIC_URL, window.location);
        if(publicUrl.origin !== window.location.origin) {
            // Our service worker won't work if PUBLIC_URL is on a different origin
            // from what our page is served on. This might happen if a CDN is used to
            // serve assets; see https://github.com/facebookincubator/create-react-app/issues/2374
            return;
        }

        const serviceWorkerName =
            process.env.NODE_ENV === 'production' ? 'service-worker.js' : 'custom-service-worker.js';
        const swUrl = `${process.env.PUBLIC_URL}/${serviceWorkerName}`;
        console.log(`[SW] Service worker url: ${swUrl}`);

        if(!isLocalhost) {
            // Is not local host. Just register service worker
            await registerValidSW(swUrl);
        } else {
            // This is running on localhost. Lets check if a service worker still exists or not.
            await checkValidServiceWorker(swUrl);
        }
    }
}

async function registerValidSW(swUrl) {
    console.log('[SW] RegisterValidSW');
    try {
        const registration = await navigator.serviceWorker.register(swUrl);
        registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            installingWorker.onstatechange = () => {
                if(installingWorker.state === 'installed') {
                    if(navigator.serviceWorker.controller) {
                        // At this point, the old content will have been purged and
                        // the fresh content will have been added to the cache.
                        // It's the perfect time to display a "New content is
                        // available; please refresh." message in your web app.
                        console.log('[SW] New content is available; please refresh.');

                        ApplicationStore.emit('clientUpdateNewContentAvailable');
                    } else {
                        // At this point, everything has been precached.
                        // It's the perfect time to display a
                        // "Content is cached for offline use." message.
                        console.log('[SW] Content is cached for offline use.');
                    }
                }
            };
        };
    } catch (error) {
        console.error('[SW] Error during service worker registration: ', error);
    }
}

async function checkValidServiceWorker(swUrl) {
    console.log('[SW] CheckValidServiceWorker');
    // Check if the service worker can be found. If it can't reload the page.
    try {
        const response = await fetch(swUrl);

        // Ensure service worker exists, and that we really are getting a JS file.
        if(response.status === 404 || response.headers.get('content-type').indexOf('javascript') === -1) {
            // No service worker found. Probably a different app. Reload the page.
            const registration = await navigator.serviceWorker.ready;
            await registration.unregister();

            window.location.reload();
        } else {
            // Service worker found. Proceed as normal.
            await registerValidSW(swUrl);
        }
    } catch(error) {
        console.log('[SW] No internet connection found. App is running in offline mode.');
    }
}

export async function unregister() {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;

        await registration.unregister();
    }
}

export async function update() {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;

        await registration.update();
    }
}
