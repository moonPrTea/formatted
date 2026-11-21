import type {View} from '../core/types.js';

export interface DashboardSummary {
  history: string;
}

export interface ShellProps {
  view: View;
  title: string;
  content: string;
  warning: string;
  environment: string;
  dashboard: DashboardSummary;
  sidebarCollapsed: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  timer?: string;
  platform: string;
  canOpenSheets: boolean;
}

export interface WorkspaceSection {
  label: string;
  value: string;
  content: string;
}
