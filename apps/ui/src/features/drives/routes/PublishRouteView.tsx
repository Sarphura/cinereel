import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { IconPencil, IconPlus, IconTrash, IconUpload } from '../../../components/Icons';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { FormDialog } from '../../../components/ui/FormDialog';
import { ContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu';
import { ExplorerDetailHeader, ExplorerPage, ExplorerPanel } from '../components/DriveExplorerChrome';
import { DriveListSidebar } from '../components/DriveListSidebar';
import { DriveRemarkDialog, type DriveRemarkEditorState } from '../components/DriveRemarkDialog';
import { DriveResourceSection } from '../components/DriveResourceSection';
import { DriveSummaryHeader } from '../components/DriveSummaryHeader';
import { useDriveSearchSync } from '../hooks';
import { createLocalDrive, deleteDrive, driveTreeQueryOptions, drivesQueryOptions, mountDrive, renameDrive, saveOwnedDriveRemark } from '../api';
import { useDrivePreview } from '../preview';
import type { DriveRecord, ResourceTreeNode } from '../types';
import { getPreviewKind } from '../utils';

const routeApi = getRouteApi('/publish');

export function PublishRoutePending() {
  return (
    <ExplorerPage
      title="发布管理"
      action={(
        <div className="h-7 w-24 rounded bg-white/6" />
      )}
    >
      <div className="flex flex-1 min-w-0 overflow-hidden animate-pulse">
        <div className="w-[219px] shrink-0 border-r border-[#27272a] pt-6">
          <div className="flex h-9 items-center justify-between px-4">
            <div className="h-3 w-14 rounded bg-white/6" />
            <div className="h-3 w-4 rounded bg-white/6" />
          </div>
          <div className="space-y-3 px-4 py-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-3">
                <div className="h-3 w-24 rounded bg-white/7" />
                <div className="mt-2 h-3 w-16 rounded bg-white/5" />
                <div className="mt-3 h-2 w-full rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>

        <ExplorerPanel>
          <ExplorerDetailHeader emptyText="正在加载 Drive..." />
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0">
              <div className="flex h-[43px] items-center justify-between border-b border-[#27272a] px-4">
                <div className="h-3 w-16 rounded bg-white/6" />
                <div className="flex items-center gap-2">
                  <div className="h-5 w-8 rounded bg-white/6" />
                  <div className="h-5 w-8 rounded bg-white/6" />
                  <div className="h-5 w-5 rounded bg-white/6" />
                </div>
              </div>
              <div className="px-4 py-4">
                <div className="overflow-hidden rounded-xl border border-[#27272a]">
                  <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_160px_120px_80px] border-b border-[#27272a] bg-[#1c1c1f]">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="px-3 py-2">
                        <div className="h-3 w-12 rounded bg-white/6" />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3 px-3 py-3">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_160px_120px_80px] gap-3">
                        <div className="h-4 rounded bg-white/5" />
                        <div className="h-4 rounded bg-white/5" />
                        <div className="h-4 rounded bg-white/5" />
                        <div className="h-4 rounded bg-white/5" />
                        <div className="h-4 rounded bg-white/5" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ExplorerPanel>
      </div>
    </ExplorerPage>
  );
}

export function PublishRouteView() {
  const search = routeApi.useSearch();
  const { drives, selectedDriveKey, resourceTree } = routeApi.useLoaderData();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingRemark, setSavingRemark] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remarkEditor, setRemarkEditor] = useState<DriveRemarkEditorState | null>(null);
  const [createLabel, setCreateLabel] = useState(`我的 Drive ${drives.length + 1}`);
  const [renameLabel, setRenameLabel] = useState('');
  const [mountPath, setMountPath] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showMountDialog, setShowMountDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{ drive: DriveRecord; x: number; y: number } | null>(null);
  const selectedDrive = drives.find((drive) => drive.driveKey === selectedDriveKey) ?? null;
  const preview = useDrivePreview(selectedDriveKey);
  const { router, setDriveKey, replaceAndInvalidate } = useDriveSearchSync('/publish', selectedDriveKey, search.driveKey);
  const queryClient = useQueryClient();

  const invalidatePublishData = async (driveKey?: string | null) => {
    await queryClient.invalidateQueries({ queryKey: drivesQueryOptions('local').queryKey });
    await queryClient.refetchQueries({ queryKey: drivesQueryOptions('local').queryKey, exact: true });
    if (driveKey) {
      await queryClient.invalidateQueries({ queryKey: driveTreeQueryOptions(driveKey).queryKey });
      await queryClient.refetchQueries({ queryKey: driveTreeQueryOptions(driveKey).queryKey, exact: true });
    }
    await router.invalidate();
  };

  const createDriveMutation = useMutation({
    mutationFn: createLocalDrive,
    onSuccess: async (drive) => {
      queryClient.setQueryData<DriveRecord[]>(drivesQueryOptions('local').queryKey, (current) => {
        const nextDrives = current ?? drives;

        if (nextDrives.some((item) => item.driveKey === drive.driveKey)) {
          return nextDrives.map((item) => (item.driveKey === drive.driveKey ? drive : item));
        }

        return [drive, ...nextDrives];
      });

      await replaceAndInvalidate(drive.driveKey);
      await queryClient.refetchQueries({ queryKey: drivesQueryOptions('local').queryKey, exact: true });
      setShowCreateDialog(false);
      setCreateLabel(`我的 Drive ${drives.length + 2}`);
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : '新建订阅源失败。');
    },
  });

  const renameDriveMutation = useMutation({
    mutationFn: ({ driveKey, name }: { driveKey: string; name: string }) => renameDrive(driveKey, name),
    onSuccess: async (updatedDrive, variables) => {
      queryClient.setQueryData(drivesQueryOptions('local').queryKey, (current: DriveRecord[] | undefined) =>
        current?.map((drive) => (drive.driveKey === variables.driveKey ? { ...drive, ...updatedDrive } : drive)) ?? current,
      );
      queryClient.setQueryData(driveTreeQueryOptions(variables.driveKey).queryKey, (current: ResourceTreeNode | undefined) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          name: updatedDrive.name,
        };
      });
      await invalidatePublishData(variables.driveKey);
      setShowRenameDialog(false);
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : 'Drive 改名失败。');
    },
  });

  const deleteDriveMutation = useMutation({
    mutationFn: deleteDrive,
    onSuccess: async (_, deletedDriveKey) => {
      const currentDrives = queryClient.getQueryData<DriveRecord[]>(drivesQueryOptions('local').queryKey) ?? drives;
      const nextDrives = currentDrives.filter((drive) => drive.driveKey !== deletedDriveKey);
      const currentIndex = currentDrives.findIndex((drive) => drive.driveKey === deletedDriveKey);
      const fallback = nextDrives[currentIndex] ?? nextDrives[currentIndex - 1] ?? null;

      queryClient.setQueryData(drivesQueryOptions('local').queryKey, nextDrives);
      if (deletedDriveKey) {
        await queryClient.removeQueries({ queryKey: driveTreeQueryOptions(deletedDriveKey).queryKey });
      }
      preview.closePreview();
      await replaceAndInvalidate(fallback?.driveKey ?? null);
      setShowDeleteDialog(false);
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : '删除 Drive 失败。');
    },
  });

  const mountDriveMutation = useMutation({
    mutationFn: ({ driveKey, targetPath }: { driveKey: string; targetPath: string }) => mountDrive(driveKey, targetPath),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mount-jobs'] });
      setShowMountDialog(false);
      setMountPath('');
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : '创建挂载任务失败。');
    },
  });

  const saveRemarkMutation = useMutation({
    mutationFn: ({ driveKey, remark }: { driveKey: string; remark: string }) => saveOwnedDriveRemark(driveKey, remark),
    onSuccess: async (_, variables) => {
      await invalidatePublishData(variables.driveKey);
      setRemarkEditor(null);
      setDialogError(null);
      setError(null);
    },
    onError: (mutationError) => {
      setDialogError(mutationError instanceof Error ? mutationError.message : '保存备注失败。');
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

  const handleCreateDrive = async () => {
    const nextLabel = createLabel.trim();

    if (!nextLabel) {
      setDialogError('Drive 名称不能为空。');
      return;
    }

    setCreating(true);

    try {
      await createDriveMutation.mutateAsync(nextLabel);
    } finally {
      setCreating(false);
    }
  };

  const handleRenameDrive = async () => {
    if (!selectedDrive) {
      return;
    }
    const nextLabel = renameLabel.trim();

    if (!nextLabel) {
      setDialogError('Drive 名称不能为空。');
      return;
    }

    setRenaming(true);

    try {
      await renameDriveMutation.mutateAsync({ driveKey: selectedDrive.driveKey, name: nextLabel });
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDrive) {
      return;
    }

    setDeleting(true);

    try {
      await deleteDriveMutation.mutateAsync(selectedDrive.driveKey);
    } finally {
      setDeleting(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedDrive) {
      setError('请先新建并选择一个 Drive。');
      return;
    }

    const nextTargetPath = mountPath.trim();

    if (!nextTargetPath) {
      setDialogError('请输入要发布的本地路径。');
      return;
    }

    setSubmitting(true);

    try {
      await mountDriveMutation.mutateAsync({ driveKey: selectedDrive.driveKey, targetPath: nextTargetPath });
    } finally {
      setSubmitting(false);
    }
  };

  const openRemarkEditor = (drive: DriveRecord) => {
    setRemarkEditor({
      driveKey: drive.driveKey,
      label: drive.name,
      remark: drive.remark ?? '',
    });
    setDialogError(null);
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

  const handlePreviewNode = (node: ResourceTreeNode) => {
    if (!selectedDrive) {
      setError('请先选择一个 Drive。');
      return;
    }

    const opened = preview.openPreview(selectedDrive.driveKey, node);

    if (!opened) {
      setError('当前文件暂不支持预览，或尚未同步到本地。');
      return;
    }

    setError(null);
  };

  const openRenameDialog = (drive: DriveRecord) => {
    setDriveKey(drive.driveKey);
    setRenameLabel(drive.name);
    setDialogError(null);
    setShowRenameDialog(true);
  };

  const openDeleteDialog = (drive: DriveRecord) => {
    setDriveKey(drive.driveKey);
    setDialogError(null);
    setShowDeleteDialog(true);
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
          key: 'rename',
          label: '重命名',
          icon: <IconPencil className="size-3.5" />,
          onSelect: () => openRenameDialog(contextMenuState.drive),
        },
        {
          key: 'delete',
          label: '删除',
          icon: <IconTrash className="size-3.5" />,
          danger: true,
          onSelect: () => openDeleteDialog(contextMenuState.drive),
        },
      ]
    : [];

  return (
    <ExplorerPage
      title="发布管理"
      action={(
        <button
          onClick={() => {
            setCreateLabel(`我的 Drive ${drives.length + 1}`);
            setDialogError(null);
            setShowCreateDialog(true);
          }}
          disabled={creating}
          className="flex items-center gap-2 h-7 px-3 bg-[#c47e09] rounded text-[11px] font-bold text-white hover:bg-[#d48e19] transition-all active:scale-95 shadow-[0_0_15px_rgba(196,126,9,0.2)] disabled:opacity-60"
        >
          <IconPlus className="size-3.5" />
          {creating ? '新建中...' : '新建订阅源'}
        </button>
      )}
    >
      <div className="flex-1 flex min-w-0 overflow-hidden">
        <DriveListSidebar
          title="订阅源"
          items={drives}
          selectedDriveKey={selectedDriveKey}
          emptyText="还没有 Drive，点击上方新建订阅源"
          onSelect={handleSelectDrive}
          getItemMeta={(drive) => ({
            title: drive.remark ?? drive.name,
            subtitle: drive.remark ? drive.name : undefined,
            subtitlePrefix: '',
            onContextMenu: (event) => openDriveContextMenu(drive, event),
          })}
        />

        <ExplorerPanel error={error}>
          <ExplorerDetailHeader emptyText="还没有 Drive，先新建一个">
            {selectedDrive ? (
              <>
                <DriveSummaryHeader drive={selectedDrive} />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setMountPath('');
                      setDialogError(null);
                      setShowMountDialog(true);
                    }}
                    disabled={submitting}
                    className="flex items-center gap-2 h-7 px-3 bg-[#c47e09] rounded text-[11px] font-bold text-white hover:bg-[#d48e19] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(196,126,9,0.24)]"
                  >
                    <IconUpload className="size-3.5" />
                    {submitting ? '进行中' : '挂载'}
                  </button>
                </div>
              </>
            ) : null}
          </ExplorerDetailHeader>

          <DriveResourceSection
            resourceTree={resourceTree}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            showTreeControls
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
          />
        </ExplorerPanel>
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
      <FormDialog
        open={showCreateDialog}
        title="新建 Drive"
        description="创建一个新的本地发布 Drive。"
        label="Drive 名称"
        value={createLabel}
        placeholder="输入 Drive 名称"
        submitLabel="创建"
        submittingLabel="创建中..."
        error={dialogError}
        disabled={creating}
        onClose={() => setShowCreateDialog(false)}
        onChange={setCreateLabel}
        onSubmit={() => void handleCreateDrive()}
      />
      <FormDialog
        open={showRenameDialog}
        title="重命名 Drive"
        description={selectedDrive?.name}
        label="Drive 名称"
        value={renameLabel}
        placeholder="输入新的 Drive 名称"
        submitLabel="保存"
        submittingLabel="保存中..."
        error={dialogError}
        disabled={renaming}
        onClose={() => setShowRenameDialog(false)}
        onChange={setRenameLabel}
        onSubmit={() => void handleRenameDrive()}
      />
      <FormDialog
        open={showMountDialog}
        title="挂载目录"
        description={selectedDrive ? `将本地目录挂载到 ${selectedDrive.name}` : undefined}
        label="本地路径"
        value={mountPath}
        placeholder="/path/to/local/folder"
        submitLabel="加入任务"
        submittingLabel="提交中..."
        error={dialogError}
        disabled={submitting}
        onClose={() => setShowMountDialog(false)}
        onChange={setMountPath}
        onSubmit={() => void handlePublish()}
      />
      <ConfirmDialog
        open={showDeleteDialog}
        title="删除 Drive"
        description={selectedDrive ? `确定删除“${selectedDrive.name}”吗？此操作会移除当前 Drive。` : '确定删除当前 Drive 吗？'}
        confirmLabel="删除"
        confirmingLabel="删除中..."
        disabled={deleting}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => void handleDelete()}
      />
      <ContextMenu
        open={contextMenuState !== null}
        x={contextMenuState?.x ?? 0}
        y={contextMenuState?.y ?? 0}
        items={contextMenuItems}
        onClose={() => setContextMenuState(null)}
      />
    </ExplorerPage>
  );
}
