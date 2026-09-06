import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import {
  createPublishedDrive,
  deletePublishedDrive,
  publishedDriveTreeQueryOptions,
  publishedDrivesQueryOptions,
  refreshPublishedDriveTree,
  renamePublishedDrive,
  retryPublishedDriveCreation,
  savePublishedDriveRemark,
  uploadDriveFiles,
} from '../api/api';
import type { DriveContentTypeId, DriveRecord, ResourceTreeNode } from '../../drive/types';
import { getDriveSelectionKey } from '../../drive/utils';

interface UsePublishDriveActionsOptions {
  drives: DriveRecord[];
  selectedDrive: DriveRecord | null;
  replaceAndInvalidate: (driveId: string | null) => Promise<void>;
  onClosePreview: () => void;
}

export interface PublishDriveActions {
  // Loading states
  creating: boolean;
  submitting: boolean;
  deleting: boolean;
  renaming: boolean;
  refreshing: boolean;
  savingRemark: boolean;
  retryingCreation: boolean;
  // Errors
  error: string | null;
  setError: (error: string | null) => void;
  // Handlers
  handleCreateDrive: (label: string, contentTypeId: DriveContentTypeId) => Promise<void>;
  handleRenameDrive: (driveId: string, name: string) => Promise<void>;
  handleDelete: () => Promise<void>;
  handleUpload: (files: readonly File[]) => Promise<void>;
  handleSaveRemark: (driveId: string, remark: string) => Promise<void>;
  handleRetryCreation: () => Promise<void>;
  handleRefresh: (selectedDriveId: string | null) => Promise<void>;
}

