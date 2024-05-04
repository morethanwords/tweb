import * as csstype from "csstype";

/**
 * Based on JSX types for Surplus and Inferno and adapted for `dom-expressions`.
 *
 * https://github.com/adamhaile/surplus/blob/master/index.d.ts
 * https://github.com/infernojs/inferno/blob/master/packages/inferno/src/core/types.ts
 */
type DOMElement = Element;

export namespace JSX {
  type Element = Node | ArrayElement | (string & {}) | number | boolean | null | undefined;
  interface ArrayElement extends Array<Element> {}
  interface ElementClass {
    // empty, libs can define requirements downstream
  }
  interface ElementAttributesProperty {
    // empty, libs can define requirements downstream
  }
  interface ElementChildrenAttribute {
    children: {};
  }
  interface EventHandler<T, E extends Event> {
    (
      e: E & {
        currentTarget: T;
        target: DOMElement;
      }
    ): void;
  }
  interface BoundEventHandler<T, E extends Event> {
    0: (
      data: any,
      e: E & {
        currentTarget: T;
        target: DOMElement;
      }
    ) => void;
    1: any;
  }
  type EventHandlerUnion<T, E extends Event> = EventHandler<T, E> | BoundEventHandler<T, E>;

  interface InputEventHandler<T, E extends InputEvent> {
    (
      e: E & {
        currentTarget: T;
        target: T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          ? T
          : DOMElement;
      }
    ): void;
  }
  interface BoundInputEventHandler<T, E extends InputEvent> {
    0: (
      data: any,
      e: E & {
        currentTarget: T;
        target: T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          ? T
          : DOMElement;
      }
    ) => void;
    1: any;
  }
  type InputEventHandlerUnion<T, E extends InputEvent> =
    | InputEventHandler<T, E>
    | BoundInputEventHandler<T, E>;

  interface ChangeEventHandler<T, E extends Event> {
    (
      e: E & {
        currentTarget: T;
        target: T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          ? T
          : DOMElement;
      }
    ): void;
  }
  interface BoundChangeEventHandler<T, E extends Event> {
    0: (
      data: any,
      e: E & {
        currentTarget: T;
        target: T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          ? T
          : DOMElement;
      }
    ) => void;
    1: any;
  }
  type ChangeEventHandlerUnion<T, E extends Event> =
    | ChangeEventHandler<T, E>
    | BoundChangeEventHandler<T, E>;

  interface FocusEventHandler<T, E extends FocusEvent> {
    (
      e: E & {
        currentTarget: T;
        target: T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          ? T
          : DOMElement;
      }
    ): void;
  }
  interface BoundFocusEventHandler<T, E extends FocusEvent> {
    0: (
      data: any,
      e: E & {
        currentTarget: T;
        target: T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          ? T
          : DOMElement;
      }
    ) => void;
    1: any;
  }
  type FocusEventHandlerUnion<T, E extends FocusEvent> =
    | FocusEventHandler<T, E>
    | BoundFocusEventHandler<T, E>;

  const SERIALIZABLE: unique symbol;
  interface SerializableAttributeValue {
    toString(): string;
    [SERIALIZABLE]: never;
  }

