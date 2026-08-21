// @ts-check

/**
 * Converts a Lottie icon into a self-contained animated SVG.
 *
 * Usage:
 *   node ./src/scripts/lottie_to_svg.js <file.json|dir> [-o <outDir>] [--label <text>]
 *
 * The motion is emitted as SMIL (`animateTransform` / `animate`) rather than as
 * CSS animations on purpose: icons that morph their outline need the path data
 * itself animated, and the CSS `d` property is not supported by Safari in any
 * version. SMIL path animation has worked there since Safari 6.
 *
 * Only the feature set Telegram's player icons use is supported; anything else
 * throws instead of silently rendering something different from the source.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OUT_DIR = path.join(__dirname, './out/lottie');
const IDENTITY = {translate: '0 0', rotate: '0', scale: '1 1'};

/** Group transform components, in the order Lottie composes them. */
const COMPONENTS = [
  {kind: 'translate', key: 'p', format: (value) => point(value[0], value[1])},
  {kind: 'rotate', key: 'r', format: (value) => num(scalar(value))},
  {kind: 'scale', key: 's', format: (value) => point(value[0] / 100, value[1] / 100)},
  {kind: 'translate', key: 'a', format: (value) => point(-value[0], -value[1])}
];

const assert = (condition, message) => {
  if(!condition) {
    throw new Error(message);
  }
};

const trim = (str) => {
  const trimmed = str.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '' || trimmed === '-0' ? '0' : trimmed;
};

const num = (value) => trim(value.toFixed(4));

/** Timing needs more precision than geometry: 4 decimals on a fractional
 * keyTime is worth ~0.03px of drift once the icon is drawn at 240px. */
const num6 = (value) => trim(value.toFixed(6));

const point = (x, y) => `${num(x)} ${num(y)}`;

const scalar = (value) => Array.isArray(value) ? value[0] : value;

/**
 * Lottie bezier shape -> SVG path data. Always emits M + N*C + Z so that two
 * keyframes of the same shape stay structurally identical and can interpolate.
 */
const pathData = (shape) => {
  const {v, i, o} = shape;
  const closed = shape.c !== false;
  const out = [`M${point(v[0][0], v[0][1])}`];
  const segments = closed ? v.length : v.length - 1;
  for(let k = 0; k < segments; ++k) {
    const from = v[k];
    const next = (k + 1) % v.length;
    const to = v[next];
    out.push('C' + [
      point(from[0] + o[k][0], from[1] + o[k][1]),
      point(to[0] + i[next][0], to[1] + i[next][1]),
      point(to[0], to[1])
    ].join(' '));
  }

  if(closed) {
    out.push('Z');
  }

  return out.join(' ');
};

/** Lottie out/in tangents of a keyframe -> SMIL keySplines. */
const easing = (keyframe) => {
  const {i, o} = keyframe;
  [['o.x', o.x], ['o.y', o.y], ['i.x', i.x], ['i.y', i.y]].forEach(([name, raw]) => {
    assert(!Array.isArray(raw) || raw.every((value) => Math.abs(value - raw[0]) < 1e-9),
      `per-component easing on ${name} is not supported`);
  });

  return [o.x, o.y, i.x, i.y].map((value) => num(scalar(value))).join(' ');
};

/** The shared timeline of a set of properties, or nulls when none animate. */
const keyframeTimes = (properties) => {
  let times = null;
  let ease = null;
  properties.forEach((property) => {
    if(!property || !property.a) {
      return;
    }

    const current = property.k.map((keyframe) => keyframe.t);
    assert(current.length === 2, `only 2-keyframe properties are supported, got ${current.length}`);
    assert(!times || times.join() === current.join(), 'properties disagree on keyframe times');
    times = current;

    const currentEase = easing(property.k[0]);
    assert(!ease || ease === currentEase, 'properties disagree on easing');
    ease = currentEase;
  });

  return {times, ease};
};

const valueAt = (property, time) => {
  if(!property.a) {
    return property.k;
  }

  const keyframe = property.k.find((item) => item.t === time);
  assert(keyframe, `no keyframe at t=${time}`);
  return keyframe.s;
};

const isIdentity = (transform) => {
  if(['p', 'a', 's', 'r'].some((key) => transform[key].a)) {
    return false;
  }

  const {p, a, s} = transform;
  return p.k[0] === a.k[0] && p.k[1] === a.k[1] &&
    s.k[0] === 100 && s.k[1] === 100 && scalar(transform.r.k) === 0;
};

/**
 * Lottie transform -> ordered SVG transform components. Identity constants are
 * dropped; everything else keeps the translate / rotate / scale / -anchor order
 * so the composed matrix matches what a Lottie player would build.
 */
const components = (transform, times) => {
  ['sk', 'sa'].forEach((key) => {
    assert(!transform[key] || (!transform[key].a && scalar(transform[key].k) === 0),
      'skew is not supported');
  });

  const out = [];
  COMPONENTS.forEach(({kind, key, format}) => {
    const property = transform[key];
    const values = (times || [0]).map((time) => format(valueAt(property, time)));
    if(!property.a && values[0] === IDENTITY[kind]) {
      return;
    }

    out.push({kind, values});
  });

  return out;
};

