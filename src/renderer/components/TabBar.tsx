import type { Tab } from '../navigation'

interface TabBarProps {
  tabs: { id: Tab; label: string }[]   // the list of tab configs to render (from navigation.ts)
  activeTab: Tab   
  onTabChange: (tab: Tab) => void  // callback fired when the user taps a different tab
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="flex shrink-0 border-t border-gray-700 bg-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
            tab.id === activeTab
              ? 'border-t-2 border-green-500 text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}