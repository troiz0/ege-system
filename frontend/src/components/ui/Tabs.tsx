import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
}

export function Tabs({ tabs, defaultTab, onChange }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-all ${
              activeTab === tab.id
                ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.08] text-[#d4ff00]'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{activeContent}</div>
    </div>
  );
}
