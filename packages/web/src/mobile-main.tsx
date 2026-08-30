import { createConfiguredWebAPIs } from './runtimeConfig';
import type { RuntimeAPIs } from '@taskhunter/ui/lib/api/types';
import '@taskhunter/ui/index.css';
import '@taskhunter/ui/styles/fonts';

declare global {
  interface Window {
    __TASKHUNTER_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

window.__TASKHUNTER_RUNTIME_APIS__ = createConfiguredWebAPIs();

void import('@taskhunter/ui/apps/renderMobileApp')
  .then(({ renderMobileApp }) => {
    renderMobileApp(window.__TASKHUNTER_RUNTIME_APIS__ ?? createConfiguredWebAPIs());
  });
