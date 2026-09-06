import { startTransition, useEffect } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';

export function useDriveSearchSync(selectedDriveKey: string | null, currentDriveKey?: string) {
  const navigate = useNavigate({ from: '/subscribe' });
  const router = useRouter();

  useEffect(() => {
    if (currentDriveKey === selectedDriveKey) {
      return;
    }

    startTransition(() => {
      void navigate({
        search: { driveKey: selectedDriveKey ?? undefined },
        replace: true,
      });
    });
  }, [currentDriveKey, navigate, selectedDriveKey]);

  const setDriveKey = (driveKey?: string | null) => {
    startTransition(() => {
      void navigate({
        search: { driveKey: driveKey ?? undefined },
        replace: true,
      });
    });
  };

  const replaceAndInvalidate = async (driveKey?: string | null) => {
    await navigate({
      search: { driveKey: driveKey ?? undefined },
      replace: true,
    });
    await router.invalidate();
  };

  return {
    router,
    setDriveKey,
    replaceAndInvalidate,
  };
}

export function usePublishDriveSearchSync(selectedDriveId: string | null, currentDriveId?: string) {
  const navigate = useNavigate({ from: '/publish' });
  const router = useRouter();

  useEffect(() => {
    if (currentDriveId === selectedDriveId) {
      return;
    }

    startTransition(() => {
      void navigate({
        search: { driveId: selectedDriveId ?? undefined },
        replace: true,
      });
    });
  }, [currentDriveId, navigate, selectedDriveId]);

  const setDriveId = (driveId?: string | null) => {
    startTransition(() => {
      void navigate({
        search: { driveId: driveId ?? undefined },
        replace: true,
      });
    });
  };

  const replaceAndInvalidate = async (driveId?: string | null) => {
    await navigate({
      search: { driveId: driveId ?? undefined },
      replace: true,
    });
    await router.invalidate();
  };

  return {
    router,
    setDriveId,
    replaceAndInvalidate,
  };
}
