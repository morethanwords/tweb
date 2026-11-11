import { parseMesh, type Mesh } from './mesh.js';
import type { StarAssets } from './options.js';
import type { Textures } from './renderer.js';
import { STAR_TEXTURE_PATH } from './shaders.js';

export interface Loaded {
  mesh: Mesh;
  textures: Textures;
}

const DEFAULT_BASE = new URL(/* @vite-ignore */ '../assets/', import.meta.url);
const byUrl = new Map<string, Promise<Loaded>>();
const byBytes = new WeakMap<ArrayBuffer, Mesh>();
let starTexture: HTMLCanvasElement | undefined;

/** SvgHelper.getBitmap(R.raw.start_texture, 240, 240, Color.WHITE) of the 1024 x 1024 file. */
function star(): HTMLCanvasElement {
  if (!starTexture) {
    starTexture = document.createElement('canvas');
    starTexture.width = starTexture.height = 240;
    const ctx = starTexture.getContext('2d')!;
    ctx.scale(240 / 1024, 240 / 1024);
    ctx.fillStyle = '#fff';
    ctx.fill(new Path2D(STAR_TEXTURE_PATH));
  }
  return starTexture;
}

async function fetchMesh(url: string): Promise<Mesh> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return parseMesh(await res.arrayBuffer());
}

async function image(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  // WebGL takes a cross-origin image only with CORS.
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

/** The base URL as a folder, so that a base without its trailing slash still keeps its last segment. */
export function baseUrl(base: string | URL = DEFAULT_BASE): string {
  const href = new URL(base, typeof document === 'undefined' ? undefined : document.baseURI).href;
  return href.endsWith('/') ? href : `${href}/`;
}

export function loadAssets(source?: string | URL | StarAssets): Promise<Loaded> {
  if (source && typeof source === 'object' && !(source instanceof URL)) {
    let mesh = byBytes.get(source.mesh);
    if (!mesh) byBytes.set(source.mesh, (mesh = parseMesh(source.mesh)));
    return Promise.resolve({ mesh, textures: { star: star(), flecks: source.flecks } });
  }
  const base = baseUrl(source as string | URL | undefined);
  let loaded = byUrl.get(base);
  if (!loaded) {
    loaded = Promise.all([fetchMesh(new URL('star.mesh', base).href), image(new URL('flecks.png', base).href)]).then(([mesh, flecks]) => ({
      mesh,
      textures: { star: star(), flecks },
    }));
    byUrl.set(base, loaded);
    // A failed load is not kept, so a later star tries again.
    loaded.catch(() => byUrl.delete(base));
  }
  return loaded;
}
