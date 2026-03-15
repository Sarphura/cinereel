import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { getCurrentProfile, saveCurrentProfile } from '../features/drives/api';

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getCurrentProfile,
  });
  const [name, setName] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [avatarDataUrl, setAvatarDataUrl] = React.useState<string | null | undefined>(undefined);
  const [isDirty, setIsDirty] = React.useState(false);
  const syncedProfileKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    if (isDirty && syncedProfileKeyRef.current === profileQuery.data.driveKey) {
      return;
    }

    setName(profileQuery.data.name);
    setBio(profileQuery.data.bio);
    setAvatarDataUrl(undefined);
    setIsDirty(false);
    syncedProfileKeyRef.current = profileQuery.data.driveKey;
  }, [isDirty, profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: saveCurrentProfile,
    onSuccess: async (data) => {
      queryClient.setQueryData(['profile'], data);
      setName(data.name);
      setBio(data.bio);
      setAvatarDataUrl(undefined);
      setIsDirty(false);
      syncedProfileKeyRef.current = data.driveKey;
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const avatarPreview = avatarDataUrl === undefined
    ? profileQuery.data?.avatarUrl ?? null
    : avatarDataUrl;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#09090b] text-white">
      <div className="border-b border-[#27272a] px-8 py-3">
        <p className="text-[12px] font-medium text-zinc-500">Profile Drive</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-zinc-100">
          {profileQuery.data?.name ?? '当前账号'}
        </h1>
      </div>

      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-8 py-6">
        <section className="grid gap-6 rounded-[24px] border border-white/5 bg-[#111114] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#18181b]">
              {avatarPreview ? (
                <img src={avatarPreview} alt={name || 'avatar'} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-linear-to-br from-[#f59e0b] via-[#fb7185] to-[#38bdf8] text-[72px] font-bold uppercase text-white/95">
                  {(name || profileQuery.data?.name || '我').slice(0, 1)}
                </div>
              )}
            </div>
            <label className="block cursor-pointer rounded-xl border border-dashed border-[#3f3f46] px-4 py-3 text-center text-sm text-zinc-300 transition hover:border-[#f59e0b] hover:text-white">
              选择头像
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];

                  if (!file) {
                    return;
                  }

                  const dataUrl = await readFileAsDataUrl(file);
                  setAvatarDataUrl(dataUrl);
                  setIsDirty(true);
                }}
              />
            </label>
            <button
              type="button"
              className="w-full rounded-xl border border-[#27272a] px-4 py-3 text-sm text-zinc-400 transition hover:border-[#52525b] hover:text-zinc-100"
              onClick={() => {
                setAvatarDataUrl(null);
                setIsDirty(true);
              }}
            >
              移除头像
            </button>
          </div>

          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <InfoCard label="账号 Drive Key" value={profileQuery.data?.driveKey ?? '加载中...'} />
              <InfoCard label="Collection 数量" value={String(profileQuery.data?.collections.length ?? 0)} />
            </div>

            <label className="block">
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">显示名称</span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setIsDirty(true);
                }}
                className="w-full rounded-2xl border border-[#27272a] bg-[#18181b] px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-[#f59e0b]"
                placeholder="输入你的名称"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">简介</span>
              <textarea
                value={bio}
                onChange={(event) => {
                  setBio(event.target.value);
                  setIsDirty(true);
                }}
                className="min-h-[140px] w-full rounded-2xl border border-[#27272a] bg-[#18181b] px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-[#f59e0b]"
                placeholder="这段内容会写入 profile drive"
              />
            </label>

            <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">Profile Drive 同步入口</p>
                <p className="mt-1 text-xs text-zinc-500">用户名、头像和合集索引都从这条 drive 发布。</p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-[#f59e0b] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#fbbf24] disabled:cursor-not-allowed disabled:bg-[#a16207]"
                disabled={saveMutation.isPending || !profileQuery.data}
                onClick={() => {
                  void saveMutation.mutateAsync({
                    name,
                    bio,
                    ...(avatarDataUrl !== undefined ? { avatarDataUrl } : {}),
                  });
                }}
              >
                {saveMutation.isPending ? '保存中...' : '保存资料'}
              </button>
            </div>

            {saveMutation.error ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {saveMutation.error.message}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-white/5 bg-[#111114] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">已发布 Collections</h2>
              <p className="mt-1 text-sm text-zinc-500">创建本地订阅源后会自动登记到当前 profile drive。</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
              {profileQuery.data?.collections.length ?? 0} items
            </span>
          </div>

          <div className="space-y-3">
            {(profileQuery.data?.collections ?? []).map((collection) => (
              <Link
                key={collection.driveKey}
                to="/publish"
                search={{ driveKey: collection.driveKey }}
                className="flex items-center justify-between rounded-2xl border border-[#27272a] bg-[#18181b] px-4 py-3 transition hover:border-[#f59e0b]/40 hover:bg-[#1a1a1f]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{collection.name}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{collection.driveKey}</p>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">
                  {new Date(collection.updatedAt).toLocaleString()}
                </span>
              </Link>
            ))}
            {profileQuery.data && profileQuery.data.collections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#3f3f46] px-4 py-8 text-center text-sm text-zinc-500">
                还没有发布的 collection。
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#27272a] bg-[#18181b] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-2 break-all text-sm text-zinc-100">{value}</p>
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取头像失败。'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
