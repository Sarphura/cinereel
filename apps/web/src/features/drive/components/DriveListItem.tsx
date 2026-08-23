import React from 'react';
import type { DriveContentType, DriveStatus } from '../types';
import { getDriveTypeLabel } from '../utils';

type DriveListItemProps = {
  title?: string;
  subtitle?: string;
  subtitlePrefix?: string;
  date?: string;
  size?: string;
  peerNumber?: string;
  driveType?: DriveContentType;
  status?: DriveStatus;
  isHovered?: boolean;
  active?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onTitleClick?: () => void;
  titleSuffix?: string;
  titleAction?: React.ReactNode;
};

const DriveListItem: React.FC<DriveListItemProps> = ({
  title = "订阅源标题",
  subtitle,
  subtitlePrefix = '备注：',
  date = "2026-03-13",
  size = "320 GB",
  peerNumber = "210",
  driveType = 'generic',
  status = 'ready',
  active = false,
  onClick,
  onContextMenu,
  onTitleClick,
  titleSuffix,
  titleAction,
}) => {
  const statusMeta = status === 'pending'
    ? { label: '创建中', dot: 'bg-[#f59e0b]', ping: 'bg-[#f59e0b]/30', text: 'text-[#d97706]' }
    : status === 'failed'
      ? { label: '创建失败', dot: 'bg-[#ef4444]', ping: '', text: 'text-[#ef4444]' }
      : { label: peerNumber, dot: 'bg-[#00bc7d]', ping: 'bg-[#00bc7d]/30', text: 'text-[#52525c]' };
  const titleNode = onTitleClick ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onTitleClick();
      }}
      className="truncate cursor-copy text-left text-xs font-medium text-[#f5f5f5] hover:text-[#f59e0b]"
    >
      <span className="truncate">{title}</span>
      {titleSuffix ? <span className="ml-1 text-[10px] text-[#f59e0b]">{titleSuffix}</span> : null}
    </button>
  ) : (
    <span className="truncate text-xs font-medium text-[#e4e4e7]">
      {title}
      {titleSuffix ? <span className="ml-1 text-[10px] text-[#f59e0b]">{titleSuffix}</span> : null}
    </span>
  );

  return (
    <div 
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex flex-col gap-1 px-4 py-2.5 w-full cursor-pointer transition-colors border-l-2 ${
        active 
          ? "border-[#c47e09] bg-white/5" 
          : "border-transparent hover:border-[#c47e09]/50 hover:bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          {titleNode}
          {titleAction}
        </div>
        <span className="text-[10px] font-medium text-[#00bc7d]">{getDriveTypeLabel(driveType)}</span>
      </div>
      {subtitle ? (
        <div className="truncate text-[10px] text-[#71717b]">
          {subtitlePrefix}{subtitle}
        </div>
      ) : null}
      <div className="flex items-center justify-between mt-1">
        <div className="flex gap-4 text-[10px] text-[#3f3f46]">
          <span>{date}</span>
          <span>{size}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative size-1.5 shrink-0">
            {statusMeta.ping ? <div className={`absolute inset-0 ${statusMeta.ping} rounded-full animate-ping`} /> : null}
            <div className={`absolute inset-0 ${statusMeta.dot} rounded-full ring-1 ring-white/10`} />
          </div>
          <span className={`text-[10px] ${statusMeta.text} font-medium transition-colors group-hover:text-[#a1a1aa]`}>{statusMeta.label}</span>
        </div>
      </div>
    </div>
  );
};

export default DriveListItem;
