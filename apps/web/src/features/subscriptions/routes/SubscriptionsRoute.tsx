import React, { useState } from 'react';
import { addToast } from '@heroui/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { IconDownload, IconEye, IconPencil, IconPlus, IconTrash } from '../../../components/icons/Icons';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu';
import { Dialog } from '../../../components/ui/Dialog';
import { FormDialog } from '../../../components/ui/FormDialog';
import { ExplorerDetailHeader, ExplorerPage, ExplorerPanel } from '../../../shared/components/explorer/ExplorerChrome';
import { DriveListSidebar } from '../../drive/components/DriveListSidebar';
import { DriveRemarkDialog, type DriveRemarkEditorState } from '../../drive/components/DriveRemarkDialog';
import { DriveSummaryHeader } from '../../drive/components/DriveSummaryHeader';
import { useDriveSearchSync } from '../../drive/hooks/useDriveSearchSync';
import { subscribeDriveTreeQueryOptions, subscribeDrivesQueryOptions, addSubscribe, deleteSubscribe, saveSubscribeRemark } from '../api';
import { createDownloadJob, removeDownloadedResource } from '../../downloads/api';
import { useDrivePreview } from '../../drive/hooks/useDrivePreview';
import type { DriveRecord, ResourceTreeNode } from '../../drive/types';
import { getPreviewKind, isDriveNodeDownloadable, requiresStreamingVideoPreview } from '../../drive/utils';
import { SubscriptionDriveExplorer } from '../explorer/SubscriptionDriveExplorer';

const routeApi = getRouteApi('/subscribe');

