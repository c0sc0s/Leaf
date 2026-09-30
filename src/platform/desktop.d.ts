import type { DesktopAPI } from '@leaf/contracts/transport';
declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
