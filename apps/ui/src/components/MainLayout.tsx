import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import {
  SidebarItem,
  SidebarSection,
  SidebarLine
} from './publish/SidebarLayout';
import {
  IconDashboard,
  IconMovie,
  IconTv,
  IconMusic,
  IconDownload,
  IconMark,
  IconUpload,
  IconHeartbeatRing
} from './Icons';
import { getCurrentProfile, listDownloadJobs, listMountJobs } from '../features/drives/api';
import { SearchBar } from './publish/SearchComponents';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const Navbar = () => {
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const taskPanelRef = useRef<HTMLDivElement | null>(null);
  const previousJobStatesRef = useRef<Record<string, string>>({});
  const previousMountJobStatesRef = useRef<Record<string, string>>({});
  const queryClient = useQueryClient();
  const router = useRouter();
  const downloadJobsQuery = useQuery({
    queryKey: ['download-jobs'],
    queryFn: listDownloadJobs,
    refetchInterval: 1000,
  });
  const mountJobsQuery = useQuery({
    queryKey: ['mount-jobs'],
    queryFn: listMountJobs,
    refetchInterval: 1000,
  });
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getCurrentProfile,
  });

  useEffect(() => {
    if (!isTaskPanelOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!taskPanelRef.current?.contains(event.target as Node)) {
        setIsTaskPanelOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTaskPanelOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isTaskPanelOpen]);

  const activeTasks = (downloadJobsQuery.data ?? []).filter((job) => (
    job.status === 'queued' || job.status === 'downloading'
  ));
  const activeMountTasks = (mountJobsQuery.data ?? []).filter((job) => (
    job.status === 'queued' || job.status === 'mounting'
  ));

  const taskItems: Array<{
    id: string;
    title: string;
    subtitle: string;
    progress: number;
  }> = [
    ...activeMountTasks.map((task) => ({
      id: `mount-${task.id}`,
      title: `挂载任务：${task.targetPath.split(/[\\/]/).filter(Boolean).pop() ?? task.targetPath}`,
      subtitle: task.currentFilePath
        ? `处理中：${task.currentFilePath}`
        : task.status === 'queued'
          ? '等待开始'
          : `文件 ${task.processedFiles}/${task.totalFiles || 0}`,
      progress: task.progress,
    })),
    ...activeTasks.map((task) => ({
      id: `download-${task.id}`,
      title: `下载任务：${task.fileName}`,
      subtitle: `文件名：${task.currentFileName ?? (task.status === 'queued' ? '等待开始' : task.fileName)}`,
      progress: task.progress,
    })),
  ];

  useEffect(() => {
    const jobs = downloadJobsQuery.data ?? [];
    const previousJobStates = previousJobStatesRef.current;
    const hasCompletedTransition = jobs.some((job) => {
      const previousStatus = previousJobStates[job.id];
      return (
        (previousStatus === 'queued' || previousStatus === 'downloading')
        && (job.status === 'completed' || job.status === 'failed')
      );
    });

    previousJobStatesRef.current = jobs.reduce<Record<string, string>>((accumulator, job) => {
      accumulator[job.id] = job.status;
      return accumulator;
    }, {});

    if (!hasCompletedTransition) {
      return;
    }

    void (async () => {
      await queryClient.refetchQueries({ queryKey: ['drive-tree'] });
      await queryClient.refetchQueries({ queryKey: ['drives', 'subscription'], exact: true });
      await router.invalidate();
    })();
  }, [downloadJobsQuery.data, queryClient, router]);

  useEffect(() => {
    const jobs = mountJobsQuery.data ?? [];
    const previousJobStates = previousMountJobStatesRef.current;
    const hasCompletedTransition = jobs.some((job) => {
      const previousStatus = previousJobStates[job.id];
      return (
        (previousStatus === 'queued' || previousStatus === 'mounting')
        && (job.status === 'completed' || job.status === 'failed')
      );
    });

    previousMountJobStatesRef.current = jobs.reduce<Record<string, string>>((accumulator, job) => {
      accumulator[job.id] = job.status;
      return accumulator;
    }, {});

    if (!hasCompletedTransition) {
      return;
    }

    void (async () => {
      await queryClient.refetchQueries({ queryKey: ['drive-tree'] });
      await queryClient.refetchQueries({ queryKey: ['drives', 'local'], exact: true });
      await router.invalidate();
    })();
  }, [mountJobsQuery.data, queryClient, router]);

  return (
    <div className="h-[64px] w-full p-2.5 flex shrink-0">
      <div className="flex-1 bg-[#27272a] rounded-lg flex items-center justify-between px-6 border border-white/[0.03]">
        <Link to="/publish" search={{ driveKey: undefined }} className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <span className="bg-linear-to-br from-white to-white/60 bg-clip-text text-transparent">Cinereel</span>
        </Link>

        <div className="flex items-center gap-4">
          <div ref={taskPanelRef} className="relative flex items-center gap-2">
            <button
              type="button"
              aria-label={isTaskPanelOpen ? '关闭任务面板' : '打开任务面板'}
              aria-expanded={isTaskPanelOpen}
              onClick={() => setIsTaskPanelOpen((open) => !open)}
              className={`group relative flex size-9 items-center justify-center rounded-full border transition-all duration-200 ${
                isTaskPanelOpen
                  ? 'border-[#f59e0b]/50 bg-[#f59e0b]/12 text-[#fbbf24] shadow-[0_0_20px_rgba(245,158,11,0.18)]'
                  : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:border-emerald-300/40 hover:bg-emerald-300/12'
              }`}
            >
              <span className="absolute inset-0 rounded-full border border-current/25 animate-ping opacity-75" />
              <span className="absolute inset-[5px] rounded-full border border-current/20" />
              <IconHeartbeatRing className="relative z-10 size-[18px]" />
            </button>

            {isTaskPanelOpen ? (
              <div className="absolute right-0 top-[calc(100%+12px)] z-30 w-[276px] rounded-[4px] border border-black/40 bg-[#20262a] px-3 py-2.5 shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
                <div className="mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Cinereel</p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <p className="text-[13px] font-semibold tracking-tight text-zinc-100">面板</p>
                    <span className="text-[16px] font-semibold text-[#f2a41b]">{taskItems.length}</span>
                  </div>
                </div>

                {taskItems.length === 0 ? (
                  <div className="py-4 text-[11px] text-zinc-400">
                    暂时没有进行中的任务
                  </div>
                ) : (
                  <div className="space-y-3">
                  {taskItems.map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold leading-5 text-zinc-400">
                          {task.title}
                        </p>
                        <p className="truncate text-[11px] leading-5 text-zinc-500">
                          {task.subtitle}
                        </p>
                      </div>
                      <div className="relative flex size-8 shrink-0 items-center justify-center">
                        <svg className="-rotate-90" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
                          <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                          <circle
                            cx="16"
                            cy="16"
                            r="12"
                            fill="none"
                            stroke="#f2a41b"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={`${Math.max(0, Math.min(task.progress, 1)) * 75.4} 75.4`}
                          />
                        </svg>
                        <span className="absolute text-[9px] font-medium text-[#f2a41b]">
                          {Math.round(task.progress * 100)}
                        </span>
                      </div>
                    </div>
                  ))}
                  </div>
                )}
              </div>
            ) : null}

            <Link
              to="/profile"
              aria-label={`打开${profileQuery.data?.name ?? '个人'}信息`}
              className="size-8 rounded-full bg-[#3f3f46] border border-white/10 overflow-hidden shadow-xl ring-2 ring-white/5 transition hover:ring-[#f59e0b]/40"
            >
              {profileQuery.data?.avatarUrl ? (
                <img
                  src={profileQuery.data.avatarUrl}
                  alt={profileQuery.data.name}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-[#f59e0b] to-[#fb7185] text-[11px] font-semibold text-white">
                  {(profileQuery.data?.name ?? '我').slice(0, 1)}
                </div>
              )}
            </Link>
          </div>
          <SearchBar />
        </div>
      </div>
    </div>
  );
};

