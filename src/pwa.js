// Service worker registration, update notice and the "Install" button.

export function setupPwa(ui) {
  const installBtn = ui.el.install;
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => (installBtn.hidden = true));

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
    // A new version took over (it activates immediately); offer a reload between runs.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      ui.toast('Update installed - tap to reload', () => location.reload());
    });
  });
}
