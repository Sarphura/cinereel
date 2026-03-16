import React, { useState } from 'react';
import { IconPencil } from '../../../components/Icons';
import type { DriveRecord } from '../types';
import { formatBytes, formatDate, getDriveTypeLabel } from '../utils';

export function DriveSummaryHeader({
  drive,
  onEditRemark,
}: {
  drive: DriveRecord;
  onEditRemark?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const primaryText = drive.remark ?? drive.name;
  const driveTypeLabel = getDriveTypeLabel(drive.type);

  const handleCopyDriveKey = async () => {
    try {
      await navigator.clipboard.writeText(drive.driveKey);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[#00bc7d] text-[10px] font-bold tracking-wider">{driveTypeLabel}</span>
        <div className="group flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] text-[#f5f5f5] font-semibold">{primaryText}</span>
          {onEditRemark ? (
            <button
              type="button"
              aria-label="编辑备注"
              title="编辑备注"
              onClick={onEditRemark}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-[#52525c] opacity-0 transition-all hover:bg-white/5 hover:text-[#f5f5f5] focus-visible:opacity-100 group-hover:opacity-100"
            >
              <IconPencil className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#71717b]">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="uppercase text-[9px] tracking-widest font-bold opacity-50">名称</span>
          <span className="max-w-[220px] truncate text-[#a1a1aa] font-medium">{drive.name}</span>
        </div>
        <span className="text-white/10">|</span>
        <div className="flex items-center gap-1.5">
          <span className="uppercase text-[9px] tracking-widest font-bold opacity-50">类型</span>
          <span className="text-[#a1a1aa] font-medium">{driveTypeLabel}</span>
        </div>
        <span className="text-white/10">|</span>
        <div className="flex items-center gap-1.5">
          <span className="uppercase text-[9px] tracking-widest font-bold opacity-50">大小</span>
          <span className="text-[#a1a1aa] font-medium">{formatBytes(drive.totalSize)}</span>
        </div>
        <span className="text-white/10">|</span>
        <div className="flex items-center gap-1.5">
          <span className="uppercase text-[9px] tracking-widest font-bold opacity-50">日期</span>
          <span className="text-[#a1a1aa] font-medium">{formatDate(drive.updatedAt || drive.createdAt || Date.now())}</span>
        </div>
        <span className="text-white/10">|</span>
        <div className="flex items-center gap-1.5">
          <span className="uppercase text-[9px] tracking-widest font-bold opacity-50">Key</span>
          <button
            type="button"
            onClick={() => void handleCopyDriveKey()}
            className="rounded px-1.5 py-0.5 text-[#a1a1aa] font-medium hover:bg-white/5 hover:text-white transition-colors"
            title={copied ? '已复制完整 Key' : `点击复制完整 Key：${drive.driveKey}`}
          >
            {copied ? '已复制' : drive.driveKey.slice(0, 8)}
          </button>
        </div>
      </div>
    </div>
  );
}
