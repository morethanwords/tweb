let callback: () => Promise<void>;
export default function cacheInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (deferredPrompt: any) => {
    callback = async() => {
      deferredPrompt.prompt();
      const {outcome} = await deferredPrompt.userChoice;
      const installed = outcome === 'accepted';
      if(installed) {
        callback = undefined;
      }
    };
  });
}

export function getInstallPrompt() {
  return callback;
}
