import {createEffect, createRoot, JSX, ParentProps} from 'solid-js';
import {createMutable, unwrap} from 'solid-js/store';
import {render} from 'solid-js/web';
import type SolidJSHotReloadGuardProvider from './hotReloadGuardProvider';


type Args<ObservedAttribute extends string, Props, Controls extends Object = {}> = {
  name: string;
  component: CustomElementComponent<ObservedAttribute, Props, Controls>;
  observedAttributes?: ObservedAttribute[];
  shadow?: boolean;
}

export type PassedProps<Props extends Object = {}> = Props & {
  readonly element: HTMLElement;
};

type AttributesRecord<ObservedAttribute extends string> = Record<ObservedAttribute, string | undefined | null>;
type MutableStore<T extends Object> = T;

type CustomElementComponent<ObservedAttribute extends string, Props, Controls = {}> =
  (props: PassedProps<MutableStore<Props>>, attributes: MutableStore<AttributesRecord<ObservedAttribute>>, controls: Controls) => JSX.Element;

export type DefinedSolidElement<ObservedAttribute extends string = string, Props extends Object = {}, Controls = {}> = ReturnType<typeof defineSolidElement<Props, ObservedAttribute, Controls>>;

/**
 * Defines an HMR capable custom element with solid-js rendering
 *
 * Don't forget to add `if(import.meta.hot) import.meta.hot.accept();` in the file you're
 * declaring the component to take advantage of Hot Module Replacement
 *
 * Note that it might still need a refresh if you change other parameters except the component logic
 *
 * @example
 * // your-element.tsx
 * const MyElement = defineSolidElement({
 *   name: 'my-element',
 *   observedAttributes: ['size', 'something-else'],
 *   // props and attributes are reactive mutable stores, meaning you can also mutate them directly
 *   component: (props: {fancyProp: Date}, attributes, controls: {someAction: () => void}) => {
 *     // component logic in here
 *
 *     // expose some methods to the element
 *     controls.someAction = () => setInternalSignal('to something');
 *
 *     return <>...</>;
 *   }
 * });
 *
 * // used-in-file.ts
 *
 * // Some imports might break the HMR, so you can provide this hot reload guard to prevent page reload
 * import SolidJSHotReloadGuardProvider from './hotReloadGuardProvider';
 *
 * const el = new MyElement;
 * el.feedProps({fancyProp: new Date});
 * el.HotReloadGuard = SolidJSHotReloadGuardProvider;
 *
 * // Append to DOM after feeding the props, unless it relies solely on attributes, or handles undefined props
 * otherElement.append(el);
 *
 * // Can use attributes if you want
 * el.setAttribute('size', '400');
 *
 * // Use internal methods through the `controls` property
 * el.controls.someAction();
 */
export default function defineSolidElement<Props extends Object, ObservedAttribute extends string, Controls = {}>({
  name,
  component,
  observedAttributes = [],
  shadow = false
}: Args<ObservedAttribute, Props, Controls>) {
  //
  // When the module is hot replaced
  if(customElements.get(name)) {
    const previousElementClass = customElements.get(name) as typeof SolidElement;
    previousElementClass.swapComponentFromHMR(component);
    return previousElementClass;
  }

  let instances: (InstanceType<typeof SolidElement>)[];

  if(import.meta.hot) {
    instances = [];
  }

  const className = burgerToPascal(name);

  const SolidElement = class extends HTMLElement {
    private mountPoint: ShadowRoot | this;

    private attributesStore: MutableStore<AttributesRecord<ObservedAttribute>>;
    private propsStore: PassedProps<Props>;

    private disposeContent?: () => void;
    private disposeStores?: () => void;

    /**
     * Persist props when the component gets mounted / unmounted and allow initialization before the element
     * is added to the DOM
     */
    private savedProps = ((self: typeof this) => ({
      get element() {
        return self;
      }
    } as unknown as PassedProps<Props>))(this);

    public readonly controls = {} as Controls;

    public HotReloadGuard?: typeof SolidJSHotReloadGuardProvider;

    /**
     * For HMR
     */
    public static Component = component;

    public static swapComponentFromHMR(newComponent: CustomElementComponent<ObservedAttribute, Props, Controls>) {
      if(import.meta.hot) {
        SolidElement.Component = newComponent;
        instances.forEach((instance) => {
          instance?.mount?.();
        });
      }
    }

    static get observedAttributes() {
      return observedAttributes;
    }

    constructor() {
      super();

      this.mountPoint = shadow ? this.attachShadow({mode: 'open'}) : this;
    }

    connectedCallback() {
      this.mount();

      if(import.meta.hot) {
        instances.push(this);
      }
    }

    disconnectedCallback() {
      this.unmount();

      if(import.meta.hot) {
        const idx = instances.indexOf(this);
        if(idx > -1) instances.splice(idx, 1);
      }
    }

    attributeChangedCallback(name: ObservedAttribute, _oldValue: string, newValue: string) {
      this.attributesStore[name] = newValue; // Let's hope this will not trigger infinite loops, as the values are compared before updates
    }

    public get props() {
      if(this.disposeStores) {
        return this.propsStore;
      } else {
        return this.savedProps;
      }
    }

    public feedProps<Full extends boolean = true>(props: Full extends true ? Props : Partial<Props>) {
      if(this.disposeStores) {
        Object.assign(this.propsStore, props);
      } else {
        Object.assign(this.savedProps, props);
      }
    }

    private initStores() {
      createRoot(dispose => {
        this.disposeStores = dispose;

        this.propsStore = createMutable(this.savedProps);
        this.attributesStore = createMutable({} as AttributesRecord<ObservedAttribute>);

        createEffect(() => Object.keys(this.attributesStore).forEach(key => {
          const attributeName = key as ObservedAttribute;
          const value = this.attributesStore[attributeName];

          if(this.getAttribute(attributeName) === this.attributesStore[attributeName]) return;

          if(value === null || value === undefined) {
            this.removeAttribute(attributeName);
          } else {
            this.setAttribute(attributeName, value);
          }
        }));
      });
    }

    private mount() {
      let savedAttributes: AttributesRecord<ObservedAttribute>;

      // can happen only on hmr
      if(this.disposeStores) savedAttributes = unwrap(this.attributesStore);

      this.unmount();
      const ComponentToMount = SolidElement.Component;

      this.initStores();
      if(savedAttributes) Object.assign(this.attributesStore, savedAttributes);

      const Wrapper = this.HotReloadGuard || ((props: ParentProps) => <>{props.children}</>);

      // JSX is mandatory here for cleanup to work!
      this.disposeContent = render(() => <Wrapper>{ComponentToMount(this.propsStore, this.attributesStore, this.controls)}</Wrapper>, this.mountPoint);
    }

    private unmount() {
      this.disposeContent?.();
      this.disposeStores?.();

      this.disposeStores = this.disposeContent = undefined;

      this.mountPoint.replaceChildren(); // Don't leave trash in there
    }

    get [Symbol.toStringTag]() {
      return className;
    }
  };

  customElements.define(name, SolidElement);

  return SolidElement;
}

function burgerToPascal(str: string) {
  return str
  .split('-')
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join('');
}
