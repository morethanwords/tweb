import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {hotEffect, sweepHotEffects} from '@helpers/hotModule';
import {keepClasses, keepExports, keepValue, setReloadHandler} from '@helpers/hotRegistry';

// a module, as the registry tells modules apart: by URL
let modules = 0;
const createHot = () => `/src/hot-test-${++modules}.ts`;
// the reloads asked for, by module
let reloaded: string[] = [];
const reloads = (url: string) => reloaded.filter((path) => path === url).length;
beforeEach(() => {
  reloaded = [];
  setReloadHandler((path) => reloaded.push(path));
});
afterEach(() => setReloadHandler(undefined));
// what the registry compares once the module has run
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

// two evaluations of the same module source
function evaluate(version: number, constructorBody = '') {
  class Base {
    public greet() {
      return `base ${version}`;
    }
  }

  class Topbar extends Base {
    public value: number;

    constructor() {
      super();
      this.value = 1;
      if(constructorBody) this.value = 2;
    }

    public greet() {
      return `topbar ${version}, ${super.greet()}`;
    }
  }

  if(version === 1) (Topbar.prototype as any).onlyInFirst = () => 'first';
  return {Base, Topbar};
}

describe('keepClasses', () => {
  it('moves the live instances onto the methods of the new evaluation', () => {
    const hot = createHot();
    const first = evaluate(1);
    keepClasses(hot, first);
    const live = new first.Topbar();
    expect(live.greet()).toBe('topbar 1, base 1');

    const second = evaluate(2);
    keepClasses(hot, second);
    expect(reloads(hot)).toBe(0);
    // the same object, the same class everyone holds, the new code
    expect(live).toBeInstanceOf(first.Topbar);
    expect(live.greet()).toBe('topbar 2, base 2');
    // what the edit removed is gone
    expect((live as any).onlyInFirst).toBeUndefined();
    // and an instance made later by a holder of the old class runs the new code too
    expect(new first.Topbar().greet()).toBe('topbar 2, base 2');
    // whichever evaluation made an instance, instanceof answers the same with either
    expect(new second.Topbar()).toBeInstanceOf(first.Topbar);
    expect(live).toBeInstanceOf(second.Topbar);
    // a subclass keeps its own answer: a plain Topbar is no Sub
    class Sub extends first.Topbar {}
    expect(new first.Topbar()).not.toBeInstanceOf(Sub);
    expect(new Sub()).toBeInstanceOf(second.Topbar);
  });


  it('reloads instead when the constructor changed', () => {
    const hot = createHot();
    keepClasses(hot, evaluate(1));
    keepClasses(hot, evaluate(2, 'changed'));
    // the constructor's source is the same text in both evaluations here — compare a really different one
    class A {
      public x = 1;
    }
    class B {
      public x = 2;
    }
    const other = createHot();
    keepClasses(other, {A});
    keepClasses(other, {A: B});
    expect(reloads(other)).toBe(1);

    // a live instance keeps the arrow function its field got: an edit of one cannot be swapped in either
    class C {
      public onClick = () => 1;
      public method() {
        return 1;
      }
    }
    class D {
      public onClick = () => 2;
      public method() {
        return 1;
      }
    }
    class E {
      public onClick = () => 1;
      public method() {
        return 2;
      }
    }
    const fields = createHot();
    keepClasses(fields, {C});
    keepClasses(fields, {C: E});
    expect(reloads(fields)).toBe(0);
    keepClasses(fields, {C: D});
    expect(reloads(fields)).toBe(1);

    // Vite stamps the URLs of dynamic imports anew on every evaluation: that is no change of the class
    class F {
      public load = () => '/src/lazy.ts?t=1';
    }
    class G {
      public load = () => '/src/lazy.ts?t=2';
    }
    const stamped = createHot();
    keepClasses(stamped, {F});
    keepClasses(stamped, {F: G});
    expect(reloads(stamped)).toBe(0);
  });
});

