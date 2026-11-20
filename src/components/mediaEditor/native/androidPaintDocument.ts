import type {HistoryItem} from '@components/mediaEditor/context';
import type {AndroidShapeGeometry} from '@components/mediaEditor/native/androidShapeGeometry';
import {androidStampPlacementVersion} from '@components/mediaEditor/native/androidStampPlacement';
import type {AndroidPlacementResult} from '@components/mediaEditor/native/androidStampPlacement';
import {validateAndroidShapeUniforms} from '@components/mediaEditor/webgl/androidShapeUniforms';
import type {AndroidShapeRGBA} from '@components/mediaEditor/webgl/androidShapeUniforms';
import type {AndroidStamp, AndroidStampDescriptor} from '@components/mediaEditor/webgl/androidStampsContract';

/** Opt-in format ONLY. Never reinterpret brushDrawnLines or overlayShapeLayers.
 * Source: Telegram-Android 21f7d109da6ab3506c9e9577f98c6a38771ab335.
 * ShapeInput.process/stop/clear; LPhotoPaintView undoButton/undoAllButton.
 * This is a command document, not native bitmap persistence or a GPU renderer.
 */
export const androidPaintDocumentVersion = 'android-paint-v1' as const;
export const androidPaintDocumentLimits = Object.freeze({operations: 4096, stamps: 262144, pixels: 16777216});

/** Caller must inverse-map view coordinates before providing native painting units.
 * Android dp density is NOT browser DPR/CSS scale. No inferred physical width.
 * Shapes and stamps both use logical downward Y. The shared adapter maps this
 * plane to source-centred coordinates; GPU presentation inverts rows once.
 */
export type AndroidPaintContext = Readonly<{
  paintingSize: AndroidStampDescriptor['paintingSize'];
  androidDensity: number;
}>;
export type AndroidPaintShape = Readonly<{kind: 'shape'; geometry: AndroidShapeGeometry; rgba: AndroidShapeRGBA}>;
type PaintDescriptor = AndroidStampDescriptor | (Omit<AndroidStampDescriptor, 'tool'> & {tool: 'eraser'});
export type AndroidPaintOperation = AndroidPaintShape |
  Readonly<{kind: 'stroke'; descriptor: AndroidStampDescriptor; stamps: readonly Readonly<AndroidStamp>[]}> |
  Readonly<{kind: 'erase'; descriptor: Omit<AndroidStampDescriptor, 'tool'> & {tool: 'eraser'}; stamps: readonly Readonly<AndroidStamp>[]}>;
export type AndroidPaintDocument = Readonly<{
  version: typeof androidPaintDocumentVersion;
  context: AndroidPaintContext;
  operations: readonly AndroidPaintOperation[];
  stampCount: number;
}>;
export type AndroidPaintSession = Readonly<{
  document: AndroidPaintDocument;
  activeShape?: AndroidPaintShape;
  tool: 'pen' | 'shape';
}>;
/** EditingMediaState opts in explicitly. Attach to the existing
 * HistoryItem at ['androidPaintDocument']; never maintain a second undo stack.
 * Drafts are transient and must NOT enter the persisted document/history.
 */
export type AndroidPaintChange = {
  [Key in keyof Pick<HistoryItem, 'oldValue' | 'newValue'>]: AndroidPaintDocument;
};

