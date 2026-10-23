import type { HostedSurface } from '@/lib/runtimeSurface';

declare global {
  interface Window {
    __TASKHUNTER_SURFACE__?: HostedSurface;
  }
}
