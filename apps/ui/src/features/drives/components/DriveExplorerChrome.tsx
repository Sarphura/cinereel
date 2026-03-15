import React from 'react';

export function ExplorerPage({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="h-[43px] border-b border-[#27272a] flex items-center justify-between px-5 shrink-0 bg-[#18181b]">
        <span className="text-[14px] font-bold text-[#e4e4e7]">{title}</span>
        {action ?? <div />}
      </div>
      {children}
    </div>
  );
}

export function ExplorerPanel({
  error,
  children,
}: {
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#18181b]">
      {error ? (
        <div className="px-4 py-2 text-xs text-[#f87171] border-b border-[#27272a]">{error}</div>
      ) : null}
      {children}
    </div>
  );
}

export function ExplorerDetailHeader({
  children,
  emptyText,
}: {
  children?: React.ReactNode;
  emptyText: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#27272a] shrink-0">
      {children ?? <div className="text-[#52525c] text-[11px]">{emptyText}</div>}
    </div>
  );
}

export function ExplorerTreeHeader({
  title = '资源树',
  actions,
}: {
  title?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="h-[43px] border-b border-[#27272a] flex items-center justify-between px-4 shrink-0">
      <span className="text-[11px] font-normal text-[#71717b] tracking-[0.5px] uppercase">{title}</span>
      {actions ?? <div />}
    </div>
  );
}

export function RoutePendingState({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-[#71717b]">
      {label}
    </div>
  );
}

export function RouteErrorState({
  title = '加载失败',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-[#5f2222] bg-[#1b1414] p-5 text-center">
        <div className="text-sm font-semibold text-[#fecaca]">{title}</div>
        <div className="mt-2 text-sm text-[#fca5a5] break-words">{message}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 h-9 rounded-lg bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
        >
          重试
        </button>
      </div>
    </div>
  );
}
