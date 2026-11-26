import type {DesktopApi} from '../packages/contracts/practice.js';

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}