export function usePublishDriveActions({
  drives,
  selectedDrive,
  replaceAndInvalidate,
  onClosePreview,
}: UsePublishDriveActionsOptions): PublishDriveActions {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingRemark, setSavingRemark] = useState(false);
  const [retryingCreation, setRetryingCreation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidatePublishData = async (driveId?: string | null) => {
    await queryClient.invalidateQueries({ queryKey: publishedDrivesQueryOptions().queryKey });
    await queryClient.refetchQueries({ queryKey: publishedDrivesQueryOptions().queryKey, exact: true });
    if (driveId) {
      await queryClient.invalidateQueries({ queryKey: publishedDriveTreeQueryOptions(driveId).queryKey });
      await queryClient.refetchQueries({ queryKey: publishedDriveTreeQueryOptions(driveId).queryKey, exact: true });
    }
    await router.invalidate();
  };

  const createDriveMutation = useMutation({
    mutationFn: createPublishedDrive,
    onSuccess: async (drive) => {
      queryClient.setQueryData<DriveRecord[]>(publishedDrivesQueryOptions().queryKey, (current) => {
        const nextDrives = current ?? drives;
        const createdDriveKey = getDriveSelectionKey(drive);

        if (nextDrives.some((item) => getDriveSelectionKey(item) === createdDriveKey)) {
          return nextDrives.map((item) => (getDriveSelectionKey(item) === createdDriveKey ? drive : item));
        }

        return [drive, ...nextDrives];
      });

      await replaceAndInvalidate(getDriveSelectionKey(drive));
      await queryClient.refetchQueries({ queryKey: publishedDrivesQueryOptions().queryKey, exact: true });
      setError(null);
    },
  });

  const renamePublishedDriveMutation = useMutation({
    mutationFn: ({ driveId, name }: { driveId: string; name: string }) => renamePublishedDrive(driveId, name),
    onSuccess: async (updatedDrive, variables) => {
      queryClient.setQueryData(publishedDrivesQueryOptions().queryKey, (current: DriveRecord[] | undefined) =>
        current?.map((drive) => (getDriveSelectionKey(drive) === variables.driveId ? { ...drive, ...updatedDrive } : drive)) ?? current,
      );
      queryClient.setQueryData(publishedDriveTreeQueryOptions(variables.driveId).queryKey, (current: ResourceTreeNode | null | undefined) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          name: updatedDrive.name,
        };
      });
      await invalidatePublishData(variables.driveId);
      setError(null);
    },
  });

  const deletePublishedDriveMutation = useMutation({
    mutationFn: deletePublishedDrive,
    onSuccess: async (_, deletedDriveKey) => {
      const currentDrives = queryClient.getQueryData<DriveRecord[]>(publishedDrivesQueryOptions().queryKey) ?? drives;
      const nextDrives = currentDrives.filter((drive) => getDriveSelectionKey(drive) !== deletedDriveKey);
      const currentIndex = currentDrives.findIndex((drive) => getDriveSelectionKey(drive) === deletedDriveKey);
      const fallback = nextDrives[currentIndex] ?? nextDrives[currentIndex - 1] ?? null;

      queryClient.setQueryData(publishedDrivesQueryOptions().queryKey, nextDrives);
      if (deletedDriveKey) {
        await queryClient.removeQueries({ queryKey: publishedDriveTreeQueryOptions(deletedDriveKey).queryKey });
      }
      onClosePreview();
      await replaceAndInvalidate(fallback ? getDriveSelectionKey(fallback) : null);
      setError(null);
    },
  });

  const saveRemarkMutation = useMutation({
    mutationFn: ({ driveId, remark }: { driveId: string; remark: string }) => savePublishedDriveRemark(driveId, remark),
    onSuccess: async (_, variables) => {
      await invalidatePublishData(variables.driveId);
      setError(null);
    },
  });

  const retryCreationMutation = useMutation({
    mutationFn: retryPublishedDriveCreation,
    onSuccess: async (_, driveId) => {
      await invalidatePublishData(driveId);
      setError(null);
    },
  });

  const handleCreateDrive = async (label: string, contentTypeId: DriveContentTypeId) => {
    const nextLabel = label.trim();

    if (!nextLabel) {
      throw new Error('Drive 名称不能为空。');
    }

    setCreating(true);

    try {
      await createDriveMutation.mutateAsync({ name: nextLabel, contentTypeId });
    } finally {
      setCreating(false);
    }
  };

  const handleRenameDrive = async (driveId: string, name: string) => {
    const nextLabel = name.trim();

    if (!nextLabel) {
      throw new Error('Drive 名称不能为空。');
    }

    setRenaming(true);

    try {
      await renamePublishedDriveMutation.mutateAsync({ driveId, name: nextLabel });
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
      await deletePublishedDriveMutation.mutateAsync(getDriveSelectionKey(selectedDrive));
    } finally {
      setDeleting(false);
    }
  };

  const handleUpload = async (files: readonly File[]) => {
    if (!selectedDrive) {
      throw new Error('请先新建并选择一个 Drive。');
    }

    if (!selectedDrive.driveId) {
      throw new Error('当前 Drive 缺少 driveId，无法上传文件。');
    }

    setSubmitting(true);

    try {
      await uploadDriveFiles(selectedDrive.driveId, files);
      await invalidatePublishData(selectedDrive.driveId);
      setError(null);
    } catch (uploadError) {
      await invalidatePublishData(selectedDrive.driveId);
      throw uploadError;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveRemark = async (driveId: string, remark: string) => {
    setSavingRemark(true);

    try {
      await saveRemarkMutation.mutateAsync({ driveId, remark });
    } finally {
      setSavingRemark(false);
    }
  };

  const handleRetryCreation = async () => {
    if (!selectedDrive?.driveId) {
      return;
    }

    setRetryingCreation(true);

    try {
      await retryCreationMutation.mutateAsync(selectedDrive.driveId);
    } finally {
      setRetryingCreation(false);
    }
  };

  const handleRefresh = async (selectedDriveId: string | null) => {
    setRefreshing(true);

    try {
      if (selectedDriveId) {
        const nextTree = await refreshPublishedDriveTree(selectedDriveId);
        queryClient.setQueryData(publishedDriveTreeQueryOptions(selectedDriveId).queryKey, nextTree);
        await queryClient.invalidateQueries({ queryKey: publishedDrivesQueryOptions().queryKey });
      }

      await router.invalidate();
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '刷新失败。');
    } finally {
      setRefreshing(false);
    }
  };

  return {
    creating,
    submitting,
    deleting,
    renaming,
    refreshing,
    savingRemark,
    retryingCreation,
    error,
    setError,
    handleCreateDrive,
    handleRenameDrive,
    handleDelete,
    handleUpload,
    handleSaveRemark,
    handleRetryCreation,
    handleRefresh,
  };
}