export const Sidebar = () => {
  return (
    <aside className="w-[227px] border-r border-[#27272a] flex flex-col p-4 shrink-0 overflow-y-auto">
      <div className="space-y-5">
        <SidebarItem 
            icon={<IconDashboard />} 
            label="仪表盘" 
            to="/dashboard"
        />

        <div className="space-y-3">
          <SidebarSection label="资料库" />
          <div className="space-y-0.5">
            <SidebarItem 
                icon={<IconMovie />} 
                label="电影" 
                to="/movies"
            />
            <SidebarItem 
                icon={<IconTv />} 
                label="剧集" 
                to="/series"
            />
            <SidebarItem 
                icon={<IconMusic />} 
                label="音乐" 
                to="/music"
            />
          </div>
        </div>

        <SidebarLine />

        <div className="space-y-3">
          <SidebarSection label="管理" />
          <div className="space-y-0.5">
            <SidebarItem 
                icon={<IconDownload />} 
                label="下载" 
                to="/downloads"
            />
            <SidebarItem 
                icon={<IconMark />} 
                activeIcon={<IconMark className="text-[#f59e0b]" />}
                label="订阅" 
                color="#f59e0b"
                to="/subscriptions"
                search={{ driveKey: undefined }}
            />
            <SidebarItem
              icon={<IconUpload />}
              activeIcon={<IconUpload className="text-[#f59e0b]" />}
              label="发布"
              color="#f59e0b"
              to="/publish"
              search={{ driveKey: undefined }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
};

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen w-full bg-[#18181b] overflow-hidden">
      <Navbar />

      <div className="flex-1 flex w-full min-h-0">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};
