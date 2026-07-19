import React, { useEffect, useRef, useState } from 'react';
import { IconCheck, IconFolder, IconFolderPlus } from '../../../components/icons/Icons';
import { Dialog } from '../../../components/ui/Dialog';
import type { ManualMovieMountInput } from '../../jobs/api';

type FieldKey = keyof ManualMovieMountInput;

type FormState = Record<FieldKey, string>;
type SelectionMap = Partial<Record<FieldKey, { name: string; size: number }>>;

const EMPTY_FORM: FormState = {
  bannerPath: '',
  fanartPath: '',
  posterPath: '',
  clearlogoPath: '',
  nfoPath: '',
  videoPath: '',
  torrentPath: '',
};

const EMPTY_SELECTION: SelectionMap = {};

interface FieldDescriptor {
  key: FieldKey;
  label: string;
  helper?: string;
  optional?: boolean;
  accept?: string;
  kind: 'metadata' | 'video' | 'torrent' | 'nfo';
}

const FIELDS: FieldDescriptor[] = [
  { key: 'bannerPath', label: 'Banner', helper: '电影横幅图', optional: true, accept: 'image/*', kind: 'metadata' },
  { key: 'fanartPath', label: 'Fanart', helper: '背景图', optional: true, accept: 'image/*', kind: 'metadata' },
  { key: 'posterPath', label: 'Poster', helper: '封面图（上传后保存为 poster.jpg）', optional: true, accept: 'image/*', kind: 'metadata' },
  { key: 'clearlogoPath', label: 'Clearlogo', helper: '透明 Logo 图', optional: true, accept: 'image/*', kind: 'metadata' },
  { key: 'nfoPath', label: 'NFO', helper: '必须包含 <title> 与四位 <year>', accept: '.nfo,text/xml,application/xml,text/plain', kind: 'nfo' },
  { key: 'videoPath', label: '电影视频', helper: '选择视频文件 (.mkv/.mp4/...)', accept: 'video/*,.mkv,.mp4,.avi,.mov,.ts,.iso', kind: 'video' },
  { key: 'torrentPath', label: 'BT 种子', helper: '选择 .torrent 种子文件', accept: '.torrent,application/x-bittorrent', kind: 'torrent' },
];

interface ManualMovieMountDialogProps {
  open: boolean;
  submitting: boolean;
  driveName: string;
  onClose: () => void;
  onMount: (input: ManualMovieMountInput) => Promise<void>;
}

