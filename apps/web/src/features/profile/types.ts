export type ProfileRecord = {
  driveKey: string;
  name: string;
  bio: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  updatedAt: number;
  collections: Array<{
    driveKey: string;
    name: string;
    addedAt: number;
    updatedAt: number;
  }>;
};
