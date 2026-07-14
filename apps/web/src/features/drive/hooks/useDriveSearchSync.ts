import { startTransition, useEffect } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';

export function useDriveSearchSync(from: '/publish' | '/subscribe', selectedDriveKey: string | null, currentDriveKey?: string) {
  const navigate = useNavigate({ from });
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