  interface IntrinsicAttributes {
    ref?: unknown | ((e: unknown) => void);
  }
  interface CustomAttributes<T> {
    ref?: T | ((el: T) => void);
    classList?: {
      [k: string]: boolean | undefined;
    };
    $ServerOnly?: boolean;
  }
  type Accessor<T> = () => T;
  interface Directives {}
  interface DirectiveFunctions {
    [x: string]: (el: DOMElement, accessor: Accessor<any>) => void;
  }
  interface ExplicitProperties {}
  interface ExplicitAttributes {}
  interface CustomEvents {}
  interface CustomCaptureEvents {}
  type DirectiveAttributes = {
    [Key in keyof Directives as `use:${Key}`]?: Directives[Key];
  };
  type DirectiveFunctionAttributes<T> = {
    [K in keyof DirectiveFunctions as string extends K
      ? never
      : `use:${K}`]?: DirectiveFunctions[K] extends (
      el: infer E, // will be unknown if not provided
      ...rest: infer R // use rest so that we can check whether it's provided or not
    ) => void
      ? T extends E // everything extends unknown if E is unknown
        ? R extends [infer A] // check if has accessor provided
          ? A extends Accessor<infer V>
            ? V // it's an accessor
            : never // it isn't, type error
          : true // no accessor provided
        : never // T is the wrong element
      : never; // it isn't a function
  };
  type PropAttributes = {
    [Key in keyof ExplicitProperties as `prop:${Key}`]?: ExplicitProperties[Key];
  };
  type AttrAttributes = {
    [Key in keyof ExplicitAttributes as `attr:${Key}`]?: ExplicitAttributes[Key];
  };
  type OnAttributes<T> = {
    [Key in keyof CustomEvents as `on:${Key}`]?: EventHandler<T, CustomEvents[Key]>;
  };
  type OnCaptureAttributes<T> = {
    [Key in keyof CustomCaptureEvents as `oncapture:${Key}`]?: EventHandler<
      T,
      CustomCaptureEvents[Key]
    >;
  };
  interface DOMAttributes<T>
    extends CustomAttributes<T>,
      DirectiveAttributes,
      DirectiveFunctionAttributes<T>,
      PropAttributes,
      AttrAttributes,
      OnAttributes<T>,
      OnCaptureAttributes<T>,
      CustomEventHandlersCamelCase<T>,
      CustomEventHandlersLowerCase<T> {
    children?: Element;
    innerHTML?: string;
    innerText?: string | number;
    textContent?: string | number;
    // camel case events
    onCopy?: EventHandlerUnion<T, ClipboardEvent>;
    onCut?: EventHandlerUnion<T, ClipboardEvent>;
    onPaste?: EventHandlerUnion<T, ClipboardEvent>;
    onCompositionEnd?: EventHandlerUnion<T, CompositionEvent>;
    onCompositionStart?: EventHandlerUnion<T, CompositionEvent>;
    onCompositionUpdate?: EventHandlerUnion<T, CompositionEvent>;
    onFocusOut?: FocusEventHandlerUnion<T, FocusEvent>;
    onFocusIn?: FocusEventHandlerUnion<T, FocusEvent>;
    onEncrypted?: EventHandlerUnion<T, Event>;
    onDragExit?: EventHandlerUnion<T, DragEvent>;
    // lower case events
    oncopy?: EventHandlerUnion<T, ClipboardEvent>;
    oncut?: EventHandlerUnion<T, ClipboardEvent>;
    onpaste?: EventHandlerUnion<T, ClipboardEvent>;
    oncompositionend?: EventHandlerUnion<T, CompositionEvent>;
    oncompositionstart?: EventHandlerUnion<T, CompositionEvent>;
    oncompositionupdate?: EventHandlerUnion<T, CompositionEvent>;
    onfocusout?: FocusEventHandlerUnion<T, FocusEvent>;
    onfocusin?: FocusEventHandlerUnion<T, FocusEvent>;
    onencrypted?: EventHandlerUnion<T, Event>;
    ondragexit?: EventHandlerUnion<T, DragEvent>;
  }
  interface CustomEventHandlersCamelCase<T> {
    onAbort?: EventHandlerUnion<T, Event>;
    onAnimationEnd?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationIteration?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationStart?: EventHandlerUnion<T, AnimationEvent>;
    onAuxClick?: EventHandlerUnion<T, MouseEvent>;
    onBeforeInput?: InputEventHandlerUnion<T, InputEvent>;
    onBlur?: FocusEventHandlerUnion<T, FocusEvent>;
    onCanPlay?: EventHandlerUnion<T, Event>;
    onCanPlayThrough?: EventHandlerUnion<T, Event>;
    onChange?: ChangeEventHandlerUnion<T, Event>;
    onClick?: EventHandlerUnion<T, MouseEvent>;
    onContextMenu?: EventHandlerUnion<T, MouseEvent>;
    onDblClick?: EventHandlerUnion<T, MouseEvent>;
    onDrag?: EventHandlerUnion<T, DragEvent>;
    onDragEnd?: EventHandlerUnion<T, DragEvent>;
    onDragEnter?: EventHandlerUnion<T, DragEvent>;
    onDragLeave?: EventHandlerUnion<T, DragEvent>;
    onDragOver?: EventHandlerUnion<T, DragEvent>;
    onDragStart?: EventHandlerUnion<T, DragEvent>;
    onDrop?: EventHandlerUnion<T, DragEvent>;
    onDurationChange?: EventHandlerUnion<T, Event>;
    onEmptied?: EventHandlerUnion<T, Event>;
    onEnded?: EventHandlerUnion<T, Event>;
    onError?: EventHandlerUnion<T, Event>;
    onFocus?: FocusEventHandlerUnion<T, FocusEvent>;
    onGotPointerCapture?: EventHandlerUnion<T, PointerEvent>;
    onInput?: InputEventHandlerUnion<T, InputEvent>;
    onInvalid?: EventHandlerUnion<T, Event>;
    onKeyDown?: EventHandlerUnion<T, KeyboardEvent>;
    onKeyPress?: EventHandlerUnion<T, KeyboardEvent>;
    onKeyUp?: EventHandlerUnion<T, KeyboardEvent>;
    onLoad?: EventHandlerUnion<T, Event>;
    onLoadedData?: EventHandlerUnion<T, Event>;
    onLoadedMetadata?: EventHandlerUnion<T, Event>;
    onLoadStart?: EventHandlerUnion<T, Event>;
    onLostPointerCapture?: EventHandlerUnion<T, PointerEvent>;
    onMouseDown?: EventHandlerUnion<T, MouseEvent>;
    onMouseEnter?: EventHandlerUnion<T, MouseEvent>;
    onMouseLeave?: EventHandlerUnion<T, MouseEvent>;
    onMouseMove?: EventHandlerUnion<T, MouseEvent>;
    onMouseOut?: EventHandlerUnion<T, MouseEvent>;
    onMouseOver?: EventHandlerUnion<T, MouseEvent>;
    onMouseUp?: EventHandlerUnion<T, MouseEvent>;
    onPause?: EventHandlerUnion<T, Event>;
    onPlay?: EventHandlerUnion<T, Event>;
    onPlaying?: EventHandlerUnion<T, Event>;
    onPointerCancel?: EventHandlerUnion<T, PointerEvent>;
    onPointerDown?: EventHandlerUnion<T, PointerEvent>;
    onPointerEnter?: EventHandlerUnion<T, PointerEvent>;
    onPointerLeave?: EventHandlerUnion<T, PointerEvent>;
    onPointerMove?: EventHandlerUnion<T, PointerEvent>;
    onPointerOut?: EventHandlerUnion<T, PointerEvent>;
    onPointerOver?: EventHandlerUnion<T, PointerEvent>;
    onPointerUp?: EventHandlerUnion<T, PointerEvent>;
    onProgress?: EventHandlerUnion<T, Event>;
    onRateChange?: EventHandlerUnion<T, Event>;
    onReset?: EventHandlerUnion<T, Event>;
    onScroll?: EventHandlerUnion<T, Event>;
    onScrollEnd?: EventHandlerUnion<T, Event>;
    onSeeked?: EventHandlerUnion<T, Event>;
    onSeeking?: EventHandlerUnion<T, Event>;
    onSelect?: EventHandlerUnion<T, UIEvent>;
    onStalled?: EventHandlerUnion<T, Event>;
    onSubmit?: EventHandlerUnion<
      T,
      Event & {
        submitter: HTMLElement;
      }
    >;
    onSuspend?: EventHandlerUnion<T, Event>;
    onTimeUpdate?: EventHandlerUnion<T, Event>;
    onTouchCancel?: EventHandlerUnion<T, TouchEvent>;
    onTouchEnd?: EventHandlerUnion<T, TouchEvent>;
    onTouchMove?: EventHandlerUnion<T, TouchEvent>;
    onTouchStart?: EventHandlerUnion<T, TouchEvent>;
    onTransitionStart?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionEnd?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionRun?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionCancel?: EventHandlerUnion<T, TransitionEvent>;
    onVolumeChange?: EventHandlerUnion<T, Event>;
    onWaiting?: EventHandlerUnion<T, Event>;
    onWheel?: EventHandlerUnion<T, WheelEvent>;
  }
  /**
   * @type {GlobalEventHandlers}
   */
  interface CustomEventHandlersLowerCase<T> {
    onabort?: EventHandlerUnion<T, Event>;
    onanimationend?: EventHandlerUnion<T, AnimationEvent>;
    onanimationiteration?: EventHandlerUnion<T, AnimationEvent>;
    onanimationstart?: EventHandlerUnion<T, AnimationEvent>;
    onauxclick?: EventHandlerUnion<T, MouseEvent>;
    onbeforeinput?: InputEventHandlerUnion<T, InputEvent>;
    onblur?: FocusEventHandlerUnion<T, FocusEvent>;
    oncanplay?: EventHandlerUnion<T, Event>;
    oncanplaythrough?: EventHandlerUnion<T, Event>;
    onchange?: ChangeEventHandlerUnion<T, Event>;
    onclick?: EventHandlerUnion<T, MouseEvent>;
    oncontextmenu?: EventHandlerUnion<T, MouseEvent>;
    ondblclick?: EventHandlerUnion<T, MouseEvent>;
    ondrag?: EventHandlerUnion<T, DragEvent>;
    ondragend?: EventHandlerUnion<T, DragEvent>;
    ondragenter?: EventHandlerUnion<T, DragEvent>;
    ondragleave?: EventHandlerUnion<T, DragEvent>;
    ondragover?: EventHandlerUnion<T, DragEvent>;
    ondragstart?: EventHandlerUnion<T, DragEvent>;
    ondrop?: EventHandlerUnion<T, DragEvent>;
    ondurationchange?: EventHandlerUnion<T, Event>;
    onemptied?: EventHandlerUnion<T, Event>;
    onended?: EventHandlerUnion<T, Event>;
    onerror?: EventHandlerUnion<T, Event>;
    onfocus?: FocusEventHandlerUnion<T, FocusEvent>;
    ongotpointercapture?: EventHandlerUnion<T, PointerEvent>;
    oninput?: InputEventHandlerUnion<T, InputEvent>;
    oninvalid?: EventHandlerUnion<T, Event>;
    onkeydown?: EventHandlerUnion<T, KeyboardEvent>;
    onkeypress?: EventHandlerUnion<T, KeyboardEvent>;
    onkeyup?: EventHandlerUnion<T, KeyboardEvent>;
    onload?: EventHandlerUnion<T, Event>;
    onloadeddata?: EventHandlerUnion<T, Event>;
    onloadedmetadata?: EventHandlerUnion<T, Event>;
    onloadstart?: EventHandlerUnion<T, Event>;
    onlostpointercapture?: EventHandlerUnion<T, PointerEvent>;
    onmousedown?: EventHandlerUnion<T, MouseEvent>;
    onmouseenter?: EventHandlerUnion<T, MouseEvent>;
    onmouseleave?: EventHandlerUnion<T, MouseEvent>;
    onmousemove?: EventHandlerUnion<T, MouseEvent>;
    onmouseout?: EventHandlerUnion<T, MouseEvent>;
    onmouseover?: EventHandlerUnion<T, MouseEvent>;
    onmouseup?: EventHandlerUnion<T, MouseEvent>;
    onpause?: EventHandlerUnion<T, Event>;
    onplay?: EventHandlerUnion<T, Event>;
    onplaying?: EventHandlerUnion<T, Event>;
    onpointercancel?: EventHandlerUnion<T, PointerEvent>;
    onpointerdown?: EventHandlerUnion<T, PointerEvent>;
    onpointerenter?: EventHandlerUnion<T, PointerEvent>;
    onpointerleave?: EventHandlerUnion<T, PointerEvent>;
    onpointermove?: EventHandlerUnion<T, PointerEvent>;
    onpointerout?: EventHandlerUnion<T, PointerEvent>;
    onpointerover?: EventHandlerUnion<T, PointerEvent>;
    onpointerup?: EventHandlerUnion<T, PointerEvent>;
    onprogress?: EventHandlerUnion<T, Event>;
    onratechange?: EventHandlerUnion<T, Event>;
    onreset?: EventHandlerUnion<T, Event>;
    onscroll?: EventHandlerUnion<T, Event>;
    onscrollend?: EventHandlerUnion<T, Event>;
    onseeked?: EventHandlerUnion<T, Event>;
    onseeking?: EventHandlerUnion<T, Event>;
    onselect?: EventHandlerUnion<T, UIEvent>;
    onstalled?: EventHandlerUnion<T, Event>;
    onsubmit?: EventHandlerUnion<
      T,
      Event & {
        submitter: HTMLElement;
      }
    >;
    onsuspend?: EventHandlerUnion<T, Event>;
    ontimeupdate?: EventHandlerUnion<T, Event>;
    ontouchcancel?: EventHandlerUnion<T, TouchEvent>;
    ontouchend?: EventHandlerUnion<T, TouchEvent>;
    ontouchmove?: EventHandlerUnion<T, TouchEvent>;
    ontouchstart?: EventHandlerUnion<T, TouchEvent>;
    ontransitionstart?: EventHandlerUnion<T, TransitionEvent>;
    ontransitionend?: EventHandlerUnion<T, TransitionEvent>;
    ontransitionrun?: EventHandlerUnion<T, TransitionEvent>;
    ontransitioncancel?: EventHandlerUnion<T, TransitionEvent>;
    onvolumechange?: EventHandlerUnion<T, Event>;
    onwaiting?: EventHandlerUnion<T, Event>;
    onwheel?: EventHandlerUnion<T, WheelEvent>;
  }

  interface CSSProperties extends csstype.PropertiesHyphen {
    // Override
    [key: `-${string}`]: string | number | undefined;
  }

  type HTMLAutocapitalize = "off" | "none" | "on" | "sentences" | "words" | "characters";
  type HTMLDir = "ltr" | "rtl" | "auto";
  type HTMLFormEncType = "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain";
  type HTMLFormMethod = "post" | "get" | "dialog";
  type HTMLCrossorigin = "anonymous" | "use-credentials" | "";
  type HTMLReferrerPolicy =
    | "no-referrer"
    | "no-referrer-when-downgrade"
    | "origin"
    | "origin-when-cross-origin"
    | "same-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin"
    | "unsafe-url";
  type HTMLIframeSandbox =
    | "allow-downloads-without-user-activation"
    | "allow-downloads"
    | "allow-forms"
    | "allow-modals"
    | "allow-orientation-lock"
    | "allow-pointer-lock"
    | "allow-popups"
    | "allow-popups-to-escape-sandbox"
    | "allow-presentation"
    | "allow-same-origin"
    | "allow-scripts"
    | "allow-storage-access-by-user-activation"
    | "allow-top-navigation"
    | "allow-top-navigation-by-user-activation"
    | "allow-top-navigation-to-custom-protocols";
  type HTMLLinkAs =
    | "audio"
    | "document"
    | "embed"
    | "fetch"
    | "font"
    | "image"
    | "object"
    | "script"
    | "style"
    | "track"
    | "video"
    | "worker";

