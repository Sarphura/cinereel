import React from 'react';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/dropdown';

export type ContextMenuItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  if (typeof document === 'undefined') {
    return null;
  }

  return (
    <Dropdown
      isOpen={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      placement="bottom-start"
      offset={8}
      backdrop="transparent"
      shouldBlockScroll={false}
      classNames={{
        content: 'min-w-[180px] rounded-xl border border-white/10 bg-[#18181b]/96 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl',
      }}
    >
      <DropdownTrigger>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed size-px opacity-0"
          style={{ left: x, top: y }}
        />
      </DropdownTrigger>
      <DropdownMenu aria-label="右键操作菜单" variant="light" itemClasses={{
        base: 'rounded-lg data-[hover=true]:bg-white/6 data-[focus=true]:bg-white/6',
        title: 'text-sm',
      }}>
        {items.map((item) => (
          <DropdownItem
            key={item.key}
            startContent={item.icon}
            isDisabled={item.disabled}
            color={item.danger ? 'danger' : 'default'}
            classNames={{
              base: item.danger ? 'data-[hover=true]:bg-[#3a1f1f] data-[focus=true]:bg-[#3a1f1f]' : undefined,
              title: item.danger ? 'text-[#fca5a5]' : 'text-[#e4e4e7]',
            }}
            onPress={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}