export function SubscriptionsRoute() {
  const search = routeApi.useSearch();
  const { drives, selectedDriveKey, resourceTree, error: loaderError } = routeApi.useLoaderData();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savingRemark, setSavingRemark] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remarkEditor, setRemarkEditor] = useState<DriveRemarkEditorState | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [subscribeDriveKey, setSubscribeDriveKey] = useState('');
  const [downloadTargetDir, setDownloadTargetDir] = useState('');
  const [pendingDownload, setPendingDownload] = useState<{ resourcePath: string; targetName?: string } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{ drive: DriveRecord; x: number; y: number } | null>(null);
  const [resourceMenuState, setResourceMenuState] = useState<{ node: ResourceTreeNode; x: number; y: number } | null>(null);
  const selectedDrive = drives.find((drive) => drive.driveKey === selectedDriveKey) ?? null;
  const preview = useDrivePreview(selectedDriveKey);
  const { router, setDriveKey, replaceAndInvalidate } = useDriveSearchSync('/subscribe', selectedDriveKey, search.driveKey);
  const queryClient = useQueryClient();

  const invalidateSubscribeData = async (driveKey?: string | null) => {
    await queryClient.invalidateQueries({ queryKey: subscribeDrivesQueryOptions().queryKey });
    await queryClient.refetchQueries({ queryKey: subscribeDrivesQueryOptions().queryKey, exact: true });
    if (driveKey) {
      await queryClient.invalidateQueries({ queryKey: subscribeDriveTreeQueryOptions(driveKey).queryKey });
      await queryClient.refetchQueries({ queryKey: subscribeDriveTreeQueryOptions(driveKey).queryKey, exact: true });
    }
    await router.invalidate();
  };

  const addSubscribeMutation = useMutation({
    mutationFn: addSubscribe,
    onSuccess: async (result) => {
      const nextDrive: DriveRecord = {
        driveKey: result.driveKey,
        name: result.name?.trim() || `Drive ${result.driveKey.slice(0, 8)}`,
        type: result.type,
        createdAt: result.createdAt,
        updatedAt: result.createdAt,
        fileCount: 0,
        totalSize: 0,
        publicationCount: 0,
        peerCount: 1,
        isLocal: false,
        ownerProfileKey: result.ownerProfileKey,
      };

      queryClient.setQueryData<DriveRecord[]>(subscribeDrivesQueryOptions().queryKey, (current) => {
        const nextDrives = current ?? drives;

        if (nextDrives.some((item) => item.driveKey === nextDrive.driveKey)) {
          return nextDrives.map((item) => (item.driveKey === nextDrive.driveKey ? { ...item, ...nextDrive } : item));
        }

        return [nextDrive, ...nextDrives];
      });

      await replaceAndInvalidate(result.driveKey);
      await queryClient.refetchQueries({ queryKey: subscribeDrivesQueryOptions().queryKey, exact: true });
      setShowAddDialog(false);
      setSubscribeDriveKey('');
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : '添加订阅失败。');
    },
  });

  const deleteSubscribeMutation = useMutation({
    mutationFn: deleteSubscribe,
    onSuccess: async (_, deletedDriveKey) => {
      const currentDrives = queryClient.getQueryData<DriveRecord[]>(subscribeDrivesQueryOptions().queryKey) ?? drives;
      const nextDrives = currentDrives.filter((drive) => drive.driveKey !== deletedDriveKey);
      const currentIndex = currentDrives.findIndex((drive) => drive.driveKey === deletedDriveKey);
      const fallback = nextDrives[currentIndex] ?? nextDrives[currentIndex - 1] ?? null;

      queryClient.setQueryData(subscribeDrivesQueryOptions().queryKey, nextDrives);
      await queryClient.removeQueries({ queryKey: subscribeDriveTreeQueryOptions(deletedDriveKey).queryKey });
      preview.closePreview();
      await replaceAndInvalidate(fallback?.driveKey ?? null);
      setShowDeleteDialog(false);
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : '删除订阅失败。');
    },
  });

  const saveRemarkMutation = useMutation({
    mutationFn: ({ driveKey, remark }: { driveKey: string; remark: string }) => saveSubscribeRemark(driveKey, remark),
    onSuccess: async (_, variables) => {
      await invalidateSubscribeData(variables.driveKey);
      setRemarkEditor(null);
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : '保存订阅备注失败。');
    },
  });

  const downloadMutation = useMutation({
    mutationFn: createDownloadJob,
    onSuccess: async (job, variables) => {
      await invalidateSubscribeData(variables.driveKey);
      await queryClient.invalidateQueries({ queryKey: ['download-jobs'] });
      setPendingDownload(null);
      setDownloadTargetDir('');
      addToast({
        title: '下载已开始',
        description: `下载任务已加入队列：${job.fileName}`,
        timeout: 4000,
      });
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : '创建下载任务失败。');
    },
  });

  const removeDownloadMutation = useMutation({
    mutationFn: removeDownloadedResource,
    onSuccess: async (_, variables) => {
      await invalidateSubscribeData(variables.driveKey);
      await queryClient.invalidateQueries({ queryKey: ['download-jobs'] });

      if (
        preview.preview
        && preview.preview.driveKey === variables.driveKey
        && (preview.preview.resourcePath === variables.resourcePath
          || preview.preview.resourcePath.startsWith(`${variables.resourcePath.replace(/\/+$/, '')}/`))
      ) {
        preview.closePreview();
      }

      addToast({
        title: '已移除下载',
        description: `已删除本地文件：${resourceMenuState?.node.name ?? variables.resourcePath}`,
        color: 'default',
        timeout: 3200,
      });
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : '移除下载资源失败。');
    },
  });

  const handleSelectDrive = (driveKey: string) => {
    setDriveKey(driveKey);
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await router.invalidate();
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '刷新失败。');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddSubscribe = async () => {
    const nextKey = subscribeDriveKey.trim();

    if (!nextKey) {
      setDialogError('Key 不能为空。');
      return;
    }

    setCreating(true);

    try {
      await addSubscribeMutation.mutateAsync({ driveKey: nextKey });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSubscribe = async () => {
    if (!selectedDrive) {
      setError('请先选择一个订阅。');
      return;
    }

    setDeleting(true);

    try {
      await deleteSubscribeMutation.mutateAsync(selectedDrive.driveKey);
    } finally {
      setDeleting(false);
    }
  };

  const openRemarkEditor = (drive: DriveRecord) => {
    setRemarkEditor({
      driveKey: drive.driveKey,
      label: drive.name,
      remark: drive.remark ?? '',
    });
  };

  const openDeleteDialog = (drive: DriveRecord) => {
    setDriveKey(drive.driveKey);
    setDialogError(null);
    setShowDeleteDialog(true);
  };

  const handleRemoveDownloadedResource = async (node: ResourceTreeNode) => {
    if (!selectedDrive) {
      setError('请先选择一个订阅。');
      return;
    }

    await removeDownloadMutation.mutateAsync({
      driveKey: selectedDrive.driveKey,
      resourcePath: node.path,
    });
  };

  const handleSaveRemark = async () => {
    if (!remarkEditor) {
      return;
    }

    setSavingRemark(true);

    try {
      await saveRemarkMutation.mutateAsync({ driveKey: remarkEditor.driveKey, remark: remarkEditor.remark });
    } finally {
      setSavingRemark(false);
    }
  };

  const startDownload = async (resourcePath: string, targetName?: string) => {
    if (!selectedDrive) {
      setError('请先选择一个订阅。');
      return;
    }
    const targetDir = downloadTargetDir.trim();

    if (!targetDir) {
      setDialogError('下载目录不能为空。');
      return;
    }

    setDownloading(true);

    try {
      await downloadMutation.mutateAsync({
        driveKey: selectedDrive.driveKey,
        resourcePath,
        targetDir,
        targetName,
      });
    } finally {
      setDownloading(false);
    }
  };

  const handlePreviewNode = (node: ResourceTreeNode) => {
    if (!selectedDrive) {
      setError('请先选择一个订阅源。');
      return;
    }

    const opened = preview.openPreview(selectedDrive.driveKey, node);

    if (!opened) {
      setError('当前文件暂不支持预览，或尚未下载到本地。');
      return;
    }

    setError(null);
  };

  const openDriveContextMenu = (drive: DriveRecord, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDriveKey(drive.driveKey);
    setContextMenuState({
      drive,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const contextMenuItems: ContextMenuItem[] = contextMenuState
    ? [
        {
          key: 'remark',
          label: '编辑备注',
          icon: <IconPencil className="size-3.5" />,
          onSelect: () => openRemarkEditor(contextMenuState.drive),
        },
        {
          key: 'delete',
          label: '取消订阅',
          icon: <IconTrash className="size-3.5" />,
          danger: true,
          onSelect: () => openDeleteDialog(contextMenuState.drive),
        },
      ]
    : [];

  const resourceMenuItems: ContextMenuItem[] = resourceMenuState
    ? [
        ...(resourceMenuState.node.localDirPath
          ? [{
              key: 'remove-download',
              label: '移除下载',
              icon: <IconTrash className="size-3.5" />,
              danger: true,
              onSelect: () => void handleRemoveDownloadedResource(resourceMenuState.node),
            } satisfies ContextMenuItem]
          : [{
              key: 'download',
              label: resourceMenuState.node.type === 'directory' ? '下载目录' : '下载文件',
              icon: <IconDownload className="size-3.5" />,
              onSelect: () => {
                setPendingDownload({ resourcePath: resourceMenuState.node.path, targetName: resourceMenuState.node.name });
                setDownloadTargetDir('');
                setDialogError(null);
              },
            } satisfies ContextMenuItem]),
        ...(resourceMenuState.node.type === 'file' && getPreviewKind(resourceMenuState.node) !== null
          ? [{
              key: 'preview',
              label: '预览',
              icon: <IconEye className="size-3.5" />,
              onSelect: () => handlePreviewNode(resourceMenuState.node),
            } satisfies ContextMenuItem]
          : []),
      ]
    : [];

  return (
    <ExplorerPage
      title="订阅"
      action={(
        <button
          onClick={() => {
            setShowAddDialog(true);
            setSubscribeDriveKey('');
            setDialogError(null);
          }}
          disabled={creating}
          className="flex items-center gap-2 h-7 px-3 bg-[#c47e09] rounded text-[11px] font-bold text-white hover:bg-[#d48e19] transition-all active:scale-95 shadow-[0_0_15px_rgba(196,126,9,0.2)] disabled:opacity-60"
        >
          <IconPlus className="size-3.5" />
          {creating ? '添加中...' : '添加订阅'}
        </button>
      )}
    >
      <div className="flex-1 flex min-w-0 overflow-hidden">
        {loaderError ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="flex h-full min-h-[240px] w-full items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/5 text-sm text-rose-200">
              {loaderError}
            </div>
          </div>
        ) : (
          <>
            <DriveListSidebar
              title="订阅"
              items={drives}
              selectedDriveKey={selectedDriveKey}
              emptyText="还没有订阅，点击上方添加。"
              onSelect={handleSelectDrive}
              getItemMeta={(drive) => ({
                title: drive.remark ?? drive.name,
                subtitle: drive.remark ? drive.name : undefined,
                subtitlePrefix: '',
                onContextMenu: (event) => openDriveContextMenu(drive, event),
              })}
            />

            <ExplorerPanel error={error}>
              <ExplorerDetailHeader emptyText="还没有订阅">
                {selectedDrive ? (
                  <>
                    <DriveSummaryHeader drive={selectedDrive} onEditRemark={() => openRemarkEditor(selectedDrive)} />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setPendingDownload({ resourcePath: '/', targetName: selectedDrive.name });
                          setDownloadTargetDir('');
                          setDialogError(null);
                        }}
                        disabled={downloading}
                        className="flex items-center gap-2 h-7 px-3 bg-[#27272a] border border-white/5 rounded text-[11px] font-bold text-white hover:bg-white/5 transition-all active:scale-95 disabled:opacity-60"
                      >
                        <IconDownload className="size-3.5" />
                        {downloading ? '下载中...' : '下载集合'}
                      </button>
                      <button
                        onClick={() => {
                          setDialogError(null);
                          setShowDeleteDialog(true);
                        }}
                        disabled={deleting}
                        className="flex items-center gap-2 h-7 px-3 bg-[#2b1919] border border-[#5f2222] rounded text-[11px] font-bold text-[#fca5a5] hover:bg-[#3a1f1f] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <IconTrash className="size-3.5" />
                        {deleting ? '处理中...' : '取消订阅'}
                      </button>
                    </div>
                  </>
                ) : null}
              </ExplorerDetailHeader>

              <SubscriptionDriveExplorer
                resourceTree={resourceTree}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                isDownloadable={isDriveNodeDownloadable}
                onDownloadNode={(node) => {
                  setPendingDownload({ resourcePath: node.path, targetName: node.name });
                  setDownloadTargetDir('');
                  setDialogError(null);
                }}
                onContextMenuNode={(event, node) => {
                  event.preventDefault();
                  setResourceMenuState({
                    node,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                onPreviewNode={handlePreviewNode}
                isPreviewableNode={(node) => getPreviewKind(node) !== null}
                preview={preview.preview}
                previewLabel={preview.previewLabel}
                previewLoadState={preview.previewLoadState}
                previewError={preview.previewError}
                onClosePreview={preview.closePreview}
                onPreviewError={(message) => {
                  preview.setPreviewLoadState('failed');
                  preview.setPreviewError(message);
                }}
                requiresStreamingPlayer={requiresStreamingVideoPreview}
              />
            </ExplorerPanel>
          </>
        )}
      </div>

      <DriveRemarkDialog
        remarkEditor={remarkEditor}
        saving={savingRemark}
        error={dialogError}
        onClose={() => setRemarkEditor(null)}
        onChange={(value) => {
          setRemarkEditor((current) => (current ? { ...current, remark: value } : current));
          setDialogError(null);
        }}
        onSubmit={() => void handleSaveRemark()}
      />
      <Dialog
        open={showAddDialog}
        title="添加订阅"
        description="输入远端 Drive 的 Hyperdrive Key，类型会从该 Drive 的 descriptor.json 自动读取。"
        onClose={creating ? () => undefined : () => {
          setShowAddDialog(false);
          setSubscribeDriveKey('');
        }}
        footer={(
          <>
            <button
              type="button"
              onClick={() => {
                setShowAddDialog(false);
                setSubscribeDriveKey('');
              }}
              disabled={creating}
              className="h-9 rounded-lg px-4 text-sm text-[#a1a1aa] transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleAddSubscribe()}
              disabled={creating}
              className="h-9 rounded-lg bg-[#c47e09] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#d48e19] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? '添加中...' : '添加'}
            </button>
          </>
        )}
      >
        <label className="block text-[11px] font-medium uppercase tracking-[0.5px] text-[#71717b]">Drive Key</label>
        <input
          autoFocus
          value={subscribeDriveKey}
          onChange={(event) => {
            setSubscribeDriveKey(event.target.value);
            setDialogError(null);
          }}
          placeholder="输入 Hyperdrive Key"
          className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#111114] px-3 text-sm text-[#f4f4f5] outline-none transition-colors placeholder:text-[#52525c] focus:border-[#c47e09]"
        />
        {dialogError ? <div className="mt-3 text-xs text-[#fca5a5]">{dialogError}</div> : null}
      </Dialog>
      <ConfirmDialog
        open={showDeleteDialog}
        title="取消订阅"
        description={selectedDrive ? `确定取消订阅“${selectedDrive.name}”吗？` : '确定取消当前订阅吗？'}
        confirmLabel="取消订阅"
        confirmingLabel="处理中..."
        disabled={deleting}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => void handleDeleteSubscribe()}
      />
      <FormDialog
        open={pendingDownload !== null}
        title="下载资源"
        description={selectedDrive ? `选择 ${selectedDrive.name} 的下载目录` : '输入下载目录路径'}
        label="下载目录"
        value={downloadTargetDir}
        placeholder="/path/to/downloads"
        submitLabel="开始下载"
        submittingLabel="下载中..."
        error={dialogError}
        disabled={downloading}
        onClose={() => {
          setPendingDownload(null);
          setDownloadTargetDir('');
        }}
        onChange={(value) => {
          setDownloadTargetDir(value);
          setDialogError(null);
        }}
        onSubmit={() => {
          if (pendingDownload) {
            void startDownload(pendingDownload.resourcePath, pendingDownload.targetName);
          }
        }}
      />
      <ContextMenu
        open={contextMenuState !== null}
        x={contextMenuState?.x ?? 0}
        y={contextMenuState?.y ?? 0}
        items={contextMenuItems}
        onClose={() => setContextMenuState(null)}
      />
      <ContextMenu
        open={resourceMenuState !== null}
        x={resourceMenuState?.x ?? 0}
        y={resourceMenuState?.y ?? 0}
        items={resourceMenuItems}
        onClose={() => setResourceMenuState(null)}
      />
    </ExplorerPage>
  );
}
