// scripts/klarna.js
import { onDocumentLoaded } from '@theme/utilities';

const KLARNA_CLIENT_ID = '9a7b477a-a77b-56da-bf77-ca01e3b33014';
const KLARNA_SRC = `https://js.klarna.com/web-sdk/v1/klarna.js?client_id=${KLARNA_CLIENT_ID}`;

export function loadKlarna() {
  // Avoid duplicate loads
  if (document.querySelector(`script[src*="klarna.com"][data-client-id="${KLARNA_CLIENT_ID}"]`)) {
    console.debug('Klarna script already loaded');
    return;
  }

  const script = document.createElement('script');
  script.src = KLARNA_SRC;
  script.async = true;
  script.setAttribute('data-environment', 'production');
  script.setAttribute('data-client-id', KLARNA_CLIENT_ID);

  script.onerror = () => {
    console.warn('Klarna failed to load');
    window.refreshKlarnaMessages = () => {};
  };

  document.head.appendChild(script);

  // Set up observer to refresh when Klarna is ready
  const observer = new MutationObserver(() => {
    if (window.Klarna?.OnsiteMessaging) {
      window.Klarna.OnsiteMessaging.refresh();
      observer.disconnect();
      window.refreshKlarnaMessages = () => window.Klarna.OnsiteMessaging.refresh();
    }
  });

  observer.observe(document, { childList: true, subtree: true });

  // Fallback: stop trying after 5s
  const timeout = setTimeout(() => {
    if (!window.Klarna) {
      console.warn('Klarna failed to load within 5s');
      observer.disconnect();
    }
  }, 5000);

  // Clean up if needed
  return () => {
    clearTimeout(timeout);
    observer.disconnect();
  };
}

// Load when DOM is ready
onDocumentLoaded(() => {
  loadKlarna();
});
