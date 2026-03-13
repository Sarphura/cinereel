import React, { useEffect, useRef, useState } from 'react';
import {
  SidebarItem,
  SidebarSection,
  SidebarLine
} from '../components/publish/SidebarLayout';
import {
  IconDashboard,
  IconMovie,
  IconTv,
  IconMusic,
  IconDownload,
  IconMark,
  IconUpload,
  IconRefresh,
  IconPlus
} from '../components/Icons';
import PublishedKeyItem from '../components/publish/PublishedKeyItem';
import { SearchBar } from '../components/publish/SearchComponents';
import { ResourceTree, type ResourceTreeNode } from '../components/publish/ResourceTree';

type DriveRecord = {
  driveKey: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
  totalSize: number;
  publicationCount: number;
  isLocal: boolean;
};

type MountResult = {
  publication: {
    id: string;
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatDate(value: number) {
  return dateFormatter.format(value).replace(/\//g, '-');
}

function formatBytes(size: number) {
  if (size <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const digits = current >= 100 || unitIndex === 0 ? 0 : 1;
  return `${current.toFixed(digits)} ${units[unitIndex]}`;
}

async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers,
    ...init,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? '请求失败。');
  }

  return payload as T;
}

const Navbar = () => {
  return (
    <div className="h-[64px] w-full p-2.5 flex shrink-0">
      <div className="flex-1 bg-[#27272a] rounded-lg flex items-center justify-between px-6 border border-white/[0.03]">
        <div className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <span className="bg-linear-to-br from-white to-white/60 bg-clip-text text-transparent">Cinereel</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="size-8 rounded-full bg-[#3f3f46] border border-white/10 overflow-hidden shadow-xl ring-2 ring-white/5">
            <img
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
              alt="Avatar"
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <SearchBar />
        </div>
      </div>
    </div>
  );
};

const PublishPage = () => {
  const [drives, setDrives] = useState<DriveRecord[]>([]);
  const [selectedDriveKey, setSelectedDriveKey] = useState<string | null>(null);
  const [resourceTree, setResourceTree] = useState<ResourceTreeNode | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedDriveKey, setCopiedDriveKey] = useState<string | null>(null);
  const treeRequestIdRef = useRef(0);
  const deletingDriveKeyRef = useRef<string | null>(null);
  const deletedDriveKeysRef = useRef(new Set<string>());

  const localDrives = drives.filter((item) => item.isLocal);
  const selectedDrive = localDrives.find((item) => item.driveKey === selectedDriveKey) ?? localDrives[0] ?? null;
  const hasSelectedDrive = selectedDriveKey
    ? drives.some((item) => item.isLocal && item.driveKey === selectedDriveKey)
    : false;

  const loadDrives = async (preferredDriveKey?: string) => {
    setListLoading(true);

    try {
      const response = await requestJson<{ data: DriveRecord[] }>('/api/drives');
      const nextLocalDrives = response.data.filter((item) => item.isLocal);
      setDrives(nextLocalDrives);
      setSelectedDriveKey((currentId) => {
        if (preferredDriveKey && nextLocalDrives.some((item) => item.driveKey === preferredDriveKey)) {
          return preferredDriveKey;
        }

        if (currentId && nextLocalDrives.some((item) => item.driveKey === currentId)) {
          return currentId;
        }

        return nextLocalDrives[0]?.driveKey ?? null;
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Drive 列表加载失败。');
    } finally {
      setListLoading(false);
    }
  };

  const loadTree = async (driveKey: string) => {
    const requestId = ++treeRequestIdRef.current;
    setTreeLoading(true);
    setResourceTree(null);

    try {
      const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/tree`);

      if (treeRequestIdRef.current !== requestId) {
        return;
      }

      setResourceTree(response.data);
      setError(null);
    } catch (treeError) {
      if (treeRequestIdRef.current !== requestId) {
        return;
      }

      const message = treeError instanceof Error ? treeError.message : '资源树加载失败。';

      if (
        message === '找不到对应的 Drive。'
        && (deletingDriveKeyRef.current === driveKey || deletedDriveKeysRef.current.has(driveKey))
      ) {
        setResourceTree(null);
        setError(null);
        return;
      }

      setResourceTree(null);
      setError(message);
    } finally {
      if (treeRequestIdRef.current === requestId) {
        setTreeLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadDrives();
  }, []);

  useEffect(() => {
    if (!selectedDriveKey) {
      treeRequestIdRef.current += 1;
      setResourceTree(null);
      return;
    }

    if (!hasSelectedDrive) {
      treeRequestIdRef.current += 1;
      setResourceTree(null);
      return;
    }

    void loadTree(selectedDriveKey);
  }, [drives, hasSelectedDrive, selectedDriveKey]);

  const handlePublish = async () => {
    if (!selectedDriveKey) {
      setError('请先新建并选择一个 Drive。');
      return;
    }

    const nextTargetPath = window.prompt('输入要发布的本地路径', '')?.trim();

    if (nextTargetPath === undefined) {
      return;
    }

    if (!nextTargetPath) {
      setError('请输入要发布的本地路径。');
      return;
    }

    const inferredName = nextTargetPath.split(/[\\/]/).filter(Boolean).pop() ?? '';
    const nextDisplayName = window.prompt('输入资源名称（可选）', inferredName)?.trim();

    if (nextDisplayName === undefined) {
      return;
    }

    setSubmitting(true);

    try {
      await requestJson<{ data: MountResult }>('/api/mount', {
        method: 'POST',
        body: JSON.stringify({
          driveKey: selectedDriveKey,
          targetPath: nextTargetPath,
          displayName: nextDisplayName || undefined,
        }),
      });

      await loadDrives(selectedDriveKey ?? undefined);
      if (selectedDriveKey) {
        await loadTree(selectedDriveKey);
      }
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '发布失败。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDrive) {
      return;
    }

    const deletedDriveKey = selectedDrive.driveKey;
    const fallbackDriveKey = localDrives.find((drive) => drive.driveKey !== deletedDriveKey)?.driveKey ?? null;

    setDeleting(true);
    deletingDriveKeyRef.current = deletedDriveKey;

    try {
      await requestJson(`/api/drives/${selectedDrive.driveKey}`, {
        method: 'DELETE',
      });

      treeRequestIdRef.current += 1;
      deletedDriveKeysRef.current.add(deletedDriveKey);
      setDrives((current) => current.filter((drive) => drive.driveKey !== deletedDriveKey));
      setResourceTree(null);
      setSelectedDriveKey(fallbackDriveKey);
      await loadDrives(fallbackDriveKey ?? undefined);
      setError(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除 Drive 失败。');
    } finally {
      deletingDriveKeyRef.current = null;
      setDeleting(false);
    }
  };

  const handleRefresh = async () => {
    await loadDrives(selectedDriveKey ?? undefined);

    if (selectedDriveKey) {
      await loadTree(selectedDriveKey);
    }
  };

  const handleCreateDrive = async () => {
    const nextLabel = window.prompt('输入新 Drive 名称', `我的 Drive ${localDrives.length + 1}`)?.trim();

    if (nextLabel === undefined) {
      return;
    }

    if (!nextLabel) {
      setError('Drive 名称不能为空。');
      return;
    }

    setCreating(true);

    try {
      const response = await requestJson<{ data: DriveRecord }>('/api/drives', {
        method: 'POST',
        body: JSON.stringify({
          label: nextLabel,
        }),
      });

      await loadDrives(response.data.driveKey);
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '新建订阅源失败。');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyDriveKey = async (drive: DriveRecord) => {
    try {
      await navigator.clipboard.writeText(drive.driveKey);
      setCopiedDriveKey(drive.driveKey);
      setError(null);
      window.setTimeout(() => {
        setCopiedDriveKey((current) => (current === drive.driveKey ? null : current));
      }, 1600);
    } catch {
      setError('复制 publish hashcode 失败。');
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#18181b] overflow-hidden">
      <Navbar />

      <div className="flex-1 flex w-full min-h-0">
        <aside className="w-[227px] border-r border-[#27272a] flex flex-col p-4 shrink-0 overflow-y-auto">
          <div className="space-y-5">
            <SidebarItem icon={<IconDashboard />} label="仪表盘" />

            <div className="space-y-3">
              <SidebarSection label="资料库" />
              <div className="space-y-0.5">
                <SidebarItem icon={<IconMovie />} label="电影" />
                <SidebarItem icon={<IconTv />} label="剧集" />
                <SidebarItem icon={<IconMusic />} label="音乐" />
              </div>
            </div>

            <SidebarLine />

            <div className="space-y-3">
              <SidebarSection label="管理" />
              <div className="space-y-0.5">
                <SidebarItem icon={<IconDownload />} label="下载" />
                <SidebarItem icon={<IconMark />} label="订阅" />
                <SidebarItem
                  icon={<IconUpload className="text-[#f59e0b]" />}
                  label="发布"
                  active
                  color="#f59e0b"
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="h-[43px] border-b border-[#27272a] flex items-center justify-between px-5 shrink-0 bg-[#18181b]">
            <span className="text-[14px] font-bold text-[#e4e4e7]">发布管理</span>
            <button
              onClick={() => void handleCreateDrive()}
              disabled={creating}
              className="flex items-center gap-2 h-7 px-3 bg-[#c47e09] rounded text-[11px] font-bold text-white hover:bg-[#d48e19] transition-all active:scale-95 shadow-[0_0_15px_rgba(196,126,9,0.2)]"
            >
              <IconPlus className="size-3.5" />
              {creating ? '新建中...' : '新建订阅源'}
            </button>
          </div>

          <div className="flex-1 flex min-w-0 overflow-hidden">
            <div className="w-[219px] border-r border-[#27272a] flex flex-col shrink-0 pt-6">
              <div className="flex items-center justify-between px-4 h-9 shrink-0">
                <span className="text-[11px] font-bold text-[#52525c] tracking-widest uppercase">订阅源</span>
                <span className="text-[11px] text-[#3f3f46]">{localDrives.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {listLoading ? (
                  <div className="px-4 py-4 text-xs text-[#52525c]">加载中...</div>
                ) : localDrives.length ? (
                  localDrives.map((drive) => (
                    <PublishedKeyItem
                      key={drive.driveKey}
                      active={drive.driveKey === selectedDriveKey}
                      title={drive.label}
                      titleSuffix={copiedDriveKey === drive.driveKey ? '已复制' : undefined}
                      date={formatDate(drive.updatedAt || drive.createdAt || Date.now())}
                      size={formatBytes(drive.totalSize)}
                      peerNumber={String(drive.publicationCount)}
                      onClick={() => setSelectedDriveKey(drive.driveKey)}
                      onTitleClick={drive.isLocal ? () => void handleCopyDriveKey(drive) : undefined}
                    />
                  ))
                ) : (
                  <div className="px-4 py-4 text-xs text-[#52525c]">还没有 Drive，点击上方新建订阅源</div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 bg-[#18181b]">
              {error ? (
                <div className="px-4 py-2 text-xs text-[#f87171] border-b border-[#27272a]">{error}</div>
              ) : null}

              <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#27272a] shrink-0">
                {selectedDrive ? (
                  <>
                    <div className="flex flex-wrap items-center gap-y-2 gap-x-6">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[#00bc7d] text-[10px] font-bold uppercase tracking-wider">正常</span>
                          <span className="text-[12px] text-[#f5f5f5] font-semibold">{selectedDrive.label}</span>
                        </div>
                        <div className="h-3 w-px bg-white/5" />
                        <div className="flex items-center gap-4 text-[11px]">
                          <div className="flex items-center gap-1.5 text-[#52525c]">
                            <span className="uppercase text-[9px] tracking-widest font-bold opacity-50">路径</span>
                            <span className="text-[#a1a1aa] font-medium">{selectedDrive.label === '我的电影合集' ? '/Movies/Collection' : '/Local/Path'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[#52525c]">
                            <span className="uppercase text-[9px] tracking-widest font-bold opacity-50">大小</span>
                            <span className="text-[#a1a1aa] font-medium">{formatBytes(selectedDrive.totalSize)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[#52525c]">
                            <span className="uppercase text-[9px] tracking-widest font-bold opacity-50">日期</span>
                            <span className="text-[#a1a1aa] font-medium">{formatDate(selectedDrive.updatedAt || selectedDrive.createdAt || Date.now())}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleDelete()}
                        disabled={deleting}
                        className="px-3 h-7 bg-white/3 border border-white/10 rounded text-[#f87171] text-[11px] font-bold hover:bg-[#f87171]/10 hover:border-[#f87171]/20 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deleting ? '...' : '删除'}
                      </button>
                      <button
                        onClick={() => void handlePublish()}
                        disabled={submitting}
                        className="flex items-center gap-2 h-7 px-3 bg-[#c47e09] rounded text-[11px] font-bold text-white hover:bg-[#d48e19] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(196,126,9,0.24)]"
                      >
                        <IconUpload className="size-3.5" />
                        {submitting ? '进行中' : '挂载'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-[#52525c] text-[11px]">还没有 Drive，先新建一个</div>
                )}
              </div>

              <div className="h-[43px] border-b border-[#27272a] flex items-center justify-between px-4 shrink-0">
                <span className="text-[11px] font-normal text-[#71717b] tracking-[0.5px] uppercase">资源树</span>
                <button
                  onClick={() => void handleRefresh()}
                  className="size-[22px] flex items-center justify-center rounded hover:bg-white/5 group"
                >
                  <IconRefresh className={`size-3.5 transition-colors ${treeLoading || listLoading ? 'text-white' : 'text-[#52525c] group-hover:text-white'}`} />
                </button>
              </div>

            <div className="flex-1 min-h-0">
              <ResourceTree key={selectedDriveKey ?? 'empty'} root={resourceTree} />
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublishPage;
