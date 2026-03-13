import React from 'react';

type PublishedKeyItemProps = {
  title?: string;
  date?: string;
  size?: string;
  peerNumber?: string;
  peerStatus?: "Normal" | "Error" | "Updated";
  isHovered?: boolean;
  active?: boolean;
  onClick?: () => void;
  onTitleClick?: () => void;
  titleSuffix?: string;
};

const PublishedKeyItem: React.FC<PublishedKeyItemProps> = ({
  title = "订阅源标题",
  date = "2026-03-13",
  size = "320 GB",
  peerNumber = "210",
  peerStatus = "Normal",
  active = false,
  onClick,
  onTitleClick,
  titleSuffix,
}) => {
  return (
    <div 
      onClick={onClick}
      className={`group flex flex-col gap-1 px-4 py-2.5 w-full cursor-pointer transition-colors border-l-2 ${
        active 
          ? "border-[#c47e09] bg-white/5" 
          : "border-transparent hover:border-[#c47e09]/50 hover:bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onTitleClick?.();
          }}
          className={`truncate text-left text-xs font-medium ${onTitleClick ? "cursor-copy text-[#f5f5f5] hover:text-[#f59e0b]" : "cursor-default text-[#e4e4e7]"}`}
        >
          <span className="truncate">{title}</span>
          {titleSuffix ? <span className="ml-1 text-[10px] text-[#f59e0b]">{titleSuffix}</span> : null}
        </button>
        <span className="text-[10px] font-medium text-[#00bc7d]">正常</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="flex gap-4 text-[10px] text-[#3f3f46]">
          <span>{date}</span>
          <span>{size}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative size-1.5 shrink-0">
            <div className="absolute inset-0 bg-[#00bc7d]/30 rounded-full animate-ping" />
            <div className="absolute inset-0 bg-[#00bc7d] rounded-full ring-1 ring-white/10" />
          </div>
          <span className="text-[10px] text-[#52525c] font-medium transition-colors group-hover:text-[#a1a1aa]">{peerNumber}</span>
        </div>
      </div>
    </div>
  );
};

export default PublishedKeyItem;