  // All the WAI-ARIA 1.1 attributes from https://www.w3.org/TR/wai-aria-1.1/
  interface AriaAttributes {
    /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
    "aria-activedescendant"?: string;
    /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
    "aria-atomic"?: boolean | "false" | "true";
    /**
     * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
     * presented if they are made.
     */
    "aria-autocomplete"?: "none" | "inline" | "list" | "both";
    /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
    "aria-busy"?: boolean | "false" | "true";
    /**
     * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
     * @see aria-pressed @see aria-selected.
     */
    "aria-checked"?: boolean | "false" | "mixed" | "true";
    /**
     * Defines the total number of columns in a table, grid, or treegrid.
     * @see aria-colindex.
     */
    "aria-colcount"?: number | string;
    /**
     * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
     * @see aria-colcount @see aria-colspan.
     */
    "aria-colindex"?: number | string;
    /**
     * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
     * @see aria-colindex @see aria-rowspan.
     */
    "aria-colspan"?: number | string;
    /**
     * Identifies the element (or elements) whose contents or presence are controlled by the current element.
     * @see aria-owns.
     */
    "aria-controls"?: string;
    /** Indicates the element that represents the current item within a container or set of related elements. */
    "aria-current"?: boolean | "false" | "true" | "page" | "step" | "location" | "date" | "time";
    /**
     * Identifies the element (or elements) that describes the object.
     * @see aria-labelledby
     */
    "aria-describedby"?: string;
    /**
     * Identifies the element that provides a detailed, extended description for the object.
     * @see aria-describedby.
     */
    "aria-details"?: string;
    /**
     * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
     * @see aria-hidden @see aria-readonly.
     */
    "aria-disabled"?: boolean | "false" | "true";
    /**
     * Indicates what functions can be performed when a dragged object is released on the drop target.
     * @deprecated in ARIA 1.1
     */
    "aria-dropeffect"?: "none" | "copy" | "execute" | "link" | "move" | "popup";
    /**
     * Identifies the element that provides an error message for the object.
     * @see aria-invalid @see aria-describedby.
     */
    "aria-errormessage"?: string;
    /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
    "aria-expanded"?: boolean | "false" | "true";
    /**
     * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
     * allows assistive technology to override the general default of reading in document source order.
     */
    "aria-flowto"?: string;
    /**
     * Indicates an element's "grabbed" state in a drag-and-drop operation.
     * @deprecated in ARIA 1.1
     */
    "aria-grabbed"?: boolean | "false" | "true";
    /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
    "aria-haspopup"?: boolean | "false" | "true" | "menu" | "listbox" | "tree" | "grid" | "dialog";
    /**
     * Indicates whether the element is exposed to an accessibility API.
     * @see aria-disabled.
     */
    "aria-hidden"?: boolean | "false" | "true";
    /**
     * Indicates the entered value does not conform to the format expected by the application.
     * @see aria-errormessage.
     */
    "aria-invalid"?: boolean | "false" | "true" | "grammar" | "spelling";
    /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
    "aria-keyshortcuts"?: string;
    /**
     * Defines a string value that labels the current element.
     * @see aria-labelledby.
     */
    "aria-label"?: string;
    /**
     * Identifies the element (or elements) that labels the current element.
     * @see aria-describedby.
     */
    "aria-labelledby"?: string;
    /** Defines the hierarchical level of an element within a structure. */
    "aria-level"?: number | string;
    /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
    "aria-live"?: "off" | "assertive" | "polite";
    /** Indicates whether an element is modal when displayed. */
    "aria-modal"?: boolean | "false" | "true";
    /** Indicates whether a text box accepts multiple lines of input or only a single line. */
    "aria-multiline"?: boolean | "false" | "true";
    /** Indicates that the user may select more than one item from the current selectable descendants. */
    "aria-multiselectable"?: boolean | "false" | "true";
    /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
    "aria-orientation"?: "horizontal" | "vertical";
    /**
     * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
     * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
     * @see aria-controls.
     */
    "aria-owns"?: string;
    /**
     * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
     * A hint could be a sample value or a brief description of the expected format.
     */
    "aria-placeholder"?: string;
    /**
     * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
     * @see aria-setsize.
     */
    "aria-posinset"?: number | string;
    /**
     * Indicates the current "pressed" state of toggle buttons.
     * @see aria-checked @see aria-selected.
     */
    "aria-pressed"?: boolean | "false" | "mixed" | "true";
    /**
     * Indicates that the element is not editable, but is otherwise operable.
     * @see aria-disabled.
     */
    "aria-readonly"?: boolean | "false" | "true";
    /**
     * Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.
     * @see aria-atomic.
     */
    "aria-relevant"?:
      | "additions"
      | "additions removals"
      | "additions text"
      | "all"
      | "removals"
      | "removals additions"
      | "removals text"
      | "text"
      | "text additions"
      | "text removals";
    /** Indicates that user input is required on the element before a form may be submitted. */
    "aria-required"?: boolean | "false" | "true";
    /** Defines a human-readable, author-localized description for the role of an element. */
    "aria-roledescription"?: string;
    /**
     * Defines the total number of rows in a table, grid, or treegrid.
     * @see aria-rowindex.
     */
    "aria-rowcount"?: number | string;
    /**
     * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
     * @see aria-rowcount @see aria-rowspan.
     */
    "aria-rowindex"?: number | string;
    /**
     * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
     * @see aria-rowindex @see aria-colspan.
     */
    "aria-rowspan"?: number | string;
    /**
     * Indicates the current "selected" state of various widgets.
     * @see aria-checked @see aria-pressed.
     */
    "aria-selected"?: boolean | "false" | "true";
    /**
     * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
     * @see aria-posinset.
     */
    "aria-setsize"?: number | string;
    /** Indicates if items in a table or grid are sorted in ascending or descending order. */
    "aria-sort"?: "none" | "ascending" | "descending" | "other";
    /** Defines the maximum allowed value for a range widget. */
    "aria-valuemax"?: number | string;
    /** Defines the minimum allowed value for a range widget. */
    "aria-valuemin"?: number | string;
    /**
     * Defines the current value for a range widget.
     * @see aria-valuetext.
     */
    "aria-valuenow"?: number | string;
    /** Defines the human readable text alternative of aria-valuenow for a range widget. */
    "aria-valuetext"?: string;
    role?:
      | "alert"
      | "alertdialog"
      | "application"
      | "article"
      | "banner"
      | "button"
      | "cell"
      | "checkbox"
      | "columnheader"
      | "combobox"
      | "complementary"
      | "contentinfo"
      | "definition"
      | "dialog"
      | "directory"
      | "document"
      | "feed"
      | "figure"
      | "form"
      | "grid"
      | "gridcell"
      | "group"
      | "heading"
      | "img"
      | "link"
      | "list"
      | "listbox"
      | "listitem"
      | "log"
      | "main"
      | "marquee"
      | "math"
      | "menu"
      | "menubar"
      | "menuitem"
      | "menuitemcheckbox"
      | "menuitemradio"
      | "meter"
      | "navigation"
      | "none"
      | "note"
      | "option"
      | "presentation"
      | "progressbar"
      | "radio"
      | "radiogroup"
      | "region"
      | "row"
      | "rowgroup"
      | "rowheader"
      | "scrollbar"
      | "search"
      | "searchbox"
      | "separator"
      | "slider"
      | "spinbutton"
      | "status"
      | "switch"
      | "tab"
      | "table"
      | "tablist"
      | "tabpanel"
      | "term"
      | "textbox"
      | "timer"
      | "toolbar"
      | "tooltip"
      | "tree"
      | "treegrid"
      | "treeitem";
  }

  // TODO: Should we allow this?
  // type ClassKeys = `class:${string}`;
  // type CSSKeys = Exclude<keyof csstype.PropertiesHyphen, `-${string}`>;

