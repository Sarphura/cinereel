import { API_BASE_URL, requestJson } from '../../lib/api';
import type { ProfileRecord } from './types';

function normalizeProfileRecord(profile: ProfileRecord): ProfileRecord {
  return {
    ...profile,
    avatarUrl: profile.avatarUrl
      ? new URL(profile.avatarUrl, `${API_BASE_URL}/`).toString()
      : null,
  };
}

export async function getCurrentProfile() {
  const response = await requestJson<{ data: ProfileRecord }>('/api/profile');
  return normalizeProfileRecord(response.data);
}

export async function saveCurrentProfile(input: {
  name?: string;
  bio?: string;
  avatarDataUrl?: string | null;
}) {
  const response = await requestJson<{ data: ProfileRecord }>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return normalizeProfileRecord(response.data);
}
