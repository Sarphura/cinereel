import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { addToast } from '@heroui/toast';
import { listMountJobs, listScanJobs } from '../api';
import { listDownloadJobs } from '../../downloads/api';
import { IconHeartbeatRing } from '../../../components/icons/Icons';

export const TaskPanel = () => {
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const taskPanelRef = useRef<HTMLDivElement | null>(null);
  const previousJobStatesRef = useRef<Record<string, string>>({});
  const previousMountJobStatesRef = useRef<Record<string, string>>({});
  const previousScanJobStatesRef = useRef<Record<string, string>>({});
  const queryClient = useQueryClient();
  const router = useRouter();

  const downloadJobsQuery = useQuery({
    queryKey: ['download-jobs'],
    queryFn: listDownloadJobs,
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const hasActive = jobs.some(
        (job) => job.status === 'queued' || job.status === 'downloading',
      );
      return hasActive ? 1000 : false;
    },
  });
  const mountJobsQuery = useQuery({
    queryKey: ['mount-jobs'],
    queryFn: listMountJobs,
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const hasActive = jobs.some(
        (job) => job.status === 'queued' || job.status === 'mounting',
      );
      return hasActive ? 1000 : false;
    },
  });
  const scanJobsQuery = useQuery({
    queryKey: ['scan-jobs'],
    queryFn: listScanJobs,
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const hasActive = jobs.some(
        (job) => job.status === 'queued' || job.status === 'scanning',
      );
      return hasActive ? 1000 : false;
    },
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
  const activeScanTasks = (scanJobsQuery.data ?? []).filter((job) => (
    job.status === 'queued' || job.status === 'scanning'
  ));
  const failedScanTasks = (scanJobsQuery.data ?? []).filter((job) => job.status === 'failed');

  const taskItems: Array<{
    id: string;
    title: string;
    subtitle: string;
    progress: number;
    tone?: 'default' | 'failed';
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
    ...activeScanTasks.map((task) => ({
      id: `scan-${task.id}`,
      title: `扫描任务：${task.rootPath.split('/').filter(Boolean).pop() ?? task.rootPath}`,
      subtitle: task.currentFilePath
        ? `检测中：${task.currentFilePath}`
        : task.status === 'queued'
          ? '等待开始'
          : `文件 ${task.processedFiles}/${task.totalFiles || 0}`,
      progress: task.progress,
    })),
    ...failedScanTasks.map((task) => ({
      id: `scan-failed-${task.id}`,
      title: `扫描失败：${task.rootPath.split('/').filter(Boolean).pop() ?? task.rootPath}`,
      subtitle: task.failedFiles.length > 0
        ? `失败 ${task.failedFiles.length} 个，首个：${task.failedFiles[0].fileName}`
        : (task.error ?? '扫描失败'),
      progress: 1,
      tone: 'failed',
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
      await queryClient.refetchQueries({ queryKey: ['drives', 'subscribed'], exact: true });
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

  useEffect(() => {
    const jobs = scanJobsQuery.data ?? [];
    const previousJobStates = previousScanJobStatesRef.current;
    const hasCompletedTransition = jobs.some((job) => {
      const previousStatus = previousJobStates[job.id];
      return (
        (previousStatus === 'queued' || previousStatus === 'scanning')
        && (job.status === 'completed' || job.status === 'failed')
      );
    });

    previousScanJobStatesRef.current = jobs.reduce<Record<string, string>>((accumulator, job) => {
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
  }, [scanJobsQuery.data, queryClient, router]);

  return (
    <div ref={taskPanelRef} className="relative flex items-center gap-2">
      <button
        type="button"
        aria-label="触发 toast 测试"
        onClick={() => {
          addToast({
            title: 'Toast Test',
            description: '这是一个无业务的默认样式测试提示。',
            timeout: 4000,
          });
        }}
        className="inline-flex h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/8"
      >
        Toast Test
      </button>
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
                      stroke={task.tone === 'failed' ? '#f87171' : '#f2a41b'}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.max(0, Math.min(task.progress, 1)) * 75.4} 75.4`}
                    />
                  </svg>
                  <span className={`absolute text-[9px] font-medium ${task.tone === 'failed' ? 'text-[#f87171]' : 'text-[#f2a41b]'}`}>
                    {Math.round(task.progress * 100)}
                  </span>
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
