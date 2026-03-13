import React from 'react';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  color?: string;
  count?: number;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, color, count }) => {
  return (
    <button 
      className={`flex items-center gap-3 px-2 py-1.5 w-full rounded-md transition-colors ${
        active 
          ? "bg-white/5 text-[#f59e0b]" 
          : "text-[#9f9fa9] hover:bg-white/5 hover:text-white"
      }`}
      style={active && color ? { color } : {}}
    >
      <div className="size-4 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="text-[13px] font-medium grow text-left">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] text-[#52525c]">{count}</span>
      )}
    </button>
  );
};

interface SidebarSectionProps {
  label: string;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({ label }) => {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 w-full text-[11px] font-medium text-[#71717b] tracking-wider uppercase">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </div>
  );
};

export const SidebarLine = () => (
  <div className="h-px bg-[#27272a] mx-2 my-2" />
);
