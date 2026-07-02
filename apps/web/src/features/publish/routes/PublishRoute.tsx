import React, { useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { IconPlus } from '../../../components/icons/Icons';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { FormDialog } from '../../../components/ui/FormDialog';
import { ExplorerDetailHeader, ExplorerPage, ExplorerPanel } from '../../../shared/components/drive-explorer/DriveExplorerChrome';
import { DriveListSidebar } from '../../../shared/components/drive-explorer/DriveListSidebar';
import { DriveRemarkDialog, type DriveRemarkEditorState } from '../../../shared/components/drive-explorer/DriveRemarkDialog';
import { DriveResourceSection } from '../../../shared/components/drive-explorer/DriveResourceSection';
import { useDriveSearchSync } from '../../../shared/hooks/drive';
import { useDrivePreview } from '../../../shared/components/drive-explorer/preview';
import { getPreviewKind } from '../../../shared/utils/drive';
import type { DriveRecord, ResourceTreeNode } from '../../../shared/types/drive';
import { usePublishDriveActions } from '../hooks/usePublishDriveActions';
import { CreatePublishDriveDialog } from '../components/CreatePublishDriveDialog';
import { PublishDriveContextMenu, type DriveContextMenuState } from '../components/PublishDriveContextMenu';
import { PublishDetailHeader } from '../components/PublishDetailHeader';

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
  const { drives, selectedDriveKey, resourceTree, error: loaderError } = routeApi.useLoaderData();
  const { router, setDriveKey, replaceAndInvalidate } = useDriveSearchSync('/publish', selectedDriveKey, search.driveKey);
  const selectedDrive = drives.find((drive) => drive.driveKey === selectedDriveKey) ?? null;
  const preview = useDrivePreview(selectedDriveKey);

  // Dialog open states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [renameLabel, setRenameLabel] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [remarkEditor, setRemarkEditor] = useState<DriveRemarkEditorState | null>(null);
  const [contextMenuState, setContextMenuState] = useState<DriveContextMenuState | null>(null);

  const actions = usePublishDriveActions({
    drives,
    selectedDrive,
    replaceAndInvalidate,
    onClosePreview: preview.closePreview,
  });

  const openRemarkEditor = (drive: DriveRecord) => {
    setRemarkEditor({ driveKey: drive.driveKey, label: drive.name, remark: drive.remark ?? '' });
  };

  const openRenameDialog = (drive: DriveRecord) => {
    setDriveKey(drive.driveKey);
    setRenameLabel(drive.name);
    setRenameError(null);
    setShowRenameDialog(true);
  };

  const openDeleteDialog = (drive: DriveRecord) => {
    setDriveKey(drive.driveKey);
    setDeleteError(null);
    setShowDeleteDialog(true);
  };

  const handlePreviewNode = (node: ResourceTreeNode) => {
    if (!selectedDrive) {
      actions.setError('请先选择一个 Drive。');
      return;
    }

    const opened = preview.openPreview(selectedDrive.driveKey, node);

    if (!opened) {
      actions.setError('当前文件暂不支持预览，或尚未同步到本地。');
      return;
    }

    actions.setError(null);
  };

  return (
    <ExplorerPage
      title="发布管理"
      action={(
        <button
          onClick={() => setShowCreateDialog(true)}
          disabled={actions.creating}
          className="flex items-center gap-2 h-7 px-3 bg-[#c47e09] rounded text-[11px] font-bold text-white hover:bg-[#d48e19] transition-all active:scale-95 shadow-[0_0_15px_rgba(196,126,9,0.2)] disabled:opacity-60"
        >
          <IconPlus className="size-3.5" />
          {actions.creating ? '新建中...' : '新建订阅源'}
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
              title="订阅源"
              items={drives}
              selectedDriveKey={selectedDriveKey}
              emptyText="还没有 Drive，点击上方新建订阅源"
              onSelect={setDriveKey}
              getItemMeta={(drive) => ({
                title: drive.remark ?? drive.name,
                subtitle: drive.remark ? drive.name : undefined,
                subtitlePrefix: '',
                onContextMenu: (event) => {
                  event.preventDefault();
                  setDriveKey(drive.driveKey);
                  setContextMenuState({ drive, x: event.clientX, y: event.clientY });
                },
              })}
            />

            <ExplorerPanel error={actions.error}>
              <ExplorerDetailHeader emptyText="还没有 Drive，先新建一个">
                {selectedDrive ? (
                  <PublishDetailHeader
                    drive={selectedDrive}
                    submitting={actions.submitting}
                    onMount={actions.handlePublish}
                  />
                ) : null}
              </ExplorerDetailHeader>

              <DriveResourceSection
                resourceTree={resourceTree}
                refreshing={actions.refreshing}
                onRefresh={() => void actions.handleRefresh(selectedDriveKey)}
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
          </>
        )}
      </div>

      {/* Dialogs & Overlays */}
      <CreatePublishDriveDialog
        open={showCreateDialog}
        drivesCount={drives.length}
        creating={actions.creating}
        onClose={() => setShowCreateDialog(false)}
        onCreate={actions.handleCreateDrive}
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
        error={renameError}
        disabled={actions.renaming}
        onClose={() => { setRenameError(null); setShowRenameDialog(false); }}
        onChange={(value) => { setRenameLabel(value); setRenameError(null); }}
        onSubmit={async () => {
          if (!selectedDrive) return;
          try {
            await actions.handleRenameDrive(selectedDrive.driveKey, renameLabel);
            setShowRenameDialog(false);
          } catch (err) {
            setRenameError(err instanceof Error ? err.message : 'Drive 改名失败。');
          }
        }}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        title="删除 Drive"
        description={selectedDrive ? `确定删除"${selectedDrive.name}"吗？此操作会移除当前 Drive。` : '确定删除当前 Drive 吗？'}
        confirmLabel="删除"
        confirmingLabel="删除中..."
        disabled={actions.deleting}
        onClose={() => { setDeleteError(null); setShowDeleteDialog(false); }}
        onConfirm={async () => {
          try {
            await actions.handleDelete();
            setShowDeleteDialog(false);
          } catch (err) {
            setDeleteError(err instanceof Error ? err.message : '删除 Drive 失败。');
          }
        }}
      />

      <DriveRemarkDialog
        remarkEditor={remarkEditor}
        saving={actions.savingRemark}
        error={null}
        onClose={() => setRemarkEditor(null)}
        onChange={(value) => setRemarkEditor((current) => (current ? { ...current, remark: value } : current))}
        onSubmit={async () => {
          if (!remarkEditor) return;
          await actions.handleSaveRemark(remarkEditor.driveKey, remarkEditor.remark);
          setRemarkEditor(null);
        }}
      />

      <PublishDriveContextMenu
        state={contextMenuState}
        onClose={() => setContextMenuState(null)}
        onRemark={openRemarkEditor}
        onRename={openRenameDialog}
        onDelete={openDeleteDialog}
      />
    </ExplorerPage>
  );
}