export function ManualMovieMountDialog({
  open,
  submitting,
  driveName,
  onClose,
  onMount,
}: ManualMovieMountDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selections, setSelections] = useState<SelectionMap>(EMPTY_SELECTION);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingField, setPendingField] = useState<FieldKey | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setSelections(EMPTY_SELECTION);
      setFieldErrors({});
      setError(null);
      setPendingField(null);
    }
  }, [open]);

  const updateField = (key: FieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const openPicker = (field: FieldKey) => {
    if (submitting) return;
    setPendingField(field);
    fileInputRef.current?.click();
  };

  const handleFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const field = pendingField;
    setPendingField(null);
    if (!field || !file) return;
    const absolutePath = inferAbsolutePath(file);
    setForm((current) => ({ ...current, [field]: absolutePath }));
    setSelections((current) => ({
      ...current,
      [field]: { name: file.name, size: file.size },
    }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
  };

  const handleSubmit = async () => {
    const nextFieldErrors: Partial<Record<FieldKey, string>> = {};
    if (!form.nfoPath.trim()) {
      nextFieldErrors.nfoPath = '请先选择 NFO 文件。';
    }
    const hasVideo = Boolean(form.videoPath.trim());
    const hasTorrent = Boolean(form.torrentPath.trim());
    if (hasVideo === hasTorrent) {
      const message = '电影视频和 BT 种子必须且只能选择一项。';
      nextFieldErrors.videoPath = message;
      nextFieldErrors.torrentPath = message;
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setError(null);
    try {
      await onMount(stripEmpty(form));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建手动电影挂载任务失败。');
    }
  };

  const renderField = (field: FieldDescriptor) => {
    const value = form[field.key];
    const picked = selections[field.key];
    const errorMessage = fieldErrors[field.key];
    return (
      <div
        key={field.key}
        className={`rounded-lg border border-white/10 bg-[#111114]/60 p-3 ${errorMessage ? 'border-[#fca5a5]/60' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#71717b]">
              {field.label}
              {field.optional ? <span className="ml-1 normal-case text-[#52525c]">可选</span> : null}
            </div>
            {field.helper ? (
              <div className="mt-0.5 text-[10px] text-[#52525b]">{field.helper}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => openPicker(field.key)}
            disabled={submitting}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2.5 text-[11px] font-medium text-[#d4d4d8] transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <IconFolder className="size-3.5" />
            选择文件
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded border border-white/5 bg-[#0c0c0e] px-2.5 py-1.5">
          <IconFolderPlus className="size-3.5 shrink-0 text-[#52525b]" />
          <input
            aria-label={`${field.label} 路径`}
            value={value}
            onChange={(event) => updateField(field.key, event.target.value)}
            placeholder={`/path/to/${field.label.toLowerCase().replace(/\s+/g, '-')}`}
            disabled={submitting}
            className="w-full bg-transparent text-[11px] text-[#d4d4d8] outline-none placeholder:text-[#52525c] disabled:opacity-60"
          />
          {value ? (
            <IconCheck className="size-3.5 shrink-0 text-emerald-300" />
          ) : null}
        </div>
        {picked ? (
          <div className="mt-1 text-[10px] text-[#71717b]">
            已选：{picked.name}（{formatBytes(picked.size)}）
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-1 text-[10px] text-[#fca5a5]">{errorMessage}</div>
        ) : null}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      title="手动挂载电影"
      description={`根据 NFO 在 ${driveName} 根目录下创建电影目录，并放入所选文件`}
      onClose={handleClose}
      footer={(
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="h-9 rounded-lg px-4 text-sm text-[#a1a1aa] transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="h-9 rounded-lg bg-[#c47e09] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#d48e19] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '提交中...' : '确定'}
          </button>
        </>
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={pendingField ? (FIELDS.find((f) => f.key === pendingField)?.accept ?? '*/*') : '*/*'}
        onChange={handleFilePicked}
      />
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.filter((field) => field.kind === 'metadata' || field.kind === 'nfo').map(renderField)}
        </div>
        <div className="my-4 border-t border-white/8" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.filter((field) => field.kind === 'video' || field.kind === 'torrent').map(renderField)}
        </div>
        <p className="mt-3 text-[10px] text-[#71717b]">
          电影视频与 BT 种子必须二选一；点击「选择文件」即可调起系统文件对话框，也可以直接把本地绝对路径粘贴到输入框。
        </p>
        {error ? <div className="mt-3 text-xs text-[#fca5a5]">{error}</div> : null}
      </div>
    </Dialog>
  );
}

function stripEmpty(input: FormState): ManualMovieMountInput {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const trimmed = value.trim();
    if (trimmed) result[key] = trimmed;
  }
  return result as ManualMovieMountInput;
}

function formatBytes(size: number): string {
  if (size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  const digits = current >= 100 || unit === 0 ? 0 : 1;
  return `${current.toFixed(digits)} ${units[unit]}`;
}

/**
 * 推测所选文件的「服务端可访问的本地绝对路径」。
 *
 * - 当浏览器暴露了 `file.path`（旧 Chromium/Webkit 系扩展）时直接使用；
 * - 否则回退到 `<name>`，前端提示用户把完整路径粘贴到输入框。
 *
 * 服务端读取的文件来自用户输入的 `targetPath`/`nfoPath` 等字段，
 * 因此这里只是给出"刚刚选了什么文件"的反馈，最终落盘路径仍由
 * 用户在文本框中确认/修改，避免误把浏览器内存路径当成服务器路径。
 */
function inferAbsolutePath(file: File): string {
  const candidate = (file as File & { path?: string }).path;
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate;
  }
  return file.name;
}