function invalid(): never { throw new RangeError('Invalid or unsupported android-paint-v1 data'); }
function keys(value: object, allowed: string[]) {
  if(!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid();
}
function positive(value: number) { return Number.isFinite(value) && value > 0; }
function sameSize(a: readonly number[], b: readonly number[]) { return a[0] === b[0] && a[1] === b[1]; }
function validateContext(context: AndroidPaintContext) {
  keys(context, ['paintingSize', 'androidDensity']);
  const size = context.paintingSize;
  if(!Array.isArray(size) || size.length !== 2 || !size.every(n => Number.isInteger(n) && n > 0) ||
    size[0] * size[1] > androidPaintDocumentLimits.pixels || !positive(context.androidDensity)) invalid();
}

/** structuredClone is the repo's snapshot mechanism. Restrict its input first:
 * only finite JSON data, plain objects, no accessors/resources/functions/cycles.
 * Depth/node/string caps bound malformed imports before cloning/freezing.
 * No shared deep-freeze helper exists; this is local to the versioned format.
 */
function snapshot<T>(value: T): T {
  let nodes = 0;
  const walk = (item: unknown, depth: number, freeze: boolean) => {
    if(++nodes > 2000000 || depth > 12) invalid();
    if(item === null || typeof item === 'boolean') return;
    if(typeof item === 'number') { if(!Number.isFinite(item)) invalid(); return; }
    if(typeof item === 'string') { if(item.length > 256) invalid(); return; }
    if(typeof item !== 'object') invalid();
    const proto = Object.getPrototypeOf(item);
    if(proto !== Object.prototype && proto !== Array.prototype) invalid();
    if(Array.isArray(item) && (item.length > 2000000 || Object.keys(item).length !== item.length)) invalid();
    for(const key of Reflect.ownKeys(item)) {
      if(Array.isArray(item) && key === 'length') continue;
      if(typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype') invalid();
      if(Array.isArray(item) && (!Number.isSafeInteger(Number(key)) || Number(key) < 0 || Number(key) >= item.length || String(Number(key)) !== key)) invalid();
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if(!descriptor.enumerable || !('value' in descriptor)) invalid();
      walk(descriptor.value, depth + 1, freeze);
    }
    if(freeze) Object.freeze(item);
  };
  walk(value, 0, false);
  const copy = structuredClone(value);
  nodes = 0;
  walk(copy, 0, true);
  return copy;
}

function validateOperation(op: AndroidPaintOperation, context: AndroidPaintContext) {
  if(op?.kind === 'shape') {
    keys(op, ['kind', 'geometry', 'rgba']);
    const s = op.geometry;
    keys(s, ['geometryVersion', 'shape', 'paintingSize', 'density', 'center', 'radius', 'middle', 'rotation', 'thickness', 'rounding', 'arrowTriangleLength', 'color', 'filled', 'controlPoints']);
    validateAndroidShapeUniforms(s, op.rgba);
    if(!sameSize(s.paintingSize, context.paintingSize) || s.density !== context.androidDensity || typeof s.color !== 'string') invalid();
    if(s.controlPoints) {
      if(!Array.isArray(s.controlPoints) || s.controlPoints.length > 8) invalid();
      for(const c of s.controlPoints) {
        keys(c, ['id', 'point', 'green', 'rotate']);
        if(!['radial', 'corner-0', 'corner-1', 'corner-2', 'corner-3', 'rotation', 'tail', 'head-length', 'bend', 'end', 'center'].includes(c.id) ||
          !Array.isArray(c.point) || c.point.length !== 2 || !c.point.every(Number.isFinite) || typeof c.green !== 'boolean' || typeof c.rotate !== 'boolean') invalid();
      }
    }
    return 0;
  }
  if(op?.kind !== 'stroke' && op?.kind !== 'erase') invalid();
  keys(op, ['kind', 'descriptor', 'stamps']);
  const d = op.descriptor;
  keys(d, ['version', 'tool', 'normalizedWeight', 'paintingSize', 'viewportScaleAtCapture', 'color']);
  if(d.version !== 1 || (op.kind === 'erase' ? d.tool !== 'eraser' : !['pen', 'arrow', 'marker', 'neon'].includes(d.tool)) ||
    !Number.isFinite(d.normalizedWeight) || d.normalizedWeight < 0 || d.normalizedWeight > (op.kind === 'erase' ? 1.75 : 1) ||
    !Array.isArray(d.paintingSize) || d.paintingSize.length !== 2 || !sameSize(d.paintingSize, context.paintingSize) || !positive(d.viewportScaleAtCapture) ||
    !Array.isArray(d.color) || d.color.length !== 4 || !d.color.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ||
    !Array.isArray(op.stamps) || !op.stamps.length || op.stamps.length > androidPaintDocumentLimits.stamps) invalid();
  for(const stamp of op.stamps) {
    keys(stamp, ['x', 'y', 'radius', 'angle', 'intensity']);
    if(![stamp.x, stamp.y, stamp.angle, stamp.radius, stamp.intensity].every(Number.isFinite) ||
      stamp.radius < 0 || stamp.intensity < 0 || stamp.intensity > 1) invalid();
  }
  // Native placement can expose retained/zero records. Do not invent positive
  // radii here: preserve those records exactly as the characterized placer does.
  return op.stamps.length;
}

export function readAndroidPaintDocument(value: unknown): AndroidPaintDocument {
  const doc = snapshot(value) as AndroidPaintDocument;
  keys(doc, ['version', 'context', 'operations', 'stampCount']);
  if(doc.version !== androidPaintDocumentVersion) invalid();
  validateContext(doc.context);
  if(!Array.isArray(doc.operations) || doc.operations.length > androidPaintDocumentLimits.operations) invalid();
  let count = 0;
  for(const op of doc.operations) count += validateOperation(op, doc.context);
  if(count !== doc.stampCount || count > androidPaintDocumentLimits.stamps) invalid();
  return doc;
}

export function createAndroidPaintDocument(context: AndroidPaintContext): AndroidPaintDocument {
  return readAndroidPaintDocument({version: androidPaintDocumentVersion, context, operations: [], stampCount: 0});
}

function assertDocument(document: AndroidPaintDocument) {
  // External/history snapshots must pass through readAndroidPaintDocument.
  if(!document || document.version !== androidPaintDocumentVersion || !Object.isFrozen(document) ||
    !Array.isArray(document.operations) || !Object.isFrozen(document.operations) || !document.context || !Object.isFrozen(document.context)) invalid();
}

/** Atomic commit boundary. Validate/copy only the new operation; share frozen
 * existing commands. O(new records + operation references), never per input point.
 * Renderer must finish scratch-mask work BEFORE installing this change/history.
 */
export function appendAndroidPaintOperation(document: AndroidPaintDocument, operation: AndroidPaintOperation): AndroidPaintChange {
  assertDocument(document);
  const op = snapshot(operation);
  const count = document.stampCount + validateOperation(op, document.context);
  if(document.operations.length >= androidPaintDocumentLimits.operations || count > androidPaintDocumentLimits.stamps) invalid();
  const next: AndroidPaintDocument = Object.freeze({...document, operations: Object.freeze([...document.operations, op]), stampCount: count});
  return {oldValue: document, newValue: next};
}

/** Accept all placement batches for ONE stroke only at commit. A failed batch
 * rejects the WHOLE stroke; no successful prefix escapes into the document.
 * Renderer/placement owners keep bounded incremental scratch state while moving.
 */
export function commitAndroidPaintPlacement(document: AndroidPaintDocument,
  descriptor: PaintDescriptor,
  batches: readonly AndroidPlacementResult[]): AndroidPaintChange {
  if(!descriptor || typeof descriptor !== 'object' || !Array.isArray(batches) || batches.length > androidPaintDocumentLimits.stamps) invalid();
  const stamps: AndroidStamp[] = [];
  for(const batch of batches) {
    if(!batch || batch.version !== androidStampPlacementVersion || (batch.status !== 'placed' && batch.status !== 'empty') || !Number.isFinite(batch.remainder)) invalid();
    if(batch.status === 'placed') {
      if(!Array.isArray(batch.stamps) || batch.nativeReservedCount !== batch.stamps.length || stamps.length + batch.stamps.length > androidPaintDocumentLimits.stamps) invalid();
      for(const stamp of batch.stamps) stamps.push(stamp);
    }
  }
  const op = descriptor.tool === 'eraser' ? {kind: 'erase' as const, descriptor, stamps} : {kind: 'stroke' as const, descriptor, stamps};
  return appendAndroidPaintOperation(document, op as AndroidPaintOperation);
}

export function beginAndroidPaintShape(document: AndroidPaintDocument, shape: AndroidPaintShape): AndroidPaintSession {
  assertDocument(document);
  if(shape?.kind !== 'shape') invalid();
  const activeShape = snapshot(shape);
  validateOperation(activeShape, document.context);
  return Object.freeze({document, activeShape, tool: 'shape'});
}

export function updateAndroidPaintShape(session: AndroidPaintSession, shape: AndroidPaintShape): AndroidPaintSession {
  if(!session.activeShape) invalid();
  return beginAndroidPaintShape(session.document, shape);
}

/** ShapeInput.stop: outside DOWN commits, consumes that event, resets to Pen.
 * Call with the final resolved thickness/color (stop reads current brush values).
 */
export function commitAndroidPaintShape(session: AndroidPaintSession): {session: AndroidPaintSession; change: AndroidPaintChange} {
  if(!session.activeShape) invalid();
  const change = appendAndroidPaintOperation(session.document, session.activeShape);
  return {session: Object.freeze({document: change.newValue, tool: 'pen'}), change};
}

/** LPhotoPaintView: active-shape Undo clears it WITHOUT undoStore.undo().
 * Committed Undo delegates to the editor's existing history; core owns no stack.
 */
export function undoAndroidPaintShape(session: AndroidPaintSession): {session: AndroidPaintSession; delegateHistory: boolean} {
  return session.activeShape ? {session: Object.freeze({document: session.document, tool: 'pen'}), delegateHistory: false} :
    {session, delegateHistory: true};
}

/** Native Clear All is a reset, NOT an undoable erase or mode Cancel.
 * Caller obeys native canUndo gate, also clears entities and resets existing
 * scoped paint/entity history + redo. Mode checkpoint lives outside that history.
 */
export function clearAllAndroidPaint(document: AndroidPaintDocument): AndroidPaintSession {
  assertDocument(document);
  return Object.freeze({document: createAndroidPaintDocument(document.context), tool: 'pen'});
}
