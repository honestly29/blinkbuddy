// Navigation types and config for the tab bar.

export type Tab = 'monitor' | 'tips' | 'stats' | 'settings'

export const TABS: { id: Tab; label: string }[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'tips', label: 'Tips & Info' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' },
]