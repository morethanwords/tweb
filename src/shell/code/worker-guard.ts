/** Runs before compiler/engine module initializers in the dedicated Worker. */
const report = self.postMessage.bind(self);
function blocked(capability: string): never {
  report({kind: 'isolation-violation', capability});
  throw new Error(`Isolated Worker capability blocked: ${capability}`);
}
function deny(target: object, name: string, capability = name): void {
  Object.defineProperty(target, name, {configurable: false, writable: false, value: function() {return blocked(capability);}});
}
for(const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'importScripts', 'MessageChannel', 'BroadcastChannel', 'AudioContext', 'OfflineAudioContext', 'RTCPeerConnection']) deny(self, name);
for(const name of ['indexedDB', 'localStorage', 'sessionStorage', 'caches']) Object.defineProperty(self, name, {configurable: false, get: () => blocked(name)});
if(self.navigator) {
  deny(self.navigator, 'sendBeacon', 'navigator.sendBeacon');
  Object.defineProperty(self.navigator, 'storage', {configurable: false, get: () => blocked('navigator.storage')});
  Object.defineProperty(self.navigator, 'mediaDevices', {configurable: false, get: () => blocked('navigator.mediaDevices')});
  Object.defineProperty(self.navigator, 'clipboard', {configurable: false, get: () => blocked('navigator.clipboard')});
}
self.addEventListener('securitypolicyviolation', event => {
  const violation = event as SecurityPolicyViolationEvent;
  report({kind: 'isolation-violation', capability: `CSP:${violation.effectiveDirective}`});
});

export {};
