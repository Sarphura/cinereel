import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('鼠标从弹窗内拖到遮罩外释放时不关闭', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="测试弹窗" onClose={onClose}>
        <button type="button">弹窗内容</button>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement!;
    const content = screen.getByRole('button', { name: '弹窗内容' });

    fireEvent.mouseDown(content);
    fireEvent.mouseUp(overlay);
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
