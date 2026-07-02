import React from 'react';
import { IconSearch } from '../icons/Icons';

type SearchBarProps = {
  placeholder?: string;
  width?: string;
  value?: string;
  disabled?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
};

export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = "搜索...", 
  width = "w-[200px]",
  value,
  disabled,
  onChange,
  onKeyDown,
}) => {
  return (
    <div className={`flex items-center gap-2 px-3 h-8 bg-black/20 border border-white/5 rounded-md focus-within:border-white/20 transition-all ${width}`}>
      <IconSearch className="size-3.5 text-[#52525c]" />
      <input 
        type="text" 
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onKeyDown={onKeyDown}
        className="bg-transparent border-none outline-none text-[12px] text-[#e4e4e7] placeholder-[#52525c] w-full"
      />
    </div>
  );
};

export const ResourceSearchBar: React.FC<SearchBarProps> = ({ 
  placeholder = "搜索...", 
  width = "w-full",
  value,
  disabled,
  onChange,
  onKeyDown,
}) => {
  return (
    <div className={`flex items-center gap-2 px-2 h-7.5 border-b border-[#27272a] hover:border-white/10 focus-within:border-[#f59e0b]/50 transition-colors ${width}`}>
      <IconSearch className="size-3.5 text-[#52525c]" />
      <input 
        type="text" 
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onKeyDown={onKeyDown}
        className="bg-transparent border-none outline-none text-[12px] text-[#e4e4e7] placeholder-[#52525c] w-full"
      />
    </div>
  );
};
