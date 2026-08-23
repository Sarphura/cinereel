import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DriveContentTypeId } from '../../drive/types';
import { CreatePublishDriveDialog } from './CreatePublishDriveDialog';

describe('CreatePublishDriveDialog', () => {
  it.each([
    ['电影', 'cinereel.movie'],
    ['剧集', 'cinereel.series'],
    ['音乐', 'cinereel.music'],
    ['未分类', 'cinereel.generic'],
  ] as const)('点击%s时提交对应的 DriveContentTypeId', async (label, contentTypeId) => {
    const user = userEvent.setup();
    const onCreate = vi.fn<(name: string, id: DriveContentTypeId) => Promise<void>>().mockResolvedValue(undefined);

    render(
      <CreatePublishDriveDialog
        open
        drivesCount={0}
        creating={false}
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    const typeButton = screen.getByRole('button', { name: label });
    await user.click(typeButton);

    expect(typeButton.getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: '创建' }));

    expect(onCreate).toHaveBeenCalledWith('我的 Drive 1', contentTypeId);
  });
});
