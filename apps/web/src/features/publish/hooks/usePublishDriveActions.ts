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
  savePublishedDriveRemark,
} from '../api/api';
import { mountDrive } from '../../jobs/api';
import type { DriveContentType, DriveRecord, ResourceTreeNode } from '../../drive/types';

interface UsePublishDriveActionsOptions {
  drives: DriveRecord[];
  selectedDrive: DriveRecord | null;
  replaceAndInvalidate: (driveKey: string | null) => Promise<void>;
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
  // Errors
  error: string | null;
  setError: (error: string | null) => void;
  // Handlers
  handleCreateDrive: (label: string, type: DriveContentType) => Promise<void>;
  handleRenameDrive: (driveKey: string, name: string) => Promise<void>;
  handleDelete: () => Promise<void>;
  handlePublish: (targetPath: string) => Promise<void>;
  handleSaveRemark: (driveKey: string, remark: string) => Promise<void>;
  handleRefresh: (selectedDriveKey: string | null) => Promise<void>;
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
  const [error, setError] = useState<string | null>(null);

  const invalidatePublishData = async (driveKey?: string | null) => {
    await queryClient.invalidateQueries({ queryKey: publishedDrivesQueryOptions().queryKey });
    await queryClient.refetchQueries({ queryKey: publishedDrivesQueryOptions().queryKey, exact: true });
    if (driveKey) {
      await queryClient.invalidateQueries({ queryKey: publishedDriveTreeQueryOptions(driveKey).queryKey });
      await queryClient.refetchQueries({ queryKey: publishedDriveTreeQueryOptions(driveKey).queryKey, exact: true });
    }
    await router.invalidate();
  };

  const createDriveMutation = useMutation({
    mutationFn: createPublishedDrive,
    onSuccess: async (drive) => {
      queryClient.setQueryData<DriveRecord[]>(publishedDrivesQueryOptions().queryKey, (current) => {
        const nextDrives = current ?? drives;

        if (nextDrives.some((item) => item.driveKey === drive.driveKey)) {
          return nextDrives.map((item) => (item.driveKey === drive.driveKey ? drive : item));
        }

        return [drive, ...nextDrives];
      });

      await replaceAndInvalidate(drive.driveKey);
      await queryClient.refetchQueries({ queryKey: publishedDrivesQueryOptions().queryKey, exact: true });
      setError(null);
    },
  });

  const renamePublishedDriveMutation = useMutation({
    mutationFn: ({ driveKey, name }: { driveKey: string; name: string }) => renamePublishedDrive(driveKey, name),
    onSuccess: async (updatedDrive, variables) => {
      queryClient.setQueryData(publishedDrivesQueryOptions().queryKey, (current: DriveRecord[] | undefined) =>
        current?.map((drive) => (drive.driveKey === variables.driveKey ? { ...drive, ...updatedDrive } : drive)) ?? current,
      );
      queryClient.setQueryData(publishedDriveTreeQueryOptions(variables.driveKey).queryKey, (current: ResourceTreeNode | undefined) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          name: updatedDrive.name,
        };
      });
      await invalidatePublishData(variables.driveKey);
      setError(null);
    },
  });

  const deletePublishedDriveMutation = useMutation({
    mutationFn: deletePublishedDrive,
    onSuccess: async (_, deletedDriveKey) => {
      const currentDrives = queryClient.getQueryData<DriveRecord[]>(publishedDrivesQueryOptions().queryKey) ?? drives;
      const nextDrives = currentDrives.filter((drive) => drive.driveKey !== deletedDriveKey);
      const currentIndex = currentDrives.findIndex((drive) => drive.driveKey === deletedDriveKey);
      const fallback = nextDrives[currentIndex] ?? nextDrives[currentIndex - 1] ?? null;

      queryClient.setQueryData(publishedDrivesQueryOptions().queryKey, nextDrives);
      if (deletedDriveKey) {
        await queryClient.removeQueries({ queryKey: publishedDriveTreeQueryOptions(deletedDriveKey).queryKey });
      }
      onClosePreview();
      await replaceAndInvalidate(fallback?.driveKey ?? null);
      setError(null);
    },
  });

  const mountDriveMutation = useMutation({
    mutationFn: ({ driveKey, targetPath }: { driveKey: string; targetPath: string }) => mountDrive(driveKey, targetPath),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mount-jobs'] });
      setError(null);
    },
  });

  const saveRemarkMutation = useMutation({
    mutationFn: ({ driveKey, remark }: { driveKey: string; remark: string }) => savePublishedDriveRemark(driveKey, remark),
    onSuccess: async (_, variables) => {
      await invalidatePublishData(variables.driveKey);
      setError(null);
    },
  });

  const handleCreateDrive = async (label: string, type: DriveContentType) => {
    const nextLabel = label.trim();

    if (!nextLabel) {
      throw new Error('Drive 名称不能为空。');
    }

    setCreating(true);

    try {
      await createDriveMutation.mutateAsync({ name: nextLabel, type });
    } finally {
      setCreating(false);
    }
  };

  const handleRenameDrive = async (driveKey: string, name: string) => {
    const nextLabel = name.trim();

    if (!nextLabel) {
      throw new Error('Drive 名称不能为空。');
    }

    setRenaming(true);

    try {
      await renamePublishedDriveMutation.mutateAsync({ driveKey, name: nextLabel });
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
      await deletePublishedDriveMutation.mutateAsync(selectedDrive.driveKey);
    } finally {
      setDeleting(false);
    }
  };

  const handlePublish = async (targetPath: string) => {
    if (!selectedDrive) {
      throw new Error('请先新建并选择一个 Drive。');
    }

    const nextTargetPath = targetPath.trim();

    if (!nextTargetPath) {
      throw new Error('请输入要发布的本地路径。');
    }

    setSubmitting(true);

    try {
      await mountDriveMutation.mutateAsync({ driveKey: selectedDrive.driveKey, targetPath: nextTargetPath });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveRemark = async (driveKey: string, remark: string) => {
    setSavingRemark(true);

    try {
      await saveRemarkMutation.mutateAsync({ driveKey, remark });
    } finally {
      setSavingRemark(false);
    }
  };

  const handleRefresh = async (selectedDriveKey: string | null) => {
    setRefreshing(true);

    try {
      if (selectedDriveKey) {
        const nextTree = await refreshPublishedDriveTree(selectedDriveKey);
        queryClient.setQueryData(publishedDriveTreeQueryOptions(selectedDriveKey).queryKey, nextTree);
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
    error,
    setError,
    handleCreateDrive,
    handleRenameDrive,
    handleDelete,
    handlePublish,
    handleSaveRemark,
    handleRefresh,
  };
}
