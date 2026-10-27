import {version} from 'vite';

/**
 * `vite build --watch` runs every transform again on every rebuild: rolldown's watcher keeps no
 * module graph between builds (`experimental.incrementalBuild` changes nothing there), so a one-line
 * edit pays for Babel over all ~2700 modules and for Sass over every stylesheet — most of a 15-20 s
 * rebuild.
 *
 * This keeps the results of the transforms that depend on nothing but a module's source and the
 * files it pulls in: the same source gives back the last result, and a module goes through the
 * plugin again when its source changes or when one of those files does (a Sass partial). A one-off
 * build is left alone.
 */

// The CSS caching leans on how Vite's own CSS plugins keep state between builds, and was checked
// against these versions; on any other it stays off until checked again (compare a watched rebuild
// with a clean build of the same tree, CSS modules included).
const CSS_CACHE_CHECKED = /^8\.3\./;

const HTML_PROXY = /[?&]html-proxy\b/;
// An emitted file (an image or a font a stylesheet points at) is referred to by an id that means
// something only in the build that issued it — and Vite issues it once per build, to the first module
// that asks, so a result can carry one without having emitted anything itself.
const BUILD_SCOPED_REFERENCE = /__VITE_ASSET__|ROLLDOWN_FILE_URL_/;

const outputOf = (result) => typeof result === 'string' ? result : result?.code;

export default function watchTransformCache() {
  const caches = [];

  return {
    name: 'tweb:watch-transform-cache',
    apply: 'build',
    configResolved(config) {
      if(!config.build.watch) {
        return;
      }

      const cache = (name, canReuse) => {
        const plugin = config.plugins.find((plugin) => plugin.name === name);
        if(!plugin?.transform) {
          return;
        }

        const entries = new Map();
        caches.push(entries);
        plugin.transform = cacheTransform(plugin.transform, entries, canReuse);
        return entries;
      };

      // Babel with babel-preset-solid
      cache('solid');

      if(!CSS_CACHE_CHECKED.test(version)) {
        config.logger.warn(`[watch-transform-cache] Vite ${version} is not one the CSS caching was checked against: only Babel is cached`);
        return;
      }

      // What a stylesheet becomes in JS. Its own state — the CSS it collects for the chunks — lives
      // as long as the watcher, so a reused result loses nothing.
      const cssPost = cache('vite:css-post');
      // Sass, PostCSS and CSS modules. vite:css hands a CSS module's class map to vite:css-post
      // through a map it empties on every build, so a result of its own is reused only when
      // vite:css-post is about to reuse the one it made of it — or the classes would be gone.
      cache('vite:css', (id, entry) => cssPost?.get(id)?.code === outputOf(entry.result));
    },
    watchChange(file) {
      // a changed source is caught by comparing it; a changed file it pulled in is not
      for(const cache of caches) {
        for(const [id, entry] of cache) {
          if(entry.deps.has(file)) {
            cache.delete(id);
          }
        }
      }
    }
  };
}

function cacheTransform(hook, cache, canReuse = () => true) {
  const handler = typeof hook === 'function' ? hook : hook.handler;

  async function transform(code, id, ...args) {
    const entry = cache.get(id);
    if(entry?.code === code && canReuse(id, entry)) {
      // what a build watches is collected anew each time
      entry.deps.forEach((dep) => this.addWatchFile(dep));
      return entry.result;
    }

    const deps = new Set();
    const addWatchFile = (dep) => {
      deps.add(dep);
      this.addWatchFile(dep);
    };
    const context = new Proxy(this, {
      get(target, key) {
        if(key === 'addWatchFile') {
          return addWatchFile;
        }

        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });

    const result = await handler.call(context, code, id, ...args);
    const output = outputOf(result);
    // an inline <style> of index.html is handed over through state of its own
    if(!HTML_PROXY.test(id) && !(output && BUILD_SCOPED_REFERENCE.test(output))) {
      cache.set(id, {code, result, deps});
    } else {
      cache.delete(id);
    }

    return result;
  }

  return typeof hook === 'function' ? transform : {...hook, handler: transform};
}
