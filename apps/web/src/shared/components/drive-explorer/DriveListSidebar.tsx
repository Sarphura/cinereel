import React from 'react';
import PublishedKeyItem from './PublishedKeyItem';
import type { DriveRecord } from '../../types/drive';
import { formatBytes, formatDate } from '../../utils/drive';

export type DriveListSidebarItemMeta = {
  title?: string;
  titleSuffix?: string;
  subtitle?: string;
  subtitlePrefix?: string;
  titleAction?: React.ReactNode;
  onTitleClick?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export function DriveListSidebar({
  title,
  items,
  selectedDriveKey,
  emptyText,
  onSelect,
  getItemMeta,
}: {
  title: string;
  items: DriveRecord[];
  selectedDriveKey: string | null;
  emptyText: string;
  onSelect: (driveKey: string) => void;
  getItemMeta?: (drive: DriveRecord) => DriveListSidebarItemMeta | undefined;
}) {
  return (
    <div className="w-[219px] border-r border-[#27272a] flex flex-col shrink-0 pt-6">
      <div className="flex items-center justify-between px-4 h-9 shrink-0">
        <span className="text-[11px] font-bold text-[#52525c] tracking-widest uppercase">{title}</span>
        <span className="text-[11px] text-[#3f3f46]">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length ? (
          items.map((drive) => {
            const itemMeta = getItemMeta?.(drive);

            return (
              <PublishedKeyItem
                key={drive.driveKey}
                active={drive.driveKey === selectedDriveKey}
                title={itemMeta?.title ?? drive.name}
                titleSuffix={itemMeta?.titleSuffix}
                subtitle={itemMeta?.subtitle}
                subtitlePrefix={itemMeta?.subtitlePrefix}
                date={formatDate(drive.updatedAt || drive.createdAt || Date.now())}
                size={formatBytes(drive.totalSize)}
                peerNumber={String(Number.isFinite(drive.peerCount) ? drive.peerCount : 0)}
                driveType={drive.type}
                onClick={() => onSelect(drive.driveKey)}
                onContextMenu={itemMeta?.onContextMenu}
                onTitleClick={itemMeta?.onTitleClick}
                titleAction={itemMeta?.titleAction}
              />
            );
          })
        ) : (
          <div className="px-4 py-4 text-xs text-[#52525c]">{emptyText}</div>
        )}
      </div>
    </div>
  );
}
