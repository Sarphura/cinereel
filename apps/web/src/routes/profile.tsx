import { createFileRoute } from '@tanstack/react-router';
import { ProfileEditor } from '../features/profile/components/ProfileEditor';

export const Route = createFileRoute('/profile')({
  component: ProfileEditor,
});
