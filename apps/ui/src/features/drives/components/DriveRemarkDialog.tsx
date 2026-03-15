import React from 'react';

export type DriveRemarkEditorState = {
  driveKey: string;
  label: string;
  remark: string;
};

export function DriveRemarkDialog({
  remarkEditor,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
}: {
  remarkEditor: DriveRemarkEditorState | null;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
}) {
  if (!remarkEditor) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/55 px-4">
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#18181b] shadow-2xl"
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className="border-b border-[#27272a] px-5 py-4">
          <div className="text-sm font-semibold text-[#f4f4f5]">编辑备注</div>
          <div className="mt-1 text-xs text-[#71717b]">{remarkEditor.label}</div>
        </div>
        <div className="px-5 py-4">
          <label className="block text-[11px] font-medium uppercase tracking-[0.5px] text-[#71717b]">
            备注内容
          </label>
          <input
            autoFocus
            value={remarkEditor.remark}
            onChange={(event) => onChange(event.target.value)}
            placeholder="输入备注，留空则清除"
            className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#111114] px-3 text-sm text-[#f4f4f5] outline-none transition-colors placeholder:text-[#52525c] focus:border-[#c47e09]"
          />
          {error ? <div className="mt-2 text-xs text-[#fca5a5]">{error}</div> : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#27272a] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-lg px-4 text-sm text-[#a1a1aa] transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={saving}
            className="h-9 rounded-lg bg-[#c47e09] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#d48e19] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '保存中...' : '保存备注'}
          </button>
        </div>
      </div>
    </div>
  );
}