/**
 * Shared SMIL timing. `endPercent` is where the motion lands inside the
 * composition; the remaining tail is held so that looping the animation with
 * repeatCount keeps the original cadence.
 */
const timing = (endPercent, ease, durationMs) => {
  const duration = num6(durationMs / 1000);
  if(endPercent >= 100) {
    return `dur="${duration}s" calcMode="spline" keyTimes="0;1" keySplines="${ease}" ` +
      'fill="freeze" begin="0s"';
  }

  return `dur="${duration}s" calcMode="spline" keyTimes="0;${num6(endPercent / 100)};1" ` +
    `keySplines="${ease};0 0 1 1" fill="freeze" begin="0s"`;
};

const hold = (values, endPercent) => {
  return (endPercent >= 100 ? values : values.concat(values[values.length - 1])).join(';');
};

const humanize = (name) => {
  const words = name.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const convert = (data, label) => {
  assert(data.layers.length === 1, 'only single-layer files are supported');

  const layer = data.layers[0];
  assert(layer.ty === 4, 'only shape layers are supported');

  const total = data.op - data.ip;
  const durationMs = total / data.fr * 1000;
  const percentOf = (time) => (time - data.ip) / total * 100;

  // Lottie paints shapes[0] on top; SVG paints the last element on top.
  const groups = layer.shapes.filter((shape) => shape.ty === 'gr').reverse();
  let body = groups.map((group) => {
    const shapes = group.it.filter((item) => item.ty === 'sh');
    const fills = group.it.filter((item) => item.ty === 'fl');
    const transforms = group.it.filter((item) => item.ty === 'tr');
    assert(fills.length === 1 && transforms.length === 1,
      'expected exactly one fill and one transform per group');
    assert(!fills[0].o.a && fills[0].o.k === 100, 'animated fill opacity is not supported');

    const transform = transforms[0];
    const {times, ease} = keyframeTimes(['p', 'a', 's', 'r'].map((key) => transform[key]));
    const parts = components(transform, times);

    // The first animateTransform replaces the element's transform attribute and
    // the rest post-multiply onto it, so the static attribute stays a correct
    // first frame for anything that does not run SMIL.
    const base = parts.map(({kind, values}) => `${kind}(${values[0]})`).join(' ');
    const animations = !times ? [] : parts.map(({kind, values}, index) => {
      return `<animateTransform attributeName="transform" type="${kind}" ` +
        `values="${hold(values, percentOf(times[times.length - 1]))}" ` +
        `${timing(percentOf(times[times.length - 1]), ease, durationMs)}` +
        `${index ? ' additive="sum"' : ''}/>`;
    });

    const paths = shapes.map((shape) => {
      if(!shape.ks.a) {
        return `<path d="${pathData(shape.ks.k)}"/>`;
      }

      const {times: shapeTimes, ease: shapeEase} = keyframeTimes([shape.ks]);
      const end = percentOf(shapeTimes[shapeTimes.length - 1]);
      const frames = shapeTimes.map((time) => pathData(valueAt(shape.ks, time)[0]));
      return `<path d="${frames[0]}"><animate attributeName="d" ` +
        `values="${hold(frames, end)}" ${timing(end, shapeEase, durationMs)}/></path>`;
    });

    return `<g${base ? ` transform="${base}"` : ''}>${animations.concat(paths).join('')}</g>`;
  });

  const {times: layerTimes} = keyframeTimes(['p', 'a', 's', 'r'].map((key) => layer.ks[key]));
  assert(!layerTimes, 'animated layer transforms are not supported');

  if(!isIdentity(layer.ks)) {
    const wrapper = components(layer.ks, null)
    .map(({kind, values}) => `${kind}(${values[0]})`).join(' ');
    body = [`<g transform="${wrapper}">\n    ${body.join('\n    ')}\n  </g>`];
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.w} ${data.h}" ` +
    `width="${data.w}" height="${data.h}" fill="currentColor" role="img" ` +
    `aria-label="${label || humanize(data.nm)}">\n  ${body.join('\n  ')}\n</svg>\n`;
};

const parseArgs = (argv) => {
  const options = {input: '', outDir: DEFAULT_OUT_DIR, label: ''};
  for(let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    if(arg === '-o' || arg === '--out') {
      options.outDir = argv[++i];
    } else if(arg === '--label') {
      options.label = argv[++i];
    } else {
      options.input = arg;
    }
  }

  return options;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  if(!options.input) {
    console.error('Usage: node ./src/scripts/lottie_to_svg.js <file.json|dir> [-o <outDir>] [--label <text>]');
    process.exit(1);
  }

  const inputs = fs.statSync(options.input).isDirectory() ?
    fs.readdirSync(options.input).filter((name) => name.endsWith('.json'))
    .map((name) => path.join(options.input, name)) :
    [options.input];
  assert(inputs.length, `no .json files found in ${options.input}`);

  fs.mkdirSync(options.outDir, {recursive: true});
  inputs.forEach((file) => {
    const name = path.basename(file, '.json');
    const svg = convert(JSON.parse(fs.readFileSync(file, 'utf8')), options.label);
    const target = path.join(options.outDir, `${name}.svg`);
    fs.writeFileSync(target, svg);
    console.log(`${name}.svg — ${svg.length} bytes`);
  });
};

if(require.main === module) {
  main();
}

module.exports = {convert};