  // type CSSAttributes = {
  //   [key in CSSKeys as `style:${key}`]: csstype.PropertiesHyphen[key];
  // };

  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    // [key: ClassKeys]: boolean;
    accessKey?: string;
    class?: string | undefined;
    contenteditable?: boolean | "plaintext-only" | "inherit";
    contextmenu?: string;
    dir?: HTMLDir;
    draggable?: boolean | "false" | "true";
    hidden?: boolean | "hidden" | "until-found";
    id?: string;
    inert?: boolean;
    lang?: string;
    spellcheck?: boolean;
    style?: CSSProperties | string;
    tabindex?: number | string;
    title?: string;
    translate?: "yes" | "no";
    about?: string;
    datatype?: string;
    inlist?: any;
    popover?: boolean | "manual" | "auto";
    prefix?: string;
    property?: string;
    resource?: string;
    typeof?: string;
    vocab?: string;
    autocapitalize?: HTMLAutocapitalize;
    slot?: string;
    color?: string;
    itemprop?: string;
    itemscope?: boolean;
    itemtype?: string;
    itemid?: string;
    itemref?: string;
    part?: string;
    exportparts?: string;
    inputmode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
    contentEditable?: boolean | "plaintext-only" | "inherit";
    contextMenu?: string;
    tabIndex?: number | string;
    autoCapitalize?: HTMLAutocapitalize;
    itemProp?: string;
    itemScope?: boolean;
    itemType?: string;
    itemId?: string;
    itemRef?: string;
    exportParts?: string;
    inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  }
  interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
    download?: any;
    href?: string;
    hreflang?: string;
    media?: string;
    ping?: string;
    referrerpolicy?: HTMLReferrerPolicy;
    rel?: string;
    target?: string;
    type?: string;
    referrerPolicy?: HTMLReferrerPolicy;
  }
  interface AudioHTMLAttributes<T> extends MediaHTMLAttributes<T> {}
  interface AreaHTMLAttributes<T> extends HTMLAttributes<T> {
    alt?: string;
    coords?: string;
    download?: any;
    href?: string;
    hreflang?: string;
    ping?: string;
    referrerpolicy?: HTMLReferrerPolicy;
    rel?: string;
    shape?: "rect" | "circle" | "poly" | "default";
    target?: string;
    referrerPolicy?: HTMLReferrerPolicy;
  }
  interface BaseHTMLAttributes<T> extends HTMLAttributes<T> {
    href?: string;
    target?: string;
  }
  interface BlockquoteHTMLAttributes<T> extends HTMLAttributes<T> {
    cite?: string;
  }
  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    autofocus?: boolean;
    disabled?: boolean;
    form?: string;
    formaction?: string | SerializableAttributeValue;
    formenctype?: HTMLFormEncType;
    formmethod?: HTMLFormMethod;
    formnovalidate?: boolean;
    formtarget?: string;
    popovertarget?: string;
    popovertargetaction?: "hide" | "show" | "toggle";
    name?: string;
    type?: "submit" | "reset" | "button";
    value?: string;
    formAction?: string | SerializableAttributeValue;
    formEnctype?: HTMLFormEncType;
    formMethod?: HTMLFormMethod;
    formNoValidate?: boolean;
    formTarget?: string;
    popoverTarget?: string;
    popoverTargetAction?: "hide" | "show" | "toggle";
  }
  interface CanvasHTMLAttributes<T> extends HTMLAttributes<T> {
    width?: number | string;
    height?: number | string;
  }
  interface ColHTMLAttributes<T> extends HTMLAttributes<T> {
    span?: number | string;
    width?: number | string;
  }
  interface ColgroupHTMLAttributes<T> extends HTMLAttributes<T> {
    span?: number | string;
  }
  interface DataHTMLAttributes<T> extends HTMLAttributes<T> {
    value?: string | string[] | number;
  }
  interface DetailsHtmlAttributes<T> extends HTMLAttributes<T> {
    open?: boolean;
    onToggle?: EventHandlerUnion<T, Event>;
    ontoggle?: EventHandlerUnion<T, Event>;
  }
  interface DialogHtmlAttributes<T> extends HTMLAttributes<T> {
    open?: boolean;
    onClose?: EventHandlerUnion<T, Event>;
    onCancel?: EventHandlerUnion<T, Event>;
  }
  interface EmbedHTMLAttributes<T> extends HTMLAttributes<T> {
    height?: number | string;
    src?: string;
    type?: string;
    width?: number | string;
  }
  interface FieldsetHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean;
    form?: string;
    name?: string;
  }
  interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
    "accept-charset"?: string;
    action?: string | SerializableAttributeValue;
    autocomplete?: string;
    encoding?: HTMLFormEncType;
    enctype?: HTMLFormEncType;
    method?: HTMLFormMethod;
    name?: string;
    novalidate?: boolean;
    target?: string;
    noValidate?: boolean;
  }
  interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
    allow?: string;
    allowfullscreen?: boolean;
    height?: number | string;
    loading?: "eager" | "lazy";
    name?: string;
    referrerpolicy?: HTMLReferrerPolicy;
    sandbox?: HTMLIframeSandbox | string;
    src?: string;
    srcdoc?: string;
    width?: number | string;
    referrerPolicy?: HTMLReferrerPolicy;
  }
  interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
    alt?: string;
    crossorigin?: HTMLCrossorigin;
    decoding?: "sync" | "async" | "auto";
    height?: number | string;
    ismap?: boolean;
    isMap?: boolean;
    loading?: "eager" | "lazy";
    referrerpolicy?: HTMLReferrerPolicy;
    referrerPolicy?: HTMLReferrerPolicy;
    sizes?: string;
    src?: string;
    srcset?: string;
    srcSet?: string;
    usemap?: string;
    useMap?: string;
    width?: number | string;
    crossOrigin?: HTMLCrossorigin;
    elementtiming?: string;
    fetchpriority?: "high" | "low" | "auto";
  }
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    accept?: string;
    alt?: string;
    autocomplete?: string;
    autocorrect?: "on" | "off";
    autofocus?: boolean;
    capture?: boolean | string;
    checked?: boolean;
    crossorigin?: HTMLCrossorigin;
    disabled?: boolean;
    enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
    form?: string;
    formaction?: string | SerializableAttributeValue;
    formenctype?: HTMLFormEncType;
    formmethod?: HTMLFormMethod;
    formnovalidate?: boolean;
    formtarget?: string;
    height?: number | string;
    incremental?: boolean;
    list?: string;
    max?: number | string;
    maxlength?: number | string;
    min?: number | string;
    minlength?: number | string;
    multiple?: boolean;
    name?: string;
    pattern?: string;
    placeholder?: string;
    readonly?: boolean;
    results?: number;
    required?: boolean;
    size?: number | string;
    src?: string;
    step?: number | string;
    type?: string;
    value?: string | string[] | number;
    width?: number | string;
    crossOrigin?: HTMLCrossorigin;
    formAction?: string | SerializableAttributeValue;
    formEnctype?: HTMLFormEncType;
    formMethod?: HTMLFormMethod;
    formNoValidate?: boolean;
    formTarget?: string;
    maxLength?: number | string;
    minLength?: number | string;
    readOnly?: boolean;
  }
  interface InsHTMLAttributes<T> extends HTMLAttributes<T> {
    cite?: string;
    dateTime?: string;
  }
  interface KeygenHTMLAttributes<T> extends HTMLAttributes<T> {
    autofocus?: boolean;
    challenge?: string;
    disabled?: boolean;
    form?: string;
    keytype?: string;
    keyparams?: string;
    name?: string;
  }
  interface LabelHTMLAttributes<T> extends HTMLAttributes<T> {
    for?: string;
    form?: string;
  }
  interface LiHTMLAttributes<T> extends HTMLAttributes<T> {
    value?: number | string;
  }
  interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
    as?: HTMLLinkAs;
    crossorigin?: HTMLCrossorigin;
    disabled?: boolean;
    fetchpriority?: "high" | "low" | "auto";
    href?: string;
    hreflang?: string;
    imagesizes?: string;
    imagesrcset?: string;
    integrity?: string;
    media?: string;
    referrerpolicy?: HTMLReferrerPolicy;
    rel?: string;
    sizes?: string;
    type?: string;
    crossOrigin?: HTMLCrossorigin;
    referrerPolicy?: HTMLReferrerPolicy;
  }
  interface MapHTMLAttributes<T> extends HTMLAttributes<T> {
    name?: string;
  }
  interface MediaHTMLAttributes<T> extends HTMLAttributes<T> {
    autoplay?: boolean;
    controls?: boolean;
    crossorigin?: HTMLCrossorigin;
    loop?: boolean;
    mediagroup?: string;
    muted?: boolean;
    preload?: "none" | "metadata" | "auto" | "";
    src?: string;
    crossOrigin?: HTMLCrossorigin;
    mediaGroup?: string;
  }
  interface MenuHTMLAttributes<T> extends HTMLAttributes<T> {
    label?: string;
    type?: "context" | "toolbar";
  }
  interface MetaHTMLAttributes<T> extends HTMLAttributes<T> {
    charset?: string;
    content?: string;
    "http-equiv"?: string;
    name?: string;
    media?: string;
  }
  interface MeterHTMLAttributes<T> extends HTMLAttributes<T> {
    form?: string;
    high?: number | string;
    low?: number | string;
    max?: number | string;
    min?: number | string;
    optimum?: number | string;
    value?: string | string[] | number;
  }
  interface QuoteHTMLAttributes<T> extends HTMLAttributes<T> {
    cite?: string;
  }
  interface ObjectHTMLAttributes<T> extends HTMLAttributes<T> {
    data?: string;
    form?: string;
    height?: number | string;
    name?: string;
    type?: string;
    usemap?: string;
    width?: number | string;
    useMap?: string;
  }
  interface OlHTMLAttributes<T> extends HTMLAttributes<T> {
    reversed?: boolean;
    start?: number | string;
    type?: "1" | "a" | "A" | "i" | "I";
  }
  interface OptgroupHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean;
    label?: string;
  }
  interface OptionHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean;
    label?: string;
    selected?: boolean;
    value?: string | string[] | number;
  }
  interface OutputHTMLAttributes<T> extends HTMLAttributes<T> {
    form?: string;
    for?: string;
    name?: string;
  }
  interface ParamHTMLAttributes<T> extends HTMLAttributes<T> {
    name?: string;
    value?: string | string[] | number;
  }
  interface ProgressHTMLAttributes<T> extends HTMLAttributes<T> {
    max?: number | string;
    value?: string | string[] | number;
  }
  interface ScriptHTMLAttributes<T> extends HTMLAttributes<T> {
    async?: boolean;
    charset?: string;
    crossorigin?: HTMLCrossorigin;
    defer?: boolean;
    integrity?: string;
    nomodule?: boolean;
    nonce?: string;
    referrerpolicy?: HTMLReferrerPolicy;
    src?: string;
    type?: string;
    crossOrigin?: HTMLCrossorigin;
    noModule?: boolean;
    referrerPolicy?: HTMLReferrerPolicy;
  }
  interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
    autocomplete?: string;
    autofocus?: boolean;
    disabled?: boolean;
    form?: string;
    multiple?: boolean;
    name?: string;
    required?: boolean;
    size?: number | string;
    value?: string | string[] | number;
  }
  interface HTMLSlotElementAttributes<T = HTMLSlotElement> extends HTMLAttributes<T> {
    name?: string;
  }
  interface SourceHTMLAttributes<T> extends HTMLAttributes<T> {
    media?: string;
    sizes?: string;
    src?: string;
    srcset?: string;
    type?: string;
  }
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    media?: string;
    nonce?: string;
    scoped?: boolean;
    type?: string;
  }
  interface TdHTMLAttributes<T> extends HTMLAttributes<T> {
    colspan?: number | string;
    headers?: string;
    rowspan?: number | string;
    colSpan?: number | string;
    rowSpan?: number | string;
  }
  interface TemplateHTMLAttributes<T extends HTMLTemplateElement> extends HTMLAttributes<T> {
    content?: DocumentFragment;
  }
  interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
    autocomplete?: string;
    autofocus?: boolean;
    cols?: number | string;
    dirname?: string;
    disabled?: boolean;
    enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
    form?: string;
    maxlength?: number | string;
    minlength?: number | string;
    name?: string;
    placeholder?: string;
    readonly?: boolean;
    required?: boolean;
    rows?: number | string;
    value?: string | string[] | number;
    wrap?: "hard" | "soft" | "off";
    maxLength?: number | string;
    minLength?: number | string;
    readOnly?: boolean;
  }
  interface ThHTMLAttributes<T> extends HTMLAttributes<T> {
    colspan?: number | string;
    headers?: string;
    rowspan?: number | string;
    colSpan?: number | string;
    rowSpan?: number | string;
    scope?: "col" | "row" | "rowgroup" | "colgroup";
  }
  interface TimeHTMLAttributes<T> extends HTMLAttributes<T> {
    datetime?: string;
    dateTime?: string;
  }
  interface TrackHTMLAttributes<T> extends HTMLAttributes<T> {
    default?: boolean;
    kind?: "subtitles" | "captions" | "descriptions" | "chapters" | "metadata";
    label?: string;
    src?: string;
    srclang?: string;
  }
  interface VideoHTMLAttributes<T> extends MediaHTMLAttributes<T> {
    height?: number | string;
    playsinline?: boolean;
    poster?: string;
    width?: number | string;
  }
  type SVGPreserveAspectRatio =
    | "none"
    | "xMinYMin"
    | "xMidYMin"
    | "xMaxYMin"
    | "xMinYMid"
    | "xMidYMid"
    | "xMaxYMid"
    | "xMinYMax"
    | "xMidYMax"
    | "xMaxYMax"
    | "xMinYMin meet"
    | "xMidYMin meet"
    | "xMaxYMin meet"
    | "xMinYMid meet"
    | "xMidYMid meet"
    | "xMaxYMid meet"
    | "xMinYMax meet"
    | "xMidYMax meet"
    | "xMaxYMax meet"
    | "xMinYMin slice"
    | "xMidYMin slice"
    | "xMaxYMin slice"
    | "xMinYMid slice"
    | "xMidYMid slice"
    | "xMaxYMid slice"
    | "xMinYMax slice"
    | "xMidYMax slice"
    | "xMaxYMax slice";
  type ImagePreserveAspectRatio =
    | SVGPreserveAspectRatio
    | "defer none"
    | "defer xMinYMin"
    | "defer xMidYMin"
    | "defer xMaxYMin"
    | "defer xMinYMid"
    | "defer xMidYMid"
    | "defer xMaxYMid"
    | "defer xMinYMax"
    | "defer xMidYMax"
    | "defer xMaxYMax"
    | "defer xMinYMin meet"
    | "defer xMidYMin meet"
    | "defer xMaxYMin meet"
    | "defer xMinYMid meet"
    | "defer xMidYMid meet"
    | "defer xMaxYMid meet"
    | "defer xMinYMax meet"
    | "defer xMidYMax meet"
    | "defer xMaxYMax meet"
    | "defer xMinYMin slice"
    | "defer xMidYMin slice"
    | "defer xMaxYMin slice"
    | "defer xMinYMid slice"
    | "defer xMidYMid slice"
    | "defer xMaxYMid slice"
    | "defer xMinYMax slice"
    | "defer xMidYMax slice"
    | "defer xMaxYMax slice";
  type SVGUnits = "userSpaceOnUse" | "objectBoundingBox";
  interface CoreSVGAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    id?: string;
    lang?: string;
    tabIndex?: number | string;
    tabindex?: number | string;
  }
  interface StylableSVGAttributes {
    class?: string | undefined;
    style?: CSSProperties | string;
  }
  interface TransformableSVGAttributes {
    transform?: string;
  }
  interface ConditionalProcessingSVGAttributes {
    requiredExtensions?: string;
    requiredFeatures?: string;
    systemLanguage?: string;
  }
  interface ExternalResourceSVGAttributes {
    externalResourcesRequired?: "true" | "false";
  }
  interface AnimationTimingSVGAttributes {
    begin?: string;
    dur?: string;
    end?: string;
    min?: string;
    max?: string;
    restart?: "always" | "whenNotActive" | "never";
    repeatCount?: number | "indefinite";
    repeatDur?: string;
    fill?: "freeze" | "remove";
  }
  interface AnimationValueSVGAttributes {
    calcMode?: "discrete" | "linear" | "paced" | "spline";
    values?: string;
    keyTimes?: string;
    keySplines?: string;
    from?: number | string;
    to?: number | string;
    by?: number | string;
  }
  interface AnimationAdditionSVGAttributes {
    attributeName?: string;
    additive?: "replace" | "sum";
    accumulate?: "none" | "sum";
  }
  interface AnimationAttributeTargetSVGAttributes {
    attributeName?: string;
    attributeType?: "CSS" | "XML" | "auto";
  }
  interface PresentationSVGAttributes {
    "alignment-baseline"?:
      | "auto"
      | "baseline"
      | "before-edge"
      | "text-before-edge"
      | "middle"
      | "central"
      | "after-edge"
      | "text-after-edge"
      | "ideographic"
      | "alphabetic"
      | "hanging"
      | "mathematical"
      | "inherit";
    "baseline-shift"?: number | string;
    clip?: string;
    "clip-path"?: string;
    "clip-rule"?: "nonzero" | "evenodd" | "inherit";
    color?: string;
    "color-interpolation"?: "auto" | "sRGB" | "linearRGB" | "inherit";
    "color-interpolation-filters"?: "auto" | "sRGB" | "linearRGB" | "inherit";
    "color-profile"?: string;
    "color-rendering"?: "auto" | "optimizeSpeed" | "optimizeQuality" | "inherit";
    cursor?: string;
    direction?: "ltr" | "rtl" | "inherit";
    display?: string;
    "dominant-baseline"?:
      | "auto"
      | "text-bottom"
      | "alphabetic"
      | "ideographic"
      | "middle"
      | "central"
      | "mathematical"
      | "hanging"
      | "text-top"
      | "inherit";
    "enable-background"?: string;
    fill?: string;
    "fill-opacity"?: number | string | "inherit";
    "fill-rule"?: "nonzero" | "evenodd" | "inherit";
    filter?: string;
    "flood-color"?: string;
    "flood-opacity"?: number | string | "inherit";
    "font-family"?: string;
    "font-size"?: string;
    "font-size-adjust"?: number | string;
    "font-stretch"?: string;
    "font-style"?: "normal" | "italic" | "oblique" | "inherit";
    "font-variant"?: string;
    "font-weight"?: number | string;
    "glyph-orientation-horizontal"?: string;
    "glyph-orientation-vertical"?: string;
    "image-rendering"?: "auto" | "optimizeQuality" | "optimizeSpeed" | "inherit";
    kerning?: string;
    "letter-spacing"?: number | string;
    "lighting-color"?: string;
    "marker-end"?: string;
    "marker-mid"?: string;
    "marker-start"?: string;
    mask?: string;
    opacity?: number | string | "inherit";
    overflow?: "visible" | "hidden" | "scroll" | "auto" | "inherit";
    pathLength?: string | number;
    "pointer-events"?:
      | "bounding-box"
      | "visiblePainted"
      | "visibleFill"
      | "visibleStroke"
      | "visible"
      | "painted"
      | "color"
      | "fill"
      | "stroke"
      | "all"
      | "none"
      | "inherit";
    "shape-rendering"?: "auto" | "optimizeSpeed" | "crispEdges" | "geometricPrecision" | "inherit";
    "stop-color"?: string;
    "stop-opacity"?: number | string | "inherit";
    stroke?: string;
    "stroke-dasharray"?: string;
    "stroke-dashoffset"?: number | string;
    "stroke-linecap"?: "butt" | "round" | "square" | "inherit";
    "stroke-linejoin"?: "arcs" | "bevel" | "miter" | "miter-clip" | "round" | "inherit";
    "stroke-miterlimit"?: number | string | "inherit";
    "stroke-opacity"?: number | string | "inherit";
    "stroke-width"?: number | string;
    "text-anchor"?: "start" | "middle" | "end" | "inherit";
    "text-decoration"?: "none" | "underline" | "overline" | "line-through" | "blink" | "inherit";
    "text-rendering"?:
      | "auto"
      | "optimizeSpeed"
      | "optimizeLegibility"
      | "geometricPrecision"
      | "inherit";
    "unicode-bidi"?: string;
    visibility?: "visible" | "hidden" | "collapse" | "inherit";
    "word-spacing"?: number | string;
    "writing-mode"?: "lr-tb" | "rl-tb" | "tb-rl" | "lr" | "rl" | "tb" | "inherit";
  }
  interface AnimationElementSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      ExternalResourceSVGAttributes,
      ConditionalProcessingSVGAttributes {}
  interface ContainerElementSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      ShapeElementSVGAttributes<T>,
      Pick<
        PresentationSVGAttributes,
        | "clip-path"
        | "mask"
        | "cursor"
        | "opacity"
        | "filter"
        | "enable-background"
        | "color-interpolation"
        | "color-rendering"
      > {}
  interface FilterPrimitiveElementSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      Pick<PresentationSVGAttributes, "color-interpolation-filters"> {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    result?: string;
  }
  interface SingleInputFilterSVGAttributes {
    in?: string;
  }
  interface DoubleInputFilterSVGAttributes {
    in?: string;
    in2?: string;
  }
  interface FitToViewBoxSVGAttributes {
    viewBox?: string;
    preserveAspectRatio?: SVGPreserveAspectRatio;
  }
  interface GradientElementSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes {
    gradientUnits?: SVGUnits;
    gradientTransform?: string;
    spreadMethod?: "pad" | "reflect" | "repeat";
    href?: string;
  }
  interface GraphicsElementSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      Pick<
        PresentationSVGAttributes,
        | "clip-rule"
        | "mask"
        | "pointer-events"
        | "cursor"
        | "opacity"
        | "filter"
        | "display"
        | "visibility"
        | "color-interpolation"
        | "color-rendering"
      > {}
  interface LightSourceElementSVGAttributes<T> extends CoreSVGAttributes<T> {}
  interface NewViewportSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      Pick<PresentationSVGAttributes, "overflow" | "clip"> {
    viewBox?: string;
  }
  interface ShapeElementSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      Pick<
        PresentationSVGAttributes,
        | "color"
        | "fill"
        | "fill-rule"
        | "fill-opacity"
        | "stroke"
        | "stroke-width"
        | "stroke-linecap"
        | "stroke-linejoin"
        | "stroke-miterlimit"
        | "stroke-dasharray"
        | "stroke-dashoffset"
        | "stroke-opacity"
        | "shape-rendering"
        | "pathLength"
      > {}
  interface TextContentElementSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      Pick<
        PresentationSVGAttributes,
        | "font-family"
        | "font-style"
        | "font-variant"
        | "font-weight"
        | "font-stretch"
        | "font-size"
        | "font-size-adjust"
        | "kerning"
        | "letter-spacing"
        | "word-spacing"
        | "text-decoration"
        | "glyph-orientation-horizontal"
        | "glyph-orientation-vertical"
        | "direction"
        | "unicode-bidi"
        | "text-anchor"
        | "dominant-baseline"
        | "color"
        | "fill"
        | "fill-rule"
        | "fill-opacity"
        | "stroke"
        | "stroke-width"
        | "stroke-linecap"
        | "stroke-linejoin"
        | "stroke-miterlimit"
        | "stroke-dasharray"
        | "stroke-dashoffset"
        | "stroke-opacity"
      > {}
  interface ZoomAndPanSVGAttributes {
    zoomAndPan?: "disable" | "magnify";
  }
  interface AnimateSVGAttributes<T>
    extends AnimationElementSVGAttributes<T>,
      AnimationAttributeTargetSVGAttributes,
      AnimationTimingSVGAttributes,
      AnimationValueSVGAttributes,
      AnimationAdditionSVGAttributes,
      Pick<PresentationSVGAttributes, "color-interpolation" | "color-rendering"> {}
  interface AnimateMotionSVGAttributes<T>
    extends AnimationElementSVGAttributes<T>,
      AnimationTimingSVGAttributes,
      AnimationValueSVGAttributes,
      AnimationAdditionSVGAttributes {
    path?: string;
    keyPoints?: string;
    rotate?: number | string | "auto" | "auto-reverse";
    origin?: "default";
  }
  interface AnimateTransformSVGAttributes<T>
    extends AnimationElementSVGAttributes<T>,
      AnimationAttributeTargetSVGAttributes,
      AnimationTimingSVGAttributes,
      AnimationValueSVGAttributes,
      AnimationAdditionSVGAttributes {
    type?: "translate" | "scale" | "rotate" | "skewX" | "skewY";
  }
  interface CircleSVGAttributes<T>
    extends GraphicsElementSVGAttributes<T>,
      ShapeElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes {
    cx?: number | string;
    cy?: number | string;
    r?: number | string;
  }
  interface ClipPathSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "clip-path"> {
    clipPathUnits?: SVGUnits;
  }
  interface DefsSVGAttributes<T>
    extends ContainerElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes {}
  interface DescSVGAttributes<T> extends CoreSVGAttributes<T>, StylableSVGAttributes {}
  interface EllipseSVGAttributes<T>
    extends GraphicsElementSVGAttributes<T>,
      ShapeElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes {
    cx?: number | string;
    cy?: number | string;
    rx?: number | string;
    ry?: number | string;
  }
  interface FeBlendSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      DoubleInputFilterSVGAttributes,
      StylableSVGAttributes {
    mode?: "normal" | "multiply" | "screen" | "darken" | "lighten";
  }
  interface FeColorMatrixSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes {
    type?: "matrix" | "saturate" | "hueRotate" | "luminanceToAlpha";
    values?: string;
  }
  interface FeComponentTransferSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes {}
  interface FeCompositeSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      DoubleInputFilterSVGAttributes,
      StylableSVGAttributes {
    operator?: "over" | "in" | "out" | "atop" | "xor" | "arithmetic";
    k1?: number | string;
    k2?: number | string;
    k3?: number | string;
    k4?: number | string;
  }
  interface FeConvolveMatrixSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes {
    order?: number | string;
    kernelMatrix?: string;
    divisor?: number | string;
    bias?: number | string;
    targetX?: number | string;
    targetY?: number | string;
    edgeMode?: "duplicate" | "wrap" | "none";
    kernelUnitLength?: number | string;
    preserveAlpha?: "true" | "false";
  }
  interface FeDiffuseLightingSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes,
      Pick<PresentationSVGAttributes, "color" | "lighting-color"> {
    surfaceScale?: number | string;
    diffuseConstant?: number | string;
    kernelUnitLength?: number | string;
  }
  interface FeDisplacementMapSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      DoubleInputFilterSVGAttributes,
      StylableSVGAttributes {
    scale?: number | string;
    xChannelSelector?: "R" | "G" | "B" | "A";
    yChannelSelector?: "R" | "G" | "B" | "A";
  }
  interface FeDistantLightSVGAttributes<T> extends LightSourceElementSVGAttributes<T> {
    azimuth?: number | string;
    elevation?: number | string;
  }
  interface FeDropShadowSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      FilterPrimitiveElementSVGAttributes<T>,
      StylableSVGAttributes,
      Pick<PresentationSVGAttributes, "color" | "flood-color" | "flood-opacity"> {
    dx?: number | string;
    dy?: number | string;
    stdDeviation?: number | string;
  }
  interface FeFloodSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      StylableSVGAttributes,
      Pick<PresentationSVGAttributes, "color" | "flood-color" | "flood-opacity"> {}
  interface FeFuncSVGAttributes<T> extends CoreSVGAttributes<T> {
    type?: "identity" | "table" | "discrete" | "linear" | "gamma";
    tableValues?: string;
    slope?: number | string;
    intercept?: number | string;
    amplitude?: number | string;
    exponent?: number | string;
    offset?: number | string;
  }
  interface FeGaussianBlurSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes {
    stdDeviation?: number | string;
  }
  interface FeImageSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes {
    preserveAspectRatio?: SVGPreserveAspectRatio;
    href?: string;
  }
  interface FeMergeSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      StylableSVGAttributes {}
  interface FeMergeNodeSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      SingleInputFilterSVGAttributes {}
  interface FeMorphologySVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes {
    operator?: "erode" | "dilate";
    radius?: number | string;
  }
  interface FeOffsetSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes {
    dx?: number | string;
    dy?: number | string;
  }
  interface FePointLightSVGAttributes<T> extends LightSourceElementSVGAttributes<T> {
    x?: number | string;
    y?: number | string;
    z?: number | string;
  }
  interface FeSpecularLightingSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes,
      Pick<PresentationSVGAttributes, "color" | "lighting-color"> {
    surfaceScale?: string;
    specularConstant?: string;
    specularExponent?: string;
    kernelUnitLength?: number | string;
  }
  interface FeSpotLightSVGAttributes<T> extends LightSourceElementSVGAttributes<T> {
    x?: number | string;
    y?: number | string;
    z?: number | string;
    pointsAtX?: number | string;
    pointsAtY?: number | string;
    pointsAtZ?: number | string;
    specularExponent?: number | string;
    limitingConeAngle?: number | string;
  }
  interface FeTileSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      SingleInputFilterSVGAttributes,
      StylableSVGAttributes {}
  interface FeTurbulanceSVGAttributes<T>
    extends FilterPrimitiveElementSVGAttributes<T>,
      StylableSVGAttributes {
    baseFrequency?: number | string;
    numOctaves?: number | string;
    seed?: number | string;
    stitchTiles?: "stitch" | "noStitch";
    type?: "fractalNoise" | "turbulence";
  }
  interface FilterSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes {
    filterUnits?: SVGUnits;
    primitiveUnits?: SVGUnits;
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    filterRes?: number | string;
  }
  interface ForeignObjectSVGAttributes<T>
    extends NewViewportSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "display" | "visibility"> {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
  }
  interface GSVGAttributes<T>
    extends ContainerElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "display" | "visibility"> {}
  interface ImageSVGAttributes<T>
    extends NewViewportSVGAttributes<T>,
      GraphicsElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "color-profile" | "image-rendering"> {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    preserveAspectRatio?: ImagePreserveAspectRatio;
    href?: string;
  }
  interface LineSVGAttributes<T>
    extends GraphicsElementSVGAttributes<T>,
      ShapeElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "marker-start" | "marker-mid" | "marker-end"> {
    x1?: number | string;
    y1?: number | string;
    x2?: number | string;
    y2?: number | string;
  }
  interface LinearGradientSVGAttributes<T> extends GradientElementSVGAttributes<T> {
    x1?: number | string;
    x2?: number | string;
    y1?: number | string;
    y2?: number | string;
  }
  interface MarkerSVGAttributes<T>
    extends ContainerElementSVGAttributes<T>,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      FitToViewBoxSVGAttributes,
      Pick<PresentationSVGAttributes, "overflow" | "clip"> {
    markerUnits?: "strokeWidth" | "userSpaceOnUse";
    refX?: number | string;
    refY?: number | string;
    markerWidth?: number | string;
    markerHeight?: number | string;
    orient?: string;
  }
  interface MaskSVGAttributes<T>
    extends Omit<ContainerElementSVGAttributes<T>, "opacity" | "filter">,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes {
    maskUnits?: SVGUnits;
    maskContentUnits?: SVGUnits;
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
  }
  interface MetadataSVGAttributes<T> extends CoreSVGAttributes<T> {}
  interface MPathSVGAttributes<T> extends CoreSVGAttributes<T> {}
  interface PathSVGAttributes<T>
    extends GraphicsElementSVGAttributes<T>,
      ShapeElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "marker-start" | "marker-mid" | "marker-end"> {
    d?: string;
    pathLength?: number | string;
  }
  interface PatternSVGAttributes<T>
    extends ContainerElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      FitToViewBoxSVGAttributes,
      Pick<PresentationSVGAttributes, "overflow" | "clip"> {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    patternUnits?: SVGUnits;
    patternContentUnits?: SVGUnits;
    patternTransform?: string;
    href?: string;
  }
  interface PolygonSVGAttributes<T>
    extends GraphicsElementSVGAttributes<T>,
      ShapeElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "marker-start" | "marker-mid" | "marker-end"> {
    points?: string;
  }
  interface PolylineSVGAttributes<T>
    extends GraphicsElementSVGAttributes<T>,
      ShapeElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "marker-start" | "marker-mid" | "marker-end"> {
    points?: string;
  }
  interface RadialGradientSVGAttributes<T> extends GradientElementSVGAttributes<T> {
    cx?: number | string;
    cy?: number | string;
    r?: number | string;
    fx?: number | string;
    fy?: number | string;
  }
  interface RectSVGAttributes<T>
    extends GraphicsElementSVGAttributes<T>,
      ShapeElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    rx?: number | string;
    ry?: number | string;
  }
  interface SetSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      StylableSVGAttributes,
      AnimationTimingSVGAttributes {}
  interface StopSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      StylableSVGAttributes,
      Pick<PresentationSVGAttributes, "color" | "stop-color" | "stop-opacity"> {
    offset?: number | string;
  }
  interface SvgSVGAttributes<T>
    extends ContainerElementSVGAttributes<T>,
      NewViewportSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      FitToViewBoxSVGAttributes,
      ZoomAndPanSVGAttributes,
      PresentationSVGAttributes {
    version?: string;
    baseProfile?: string;
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    contentScriptType?: string;
    contentStyleType?: string;
    xmlns?: string;
  }
  interface SwitchSVGAttributes<T>
    extends ContainerElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "display" | "visibility"> {}
  interface SymbolSVGAttributes<T>
    extends ContainerElementSVGAttributes<T>,
      NewViewportSVGAttributes<T>,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      FitToViewBoxSVGAttributes {
    width?: number | string;
    height?: number | string;
    preserveAspectRatio?: SVGPreserveAspectRatio;
    refX?: number | string;
    refY?: number | string;
    viewBox?: string;
    x?: number | string;
    y?: number | string;
  }
  interface TextSVGAttributes<T>
    extends TextContentElementSVGAttributes<T>,
      GraphicsElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      TransformableSVGAttributes,
      Pick<PresentationSVGAttributes, "writing-mode" | "text-rendering"> {
    x?: number | string;
    y?: number | string;
    dx?: number | string;
    dy?: number | string;
    rotate?: number | string;
    textLength?: number | string;
    lengthAdjust?: "spacing" | "spacingAndGlyphs";
  }
  interface TextPathSVGAttributes<T>
    extends TextContentElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      Pick<
        PresentationSVGAttributes,
        "alignment-baseline" | "baseline-shift" | "display" | "visibility"
      > {
    startOffset?: number | string;
    method?: "align" | "stretch";
    spacing?: "auto" | "exact";
    href?: string;
  }
  interface TSpanSVGAttributes<T>
    extends TextContentElementSVGAttributes<T>,
      ConditionalProcessingSVGAttributes,
      ExternalResourceSVGAttributes,
      StylableSVGAttributes,
      Pick<
        PresentationSVGAttributes,
        "alignment-baseline" | "baseline-shift" | "display" | "visibility"
      > {
    x?: number | string;
    y?: number | string;
    dx?: number | string;
    dy?: number | string;
    rotate?: number | string;
    textLength?: number | string;
    lengthAdjust?: "spacing" | "spacingAndGlyphs";
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Element/use
   */
  interface UseSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      StylableSVGAttributes,
      ConditionalProcessingSVGAttributes,
      GraphicsElementSVGAttributes<T>,
      PresentationSVGAttributes,
      ExternalResourceSVGAttributes,
      TransformableSVGAttributes {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    href?: string;
  }
  interface ViewSVGAttributes<T>
    extends CoreSVGAttributes<T>,
      ExternalResourceSVGAttributes,
      FitToViewBoxSVGAttributes,
      ZoomAndPanSVGAttributes {
    viewTarget?: string;
  }
  /**
   * @type {HTMLElementTagNameMap}
   */
  interface HTMLElementTags {
    a: AnchorHTMLAttributes<HTMLAnchorElement>;
    abbr: HTMLAttributes<HTMLElement>;
    address: HTMLAttributes<HTMLElement>;
    area: AreaHTMLAttributes<HTMLAreaElement>;
    article: HTMLAttributes<HTMLElement>;
    aside: HTMLAttributes<HTMLElement>;
    audio: AudioHTMLAttributes<HTMLAudioElement>;
    b: HTMLAttributes<HTMLElement>;
    base: BaseHTMLAttributes<HTMLBaseElement>;
    bdi: HTMLAttributes<HTMLElement>;
    bdo: HTMLAttributes<HTMLElement>;
    blockquote: BlockquoteHTMLAttributes<HTMLElement>;
    body: HTMLAttributes<HTMLBodyElement>;
    br: HTMLAttributes<HTMLBRElement>;
    button: ButtonHTMLAttributes<HTMLButtonElement>;
    canvas: CanvasHTMLAttributes<HTMLCanvasElement>;
    caption: HTMLAttributes<HTMLElement>;
    cite: HTMLAttributes<HTMLElement>;
    code: HTMLAttributes<HTMLElement>;
    col: ColHTMLAttributes<HTMLTableColElement>;
    colgroup: ColgroupHTMLAttributes<HTMLTableColElement>;
    data: DataHTMLAttributes<HTMLElement>;
    datalist: HTMLAttributes<HTMLDataListElement>;
    dd: HTMLAttributes<HTMLElement>;
    del: HTMLAttributes<HTMLElement>;
    details: DetailsHtmlAttributes<HTMLDetailsElement>;
    dfn: HTMLAttributes<HTMLElement>;
    dialog: DialogHtmlAttributes<HTMLDialogElement>;
    div: HTMLAttributes<HTMLDivElement>;
    dl: HTMLAttributes<HTMLDListElement>;
    dt: HTMLAttributes<HTMLElement>;
    em: HTMLAttributes<HTMLElement>;
    embed: EmbedHTMLAttributes<HTMLEmbedElement>;
    fieldset: FieldsetHTMLAttributes<HTMLFieldSetElement>;
    figcaption: HTMLAttributes<HTMLElement>;
    figure: HTMLAttributes<HTMLElement>;
    footer: HTMLAttributes<HTMLElement>;
    form: FormHTMLAttributes<HTMLFormElement>;
    h1: HTMLAttributes<HTMLHeadingElement>;
    h2: HTMLAttributes<HTMLHeadingElement>;
    h3: HTMLAttributes<HTMLHeadingElement>;
    h4: HTMLAttributes<HTMLHeadingElement>;
    h5: HTMLAttributes<HTMLHeadingElement>;
    h6: HTMLAttributes<HTMLHeadingElement>;
    head: HTMLAttributes<HTMLHeadElement>;
    header: HTMLAttributes<HTMLElement>;
    hgroup: HTMLAttributes<HTMLElement>;
    hr: HTMLAttributes<HTMLHRElement>;
    html: HTMLAttributes<HTMLHtmlElement>;
    i: HTMLAttributes<HTMLElement>;
    iframe: IframeHTMLAttributes<HTMLIFrameElement>;
    img: ImgHTMLAttributes<HTMLImageElement>;
    input: InputHTMLAttributes<HTMLInputElement>;
    ins: InsHTMLAttributes<HTMLModElement>;
    kbd: HTMLAttributes<HTMLElement>;
    label: LabelHTMLAttributes<HTMLLabelElement>;
    legend: HTMLAttributes<HTMLLegendElement>;
    li: LiHTMLAttributes<HTMLLIElement>;
    link: LinkHTMLAttributes<HTMLLinkElement>;
    main: HTMLAttributes<HTMLElement>;
    map: MapHTMLAttributes<HTMLMapElement>;
    mark: HTMLAttributes<HTMLElement>;
    menu: MenuHTMLAttributes<HTMLElement>;
    meta: MetaHTMLAttributes<HTMLMetaElement>;
    meter: MeterHTMLAttributes<HTMLElement>;
    nav: HTMLAttributes<HTMLElement>;
    noscript: HTMLAttributes<HTMLElement>;
    object: ObjectHTMLAttributes<HTMLObjectElement>;
    ol: OlHTMLAttributes<HTMLOListElement>;
    optgroup: OptgroupHTMLAttributes<HTMLOptGroupElement>;
    option: OptionHTMLAttributes<HTMLOptionElement>;
    output: OutputHTMLAttributes<HTMLElement>;
    p: HTMLAttributes<HTMLParagraphElement>;
    picture: HTMLAttributes<HTMLElement>;
    pre: HTMLAttributes<HTMLPreElement>;
    progress: ProgressHTMLAttributes<HTMLProgressElement>;
    q: QuoteHTMLAttributes<HTMLQuoteElement>;
    rp: HTMLAttributes<HTMLElement>;
    rt: HTMLAttributes<HTMLElement>;
    ruby: HTMLAttributes<HTMLElement>;
    s: HTMLAttributes<HTMLElement>;
    samp: HTMLAttributes<HTMLElement>;
    script: ScriptHTMLAttributes<HTMLScriptElement>;
    search: HTMLAttributes<HTMLElement>;
    section: HTMLAttributes<HTMLElement>;
    select: SelectHTMLAttributes<HTMLSelectElement>;
    slot: HTMLSlotElementAttributes;
    small: HTMLAttributes<HTMLElement>;
    source: SourceHTMLAttributes<HTMLSourceElement>;
    span: HTMLAttributes<HTMLSpanElement>;
    strong: HTMLAttributes<HTMLElement>;
    style: StyleHTMLAttributes<HTMLStyleElement>;
    sub: HTMLAttributes<HTMLElement>;
    summary: HTMLAttributes<HTMLElement>;
    sup: HTMLAttributes<HTMLElement>;
    table: HTMLAttributes<HTMLTableElement>;
    tbody: HTMLAttributes<HTMLTableSectionElement>;
    td: TdHTMLAttributes<HTMLTableCellElement>;
    template: TemplateHTMLAttributes<HTMLTemplateElement>;
    textarea: TextareaHTMLAttributes<HTMLTextAreaElement>;
    tfoot: HTMLAttributes<HTMLTableSectionElement>;
    th: ThHTMLAttributes<HTMLTableCellElement>;
    thead: HTMLAttributes<HTMLTableSectionElement>;
    time: TimeHTMLAttributes<HTMLElement>;
    title: HTMLAttributes<HTMLTitleElement>;
    tr: HTMLAttributes<HTMLTableRowElement>;
    track: TrackHTMLAttributes<HTMLTrackElement>;
    u: HTMLAttributes<HTMLElement>;
    ul: HTMLAttributes<HTMLUListElement>;
    var: HTMLAttributes<HTMLElement>;
    video: VideoHTMLAttributes<HTMLVideoElement>;
    wbr: HTMLAttributes<HTMLElement>;
  }
  /**
   * @type {HTMLElementDeprecatedTagNameMap}
   */
  interface HTMLElementDeprecatedTags {
    big: HTMLAttributes<HTMLElement>;
    keygen: KeygenHTMLAttributes<HTMLElement>;
    menuitem: HTMLAttributes<HTMLElement>;
    noindex: HTMLAttributes<HTMLElement>;
    param: ParamHTMLAttributes<HTMLParamElement>;
  }
  /**
   * @type {SVGElementTagNameMap}
   */
  interface SVGElementTags {
    animate: AnimateSVGAttributes<SVGAnimateElement>;
    animateMotion: AnimateMotionSVGAttributes<SVGAnimateMotionElement>;
    animateTransform: AnimateTransformSVGAttributes<SVGAnimateTransformElement>;
    circle: CircleSVGAttributes<SVGCircleElement>;
    clipPath: ClipPathSVGAttributes<SVGClipPathElement>;
    defs: DefsSVGAttributes<SVGDefsElement>;
    desc: DescSVGAttributes<SVGDescElement>;
    ellipse: EllipseSVGAttributes<SVGEllipseElement>;
    feBlend: FeBlendSVGAttributes<SVGFEBlendElement>;
    feColorMatrix: FeColorMatrixSVGAttributes<SVGFEColorMatrixElement>;
    feComponentTransfer: FeComponentTransferSVGAttributes<SVGFEComponentTransferElement>;
    feComposite: FeCompositeSVGAttributes<SVGFECompositeElement>;
    feConvolveMatrix: FeConvolveMatrixSVGAttributes<SVGFEConvolveMatrixElement>;
    feDiffuseLighting: FeDiffuseLightingSVGAttributes<SVGFEDiffuseLightingElement>;
    feDisplacementMap: FeDisplacementMapSVGAttributes<SVGFEDisplacementMapElement>;
    feDistantLight: FeDistantLightSVGAttributes<SVGFEDistantLightElement>;
    feDropShadow: FeDropShadowSVGAttributes<SVGFEDropShadowElement>;
    feFlood: FeFloodSVGAttributes<SVGFEFloodElement>;
    feFuncA: FeFuncSVGAttributes<SVGFEFuncAElement>;
    feFuncB: FeFuncSVGAttributes<SVGFEFuncBElement>;
    feFuncG: FeFuncSVGAttributes<SVGFEFuncGElement>;
    feFuncR: FeFuncSVGAttributes<SVGFEFuncRElement>;
    feGaussianBlur: FeGaussianBlurSVGAttributes<SVGFEGaussianBlurElement>;
    feImage: FeImageSVGAttributes<SVGFEImageElement>;
    feMerge: FeMergeSVGAttributes<SVGFEMergeElement>;
    feMergeNode: FeMergeNodeSVGAttributes<SVGFEMergeNodeElement>;
    feMorphology: FeMorphologySVGAttributes<SVGFEMorphologyElement>;
    feOffset: FeOffsetSVGAttributes<SVGFEOffsetElement>;
    fePointLight: FePointLightSVGAttributes<SVGFEPointLightElement>;
    feSpecularLighting: FeSpecularLightingSVGAttributes<SVGFESpecularLightingElement>;
    feSpotLight: FeSpotLightSVGAttributes<SVGFESpotLightElement>;
    feTile: FeTileSVGAttributes<SVGFETileElement>;
    feTurbulence: FeTurbulanceSVGAttributes<SVGFETurbulenceElement>;
    filter: FilterSVGAttributes<SVGFilterElement>;
    foreignObject: ForeignObjectSVGAttributes<SVGForeignObjectElement>;
    g: GSVGAttributes<SVGGElement>;
    image: ImageSVGAttributes<SVGImageElement>;
    line: LineSVGAttributes<SVGLineElement>;
    linearGradient: LinearGradientSVGAttributes<SVGLinearGradientElement>;
    marker: MarkerSVGAttributes<SVGMarkerElement>;
    mask: MaskSVGAttributes<SVGMaskElement>;
    metadata: MetadataSVGAttributes<SVGMetadataElement>;
    mpath: MPathSVGAttributes<SVGMPathElement>;
    path: PathSVGAttributes<SVGPathElement>;
    pattern: PatternSVGAttributes<SVGPatternElement>;
    polygon: PolygonSVGAttributes<SVGPolygonElement>;
    polyline: PolylineSVGAttributes<SVGPolylineElement>;
    radialGradient: RadialGradientSVGAttributes<SVGRadialGradientElement>;
    rect: RectSVGAttributes<SVGRectElement>;
    set: SetSVGAttributes<SVGSetElement>;
    stop: StopSVGAttributes<SVGStopElement>;
    svg: SvgSVGAttributes<SVGSVGElement>;
    switch: SwitchSVGAttributes<SVGSwitchElement>;
    symbol: SymbolSVGAttributes<SVGSymbolElement>;
    text: TextSVGAttributes<SVGTextElement>;
    textPath: TextPathSVGAttributes<SVGTextPathElement>;
    tspan: TSpanSVGAttributes<SVGTSpanElement>;
    use: UseSVGAttributes<SVGUseElement>;
    view: ViewSVGAttributes<SVGViewElement>;
  }
  interface IntrinsicElements extends HTMLElementTags, HTMLElementDeprecatedTags, SVGElementTags {}
}