describe('keepClasses, what a live instance holds', () => {
  it('sees a constructor edit past a default object parameter', () => {
    // the default `{}` is the parameter list's, not the constructor's body
    class A {
      public x: number;
      constructor(options: {a?: number} = {}) {
        this.x = options.a ?? 1;
      }
    }
    class B {
      public x: number;
      constructor(options: {a?: number} = {}) {
        this.x = options.a ?? 2;
      }
    }
    const hot = createHot();
    keepClasses(hot, {A});
    keepClasses(hot, {A: B});
    expect(reloads(hot)).toBe(1);
  });

  it('sees a constructor edit past commented-out code and strings with braces in them', () => {
    // the dev server keeps comments in the source a class prints: their braces are no code
    class A {
      public x: number;
      public y: string;
      constructor() {
        // if(rippleEnabled) {
        // }
        // }
        this.y = '}{';
        this.x = 1;
      }
    }
    class B {
      public x: number;
      public y: string;
      constructor() {
        // if(rippleEnabled) {
        // }
        // }
        this.y = '}{';
        this.x = 2;
      }
    }
    const hot = createHot();
    keepClasses(hot, {A});
    keepClasses(hot, {A: B});
    expect(reloads(hot)).toBe(1);
  });

  it('tells a regular expression from a comment and from a division', () => {
    // the escaped slash and the closing one of the expression are no `//` comment, which would swallow the `{`
    class Url {
      public strip(url: string) {
        if(!url.match(/^https?:\/\//)) {
          url = 'https://' + url;
        }
        return url;
      }
      public half(value: number) {
        return value / 2 / this.base;
      }
      public base: number;
      constructor() {
        this.base = 1;
      }
    }
    class UrlMethod {
      public strip(url: string) {
        if(!url.match(/^https?:\/\//)) {
          url = 'http://' + url;
        }
        return url;
      }
      public half(value: number) {
        return value / 2 / this.base;
      }
      public base: number;
      constructor() {
        this.base = 1;
      }
    }
    class UrlConstructor {
      public strip(url: string) {
        if(!url.match(/^https?:\/\//)) {
          url = 'https://' + url;
        }
        return url;
      }
      public half(value: number) {
        return value / 2 / this.base;
      }
      public base: number;
      constructor() {
        this.base = 2;
      }
    }
    const method = createHot();
    keepClasses(method, {Url});
    keepClasses(method, {Url: UrlMethod});
    expect(reloads(method)).toBe(0);
    const constructed = createHot();
    keepClasses(constructed, {Url});
    keepClasses(constructed, {Url: UrlConstructor});
    expect(reloads(constructed)).toBe(1);
  });

  it('keeps a static field\'s state and shares it with the later classes', () => {
    const make = () => class Tabs {
      public static register = new Map<string, number>();
      public static find(key: string) {
        return this.register.get(key);
      }
    };
    const hot = createHot();
    const First = make();
    keepClasses(hot, {Tabs: First});
    First.register.set('forum', 1);
    const Second = make();
    keepClasses(hot, {Tabs: Second});
    expect(reloads(hot)).toBe(0);
    // the filled registry survives, and the class a module that ran again holds reads it too
    expect(First.find('forum')).toBe(1);
    expect(Second.register).toBe(First.register);
    expect(Second.find('forum')).toBe(1);
  });

  it('updates a static function the module itself puts on the class', () => {
    // as solidJsTabs/tabs does: Object.assign(scaffold(...), {getInitArgs})
    const make = (version: number) => Object.assign(class Tab {}, {getInitArgs: () => version});
    const hot = createHot();
    const First = make(1);
    keepClasses(hot, {Tab: First});
    const Second = make(2);
    keepClasses(hot, {Tab: Second});
    expect(First.getInitArgs()).toBe(2);
    expect(Second.getInitArgs()).toBe(2);
  });

  it('keeps one store for a static set at runtime, a callback included', () => {
    const make = () => class Tooltip {
      public static showPicker: () => string;
      public static open() {
        return this.showPicker();
      }
    };
    const hot = createHot();
    const First = make();
    keepClasses(hot, {Tooltip: First});
    First.showPicker = () => 'picker';
    const Second = make();
    keepClasses(hot, {Tooltip: Second});
    // what startup set on the first class, the later one reads
    expect(Second.open()).toBe('picker');
    // and a write through either is one write
    Second.showPicker = () => 'another';
    expect(First.open()).toBe('another');

    // two modules that keep the instances register the same class: the second must not copy the first's
    // forwarding back onto the first class
    const elsewhere = createHot();
    const Third = make();
    keepClasses(elsewhere, {Tooltip: First});
    keepClasses(hot, {Tooltip: Third});
    keepClasses(elsewhere, {Tooltip: Third});
    expect(Third.open()).toBe('another');
    expect(First.open()).toBe('another');
  });

  it('updates the instances of every evaluation, not only the first one\'s', () => {
    const versions = [1, 2, 3].map((version) => class Item {
      public get() {
        return version;
      }
    });
    const hot = createHot();
    keepClasses(hot, {Item: versions[0]});
    keepClasses(hot, {Item: versions[1]});
    // a module that ran again made its instance of the second evaluation's class
    const made = new versions[1]();
    keepClasses(hot, {Item: versions[2]});
    expect(made.get()).toBe(3);
    expect(new versions[0]().get()).toBe(3);
    expect(reloads(hot)).toBe(0);
  });

  it('reloads for a changed method the class hands out as a value', () => {
    class Input {
      public onClick = this.open.bind(this);
      public open() {
        return 1;
      }
    }
    class InputNext {
      public onClick = this.open.bind(this);
      public open() {
        return 2;
      }
    }
    const hot = createHot();
    keepClasses(hot, {Input});
    keepClasses(hot, {Input: InputNext});
    // the bound copy the instance got would keep calling the first version
    expect(reloads(hot)).toBe(1);

    // a method only ever called takes the update
    class Called {
      public run() {
        return this.step();
      }
      public step() {
        return 1;
      }
    }
    class CalledNext {
      public run() {
        return this.step();
      }
      public step() {
        return 2;
      }
    }
    const called = createHot();
    keepClasses(called, {Called});
    keepClasses(called, {Called: CalledNext});
    expect(reloads(called)).toBe(0);
  });

  it('reloads for an override its superclass hands out as a value', () => {
    class Base {
      public onClose: () => unknown;
      constructor() {
        this.onClose = this.close.bind(this);
      }
      public close(): unknown {
        return 0;
      }
    }
    class Viewer extends Base {
      public close() {
        return 1;
      }
    }
    class ViewerEdited extends Base {
      public close() {
        return 2;
      }
    }
    const hot = createHot();
    keepClasses(hot, {Viewer});
    keepClasses(hot, {Viewer: ViewerEdited});
    expect(reloads(hot)).toBe(1);
  });

  it('takes no getter other code put on the prototype at runtime for an edit of the class', () => {
    const make = () => class Row {
      public render() {
        return this.title;
      }
      declare public title: string;
    };
    const hot = createHot();
    const First = make();
    keepClasses(hot, {Row: First});
    // as a row controller does when the first row is made
    Object.defineProperty(First.prototype, 'title', {get() {
      return 'title';
    }, configurable: true});
    keepClasses(hot, {Row: make()});
    expect(reloads(hot)).toBe(0);
  });

  it('reloads for an edit of a method a subclass in another module hands out', () => {
    class InputField {
      public value: string;
      public setValueSilently(value: string) {
        this.value = value;
      }
    }
    class InputFieldEdited {
      public value: string;
      public setValueSilently(value: string) {
        this.value = value.trim();
      }
    }
    const base = createHot();
    keepClasses(base, {InputField});
    class TelInputField extends InputField {
      public onInput = this.setValueSilently.bind(this);
    }
    keepClasses(createHot(), {TelInputField});
    keepClasses(base, {InputField: InputFieldEdited});
    expect(reloads(base)).toBe(1);
  });

  it('reloads when an override its superclass hands out is removed', () => {
    class Base {
      public onClose: () => unknown;
      constructor() {
        this.onClose = this.close.bind(this);
      }
      public close(): unknown {
        return 0;
      }
    }
    class Viewer extends Base {
      public close() {
        return 1;
      }
    }
    // the edit took the override out: the live instances' bound copy is still Viewer's
    class ViewerWithout extends Base {}
    const hot = createHot();
    keepClasses(hot, {Viewer});
    keepClasses(hot, {Viewer: ViewerWithout});
    expect(reloads(hot)).toBe(1);
  });

  it('reloads when a method the live instances hold reads an import that changed, not for one they do not hold', async() => {
    const options = (value: number) => new Function(`return function getDefaultOptions() { return ${value}; }`)();
    class Topbar {
      public onSubmenu = this.createSubmenu.bind(this);
      public createSubmenu() {
        return 1;
      }
      public render() {
        return 1;
      }
    }
    const methods = {Topbar: {createSubmenu: ['local', ['getDefaultOptions']], render: ['local', ['formatTitle']]}} as Record<string, Record<string, [string, string[]]>>;
    const hot = createHot();
    keepClasses(hot, {Topbar}, undefined, undefined, undefined, methods, () => ({getDefaultOptions: options(1), formatTitle: options(1)}));
    // what only an unheld method reads changed: it is patched, and reads the new one
    keepClasses(hot, {Topbar}, undefined, undefined, undefined, methods, () => ({getDefaultOptions: options(1), formatTitle: options(2)}));
    await settled();
    expect(reloads(hot)).toBe(0);
    keepClasses(hot, {Topbar}, undefined, undefined, undefined, methods, () => ({getDefaultOptions: options(2), formatTitle: options(2)}));
    await settled();
    expect(reloads(hot)).toBe(1);
  });

  it('reloads for a changed superclass that does not patch itself, not for one that only ran again', () => {
    const subOf = (Base: new () => {base(): number}) => class Sub extends Base {
      public own() {
        return this.base();
      }
    };
    class Base {
      public base() {
        return 1;
      }
    }
    const sameBase = () => class Base {
      public base() {
        return 1;
      }
    };
    class EditedBase {
      public base() {
        return 2;
      }
    }

    // its module ran again with the same code: no reload, and the two superclasses are one for `instanceof` - the
    // live instances lead to the first, the ones made from now on to the second
    const rerun = createHot();
    const RerunBase = sameBase();
    keepClasses(rerun, {Sub: subOf(Base)});
    keepClasses(rerun, {Sub: subOf(RerunBase)});
    expect(reloads(rerun)).toBe(0);
    expect(new (subOf(RerunBase))()).toBeInstanceOf(Base);
    expect(new (subOf(Base))()).toBeInstanceOf(RerunBase);

    // edited: the live instances' chain still leads to the old superclass
    const edited = createHot();
    keepClasses(edited, {Sub: subOf(Base)});
    keepClasses(edited, {Sub: subOf(EditedBase)});
    expect(reloads(edited)).toBe(1);

    // a superclass that patches itself is updated in place, under the live instances too
    const baseHot = createHot();
    const subHot = createHot();
    const FirstBase = sameBase();
    keepClasses(baseHot, {Base: FirstBase});
    const FirstSub = subOf(FirstBase);
    keepClasses(subHot, {Sub: FirstSub});
    const live = new FirstSub();
    keepClasses(baseHot, {Base: EditedBase});
    keepClasses(subHot, {Sub: subOf(EditedBase)});
    expect(reloads(baseHot) + reloads(subHot)).toBe(0);
    expect(live.own()).toBe(2);
  });

  it('reloads for a custom element\'s lifecycle callback, which the registry took at define', () => {
    class Element extends HTMLElement {
      public connectedCallback() {
        this.dataset.connected = 'a';
      }
      public describe() {
        return 'a';
      }
    }
    class ElementNext extends HTMLElement {
      public connectedCallback() {
        this.dataset.connected = 'a';
      }
      public describe() {
        return 'b';
      }
    }
    class ElementLast extends HTMLElement {
      public connectedCallback() {
        this.dataset.connected = 'b';
      }
      public describe() {
        return 'b';
      }
    }
    const hot = createHot();
    keepClasses(hot, {Element});
    keepClasses(hot, {Element: ElementNext});
    expect(reloads(hot)).toBe(0);
    keepClasses(hot, {Element: ElementLast});
    expect(reloads(hot)).toBe(1);
  });
});

describe('keepClasses, construction', () => {
  // three evaluations of a module: a method the construction does not call changes, then one it calls
  class Tab {
    public value: number;
    constructor() {
      this._constructor();
    }
    public _constructor() {
      this.value = 1;
    }
    public later() {
      return 1;
    }
  }
  class TabLater {
    public value: number;
    constructor() {
      this._constructor();
    }
    public _constructor() {
      this.value = 1;
    }
    public later() {
      return 2;
    }
  }
  class TabConstructor {
    public value: number;
    constructor() {
      this._constructor();
    }
    public _constructor() {
      this.value = 2;
    }
    public later() {
      return 2;
    }
  }

  it('reloads for a method the constructor calls, not for one it does not', () => {
    const hot = createHot();
    keepClasses(hot, {Tab}, undefined, undefined, {Tab: ['_constructor']});
    keepClasses(hot, {Tab: TabLater}, undefined, undefined, {Tab: ['_constructor']});
    expect(reloads(hot)).toBe(0);
    keepClasses(hot, {Tab: TabConstructor}, undefined, undefined, {Tab: ['_constructor']});
    expect(reloads(hot)).toBe(1);
  });

  it('reloads for a subclass\'s override of a method its superclass\'s constructor calls', () => {
    class Base {
      constructor() {
        this.init();
      }
      public init() {}
    }
    keepClasses(createHot(), {Base}, undefined, undefined, {Base: ['init']});
    class Sub extends Base {
      public value: number;
      public init() {
        this.value = 1;
      }
    }
    class SubEdited extends Base {
      public value: number;
      public init() {
        this.value = 2;
      }
    }
    const hot = createHot();
    keepClasses(hot, {Sub});
    keepClasses(hot, {Sub: SubEdited});
    expect(reloads(hot)).toBe(1);
  });
});

describe('keepClasses, construction through inheritance and module functions', () => {
  it('reloads for an edit of an inherited method a subclass\'s constructor calls', () => {
    class ScrollableBase {
      public setListeners() {
        return 1;
      }
    }
    class ScrollableBaseEdited {
      public setListeners() {
        return 2;
      }
    }
    const base = createHot();
    keepClasses(base, {ScrollableBase});
    class Scrollable extends ScrollableBase {
      constructor() {
        super();
        this.setListeners();
      }
    }
    keepClasses(createHot(), {Scrollable}, undefined, undefined, {Scrollable: ['setListeners']});
    keepClasses(base, {ScrollableBase: ScrollableBaseEdited});
    expect(reloads(base)).toBe(1);
  });

  it('reloads when a module function a construction method calls changed', async() => {
    const makeValue = (value: number) => new Function(`return function makeValue() { return ${value}; }`)();
    class Item {
      public value: number;
      constructor() {
        this.init();
      }
      public init() {
        this.value = 1;
      }
    }
    const info = {Item: {init: ['local', ['makeValue']]}} as Record<string, Record<string, [string, string[]]>>;
    const hot = createHot();
    keepClasses(hot, {Item}, undefined, undefined, {Item: ['init']}, info, () => ({makeValue: makeValue(1)}));
    keepClasses(hot, {Item}, undefined, undefined, {Item: ['init']}, info, () => ({makeValue: makeValue(2)}));
    await settled();
    expect(reloads(hot)).toBe(1);
  });
});

describe('keepClasses, custom elements', () => {
  it('reloads when a module function a lifecycle callback calls changed', async() => {
    const testElement = (value: number) => new Function(`return function testElement() { return ${value}; }`)();
    class Ellipsis extends HTMLElement {
      public connectedCallback() {
        return 1;
      }
    }
    const info = {Ellipsis: {connectedCallback: ['local', ['testElement']]}} as Record<string, Record<string, [string, string[]]>>;
    const hot = createHot();
    keepClasses(hot, {Ellipsis}, undefined, undefined, undefined, info, () => ({testElement: testElement(1)}));
    keepClasses(hot, {Ellipsis}, undefined, undefined, undefined, info, () => ({testElement: testElement(2)}));
    await settled();
    expect(reloads(hot)).toBe(1);
  });
});

describe('keepClasses, static methods what was made with', () => {
  it('reloads for kept state made with a static method the edit changed', async() => {
    class FramesCache {
      public static createCache() {
        return {frames: 1};
      }
    }
    class FramesCacheEdited {
      public static createCache() {
        return {frames: 2};
      }
    }
    const cache = createHot();
    keepClasses(cache, {FramesCache});
    const player = createHot();
    keepValue(player, 'cache', () => FramesCache.createCache(), 'code', () => ({FramesCache}));
    await settled();
    // the class's module ran with the edit, and took the update itself: the module that made the state does not run
    // again
    keepClasses(cache, {FramesCache: FramesCacheEdited});
    await settled();
    expect(reloads(player)).toBe(1);
  });

  it('reloads for what a construction method made with a static method the edit changed', async() => {
    class FramesCache {
      public static createCache() {
        return {frames: 1};
      }
    }
    class FramesCacheEdited {
      public static createCache() {
        return {frames: 2};
      }
    }
    class Player {
      public cache: {frames: number};
      constructor() {
        this.init();
      }
      public init() {
        this.cache = FramesCache.createCache();
      }
      public play() {}
    }
    const info = {Player: {init: ['local', ['FramesCache']]}} as Record<string, Record<string, [string, string[]]>>;
    const cache = createHot();
    keepClasses(cache, {FramesCache});
    const player = createHot();
    keepClasses(player, {Player}, undefined, undefined, {Player: ['init']}, info, () => ({FramesCache}));
    await settled();
    keepClasses(cache, {FramesCache: FramesCacheEdited});
    await settled();
    expect(reloads(player)).toBe(1);
  });

  it('reloads for what was made with a static method whose import changed', async() => {
    const make = () => class Factory {
      public static create() {
        return 1;
      }
    };
    const helper = (value: number) => new Function(`return function helper() { return ${value}; }`)();
    const statics = {Factory: ['code', ['helper']]} as Record<string, [string, string[]]>;
    const run = (cache: string, value: number) => {
      const Factory = make();
      keepClasses(cache, {Factory}, undefined, undefined, undefined, undefined, () => ({helper: helper(value)}), statics);
      return Factory;
    };
    for(const [value, expected] of [[1, 0], [2, 1]]) {
      const cache = createHot();
      const Factory = run(cache, 1);
      const player = createHot();
      keepValue(player, 'made', () => Factory.create(), 'code', () => ({Factory}));
      await settled();
      run(cache, value);
      await settled();
      expect(reloads(player)).toBe(expected);
    }
  });

  // `this.constructor` is held: the transform's per-method object answers to that name with Object's constructor
  it('takes a class that reads this.constructor', async() => {
    class Player {
      public static frames = 1;
      public frames() {
        return (this.constructor as typeof Player).frames;
      }
      public load() {
        return 1;
      }
    }
    const info = {Player: {load: ['local', ['Cache']]}} as Record<string, Record<string, [string, string[]]>>;
    const hot = createHot();
    keepClasses(hot, {Player}, undefined, undefined, undefined, info, () => ({Cache: 1}));
    keepClasses(hot, {Player}, undefined, undefined, undefined, info, () => ({Cache: 1}));
    await settled();
    expect(reloads(hot)).toBe(0);
  });

  it('keeps the page for a class whose static method only a method run later reads', async() => {
    class FramesCache {
      public static createCache() {
        return {frames: 1};
      }
    }
    class FramesCacheEdited {
      public static createCache() {
        return {frames: 2};
      }
    }
    class Player {
      public cache: {frames: number};
      public load() {
        this.cache = FramesCache.createCache();
      }
    }
    const info = {Player: {load: ['local', ['FramesCache']]}} as Record<string, Record<string, [string, string[]]>>;
    const cache = createHot();
    keepClasses(cache, {FramesCache});
    const player = createHot();
    keepClasses(player, {Player}, undefined, undefined, undefined, info, () => ({FramesCache}));
    await settled();
    keepClasses(cache, {FramesCache: FramesCacheEdited});
    await settled();
    expect(reloads(player)).toBe(0);
  });

  // what the instances were made by reads one of the classes the module's methods read: the others are not compared
  it('keeps the page for a module that runs again unchanged', async() => {
    class Scrollable {
      public static create() {
        return 1;
      }
    }
    class Sortable {}
    class Tab {
      public scrollable: number;
      constructor() {
        this.init();
      }
      public init() {
        this.scrollable = Scrollable.create();
      }
      public sort() {
        return new Sortable();
      }
    }
    const info = {Tab: {init: ['local', ['Scrollable']], sort: ['local', ['Sortable']]}} as Record<string, Record<string, [string, string[]]>>;
    const classes = createHot();
    keepClasses(classes, {Scrollable, Sortable});
    const hot = createHot();
    keepClasses(hot, {Tab}, undefined, undefined, {Tab: ['init']}, info, () => ({Scrollable, Sortable}));
    await settled();
    keepClasses(hot, {Tab}, undefined, undefined, {Tab: ['init']}, info, () => ({Scrollable, Sortable}));
    await settled();
    expect(reloads(hot)).toBe(0);
  });
});

describe('the registry in an AudioWorklet', () => {
  // the worklet's realm loads the modules its processor imports, and has neither timers nor queueMicrotask
  it('registers without timers', async() => {
    class Denoiser {}
    const globals = globalThis as any;
    const timers = {setTimeout: globals.setTimeout, queueMicrotask: globals.queueMicrotask};
    const hot = createHot();
    let value: number;
    try {
      delete globals.setTimeout;
      delete globals.queueMicrotask;
      keepClasses(hot, {Denoiser}, {}, () => ({Denoiser}));
      value = keepValue(hot, 'frame', () => 1, 'code', () => ({Denoiser}));
    } finally {
      Object.assign(globals, timers);
    }
    await settled();
    expect(value).toBe(1);
    expect(reloads(hot)).toBe(0);
  });
});

describe('keepClasses, statics', () => {
  it('takes away a static method the edit removed, and keeps one other code set at runtime', () => {
    class Tabs {
      public static helper() {
        return 1;
      }
    }
    class TabsEdited {}
    const hot = createHot();
    keepClasses(hot, {Tabs});
    (Tabs as any).onOpen = () => 'set at startup';
    keepClasses(hot, {Tabs: TabsEdited});
    expect((Tabs as any).helper).toBeUndefined();
    expect((TabsEdited as any).helper).toBeUndefined();
    expect((TabsEdited as any).onOpen()).toBe('set at startup');
  });
});

describe('keepClasses, private members', () => {
  // a method of another evaluation of the class is branded for that evaluation's private members
  it('reloads for a class with private members whenever its module runs again, its code changed or not', () => {
    const make = () => class Counter {
      #count = 0;
      public next() {
        return ++this.#count;
      }
    };
    const hot = createHot();
    keepClasses(hot, {Counter: make()});
    keepClasses(hot, {Counter: make()});
    expect(reloads(hot)).toBe(1);
  });

  it('reloads for a subclass whose superclass with private members is another evaluation', () => {
    const base = () => class Base {
      #id = 1;
      public id() {
        return this.#id;
      }
    };
    const sub = (Base: ReturnType<typeof base>) => class Sub extends Base {
      public name() {
        return 'sub ' + this.id();
      }
    };
    const hot = createHot();
    keepClasses(hot, {Sub: sub(base())});
    // the superclass's module ran again: a method copied from the new Sub calls into the new Base through `super`
    keepClasses(hot, {Sub: sub(base())});
    expect(reloads(hot)).toBe(1);
  });
});

describe('keepClasses, what the classes hold or build with', () => {
  it('reloads when the module\'s functions they hold changed', () => {
    class Dropdown {
      public element = 'markup';
    }
    const hot = createHot();
    // the plugin hands their code over as a hash
    keepClasses(hot, {Dropdown}, {render: 'v1'});
    keepClasses(hot, {Dropdown}, {render: 'v1'});
    expect(reloads(hot)).toBe(0);
    keepClasses(hot, {Dropdown}, {render: 'v2'});
    expect(reloads(hot)).toBe(1);
  });

  it('reloads when an imported function or table they hold changed, by its code and its value', async() => {
    class Sizes {}
    const helper = () => function render() {
      return 'old markup';
    };
    const hot = createHot();
    keepClasses(hot, {Sizes}, {}, () => ({render: helper(), SIZES: {inline: 14}, KINDS: new Set(['call'])}));
    // the same code and values, made again
    keepClasses(hot, {Sizes}, {}, () => ({render: helper(), SIZES: {inline: 14}, KINDS: new Set(['call'])}));
    await settled();
    expect(reloads(hot)).toBe(0);
    keepClasses(hot, {Sizes}, {}, () => ({render: helper(), SIZES: {inline: 16}, KINDS: new Set(['call'])}));
    await settled();
    expect(reloads(hot)).toBe(1);

    const other = createHot();
    keepClasses(other, {Sizes}, {}, () => ({render: helper()}));
    keepClasses(other, {Sizes}, {}, () => ({render: function render() {
      return 'new markup';
    }}));
    await settled();
    expect(reloads(other)).toBe(1);
  });
});

describe('keepValue', () => {
  it('hands every later evaluation the value the first one made', () => {
    const hot = createHot();
    const first = keepValue(hot, 'store', () => ({made: Math.random()}), 'code');
    // the module ran again: the same code
    expect(keepValue(hot, 'store', () => ({made: Math.random()}), 'code')).toBe(first);
    expect(keepValue(hot, 'other', () => ({made: Math.random()}), 'code')).not.toBe(first);
    expect(reloads(hot)).toBe(0);
  });

  it('reloads when the code that made it changed, since the kept value was made by the old one', () => {
    const hot = createHot();
    const first = keepValue(hot, 'store', () => ({count: 0}), 'code 1');
    expect(keepValue(hot, 'store', () => ({count: 1}), 'code 2')).toBe(first);
    expect(reloads(hot)).toBe(1);
  });

  it('reloads when what it was made from changed: an imported function, a table', async() => {
    const hot = createHot();
    const order = () => function getOrder() {
      return 1;
    };
    const first = keepValue(hot, 'store', () => ({}), 'code', () => ({getOrder: order(), ORDER: [1, 2]}));
    expect(keepValue(hot, 'store', () => ({}), 'code', () => ({getOrder: order(), ORDER: [1, 2]}))).toBe(first);
    await settled();
    expect(reloads(hot)).toBe(0);
    keepValue(hot, 'store', () => ({}), 'code', () => ({getOrder: order(), ORDER: [1, 3]}));
    await settled();
    expect(reloads(hot)).toBe(1);
  });

  it('waits for an import a cycle has not initialized yet', async() => {
    const hot = createHot();
    let ready = false;
    const read = () => {
      if(!ready) throw new ReferenceError('Cannot access \'x\' before initialization');
      return {x: 2};
    };
    keepValue(hot, 'store', () => ({}), 'code', () => ({x: 1}));
    keepValue(hot, 'store', () => ({}), 'code', read);
    await settled();
    expect(reloads(hot)).toBe(0);
    ready = true;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(reloads(hot)).toBe(1);
  });
});

describe('keepExports', () => {
  it('reloads when an export the importers hold changed, not for a patched class or a kept value', async() => {
    const hot = createHot();
    const store = keepValue(hot, 'store', () => new Map(), 'code');
    const first = evaluate(1);
    keepClasses(hot, {Topbar: first.Topbar});
    keepExports(hot, () => ({Topbar: first.Topbar, store, format: function format() {
      return 1;
    }}));
    const second = evaluate(2);
    keepClasses(hot, {Topbar: second.Topbar});
    keepExports(hot, () => ({Topbar: second.Topbar, store: keepValue(hot, 'store', () => new Map(), 'code'), format: function format() {
      return 1;
    }}));
    await settled();
    expect(reloads(hot)).toBe(0);
    keepExports(hot, () => ({Topbar: second.Topbar, store, format: function format() {
      return 2;
    }}));
    await settled();
    expect(reloads(hot)).toBe(1);
  });
});

describe('hotEffect', () => {
  // the evaluations of one module, as Vite's client makes their contexts: a new listener map filed under the path each time
  function moduleContexts(path: string) {
    const data = {};
    const hmrClient = {ctxToListenersMap: new Map<string, unknown>()};
    return () => {
      const newListeners = new Map();
      hmrClient.ctxToListenersMap.set(path, newListeners);
      return {data, ownerPath: path, hmrClient, newListeners} as unknown as NonNullable<ImportMeta['hot']>;
    };
  }

  it('undoes the previous evaluation\'s setup when the module sets up again', () => {
    const evaluate = moduleContexts('/src/a.ts');
    const cleanup = vi.fn();
    hotEffect(evaluate(), () => cleanup);
    hotEffect(evaluate(), () => () => {});
    expect(cleanup).toHaveBeenCalledOnce();
    sweepHotEffects();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('leaves a setup made late, through an earlier evaluation\'s code, to the latest one', () => {
    const evaluate = moduleContexts('/src/c.ts');
    const first = evaluate();
    evaluate(); // ran again before its lazy setup happened
    const cleanup = vi.fn();
    // another module still calls the first evaluation's function, which sets up through its context
    hotEffect(first, () => cleanup);
    sweepHotEffects();
    expect(cleanup).not.toHaveBeenCalled();
    evaluate(); // now it runs again: the setup goes
    sweepHotEffects();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('undoes the setup when the module is dropped (pruned) with no importer left', () => {
    const evaluate = moduleContexts('/src/pruned.ts');
    const hot = evaluate();
    let onPrune: (data: unknown) => void;
    hot.prune = (callback: (data: unknown) => void) => onPrune = callback;
    const cleanup = vi.fn();
    hotEffect(hot, () => cleanup);
    expect(cleanup).not.toHaveBeenCalled();
    onPrune({});
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('undoes it after the update when the edit removed the module\'s last setup', () => {
    const evaluate = moduleContexts('/src/b.ts');
    const cleanup = vi.fn();
    hotEffect(evaluate(), () => cleanup);
    sweepHotEffects();
    // not run again yet: the setup stays
    expect(cleanup).not.toHaveBeenCalled();
    evaluate(); // ran again, calling no hotEffect
    sweepHotEffects();
    expect(cleanup).toHaveBeenCalledOnce();
    sweepHotEffects();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

