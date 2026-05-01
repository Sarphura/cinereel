import React from 'react';
import { Button, Select, SelectItem, Chip } from '@heroui/react';
import { 
  IconMovie, 
  IconTv, 
  IconMusic 
} from '../Icons';

// Reusing or defining mini icons for the bar
const IconPlay = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconShuffle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3h5v5" /><path d="M4 20L21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" />
  </svg>
);

const IconList = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconGrid = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

interface FilterBarProps {
  totalCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({ totalCount }) => {
  return (
    <div className="flex items-center justify-between py-4 px-6 border-b border-white/3">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
           <span>全部</span>
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
           <IconMovie className="size-4" />
           <span>电影</span>
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
           <span>按标题排序</span>
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
        </div>

        <Chip size="sm" variant="flat" className="bg-zinc-800 text-zinc-500 h-5 px-1 min-w-0">
          {totalCount}
        </Chip>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5">
            <Button isIconOnly size="sm" variant="light" className="text-zinc-400">
                <IconPlay />
            </Button>
            <Button isIconOnly size="sm" variant="light" className="text-zinc-400">
                <IconShuffle />
            </Button>
            <div className="w-px h-4 bg-white/5 mx-1" />
            <Button isIconOnly size="sm" variant="light" className="text-zinc-400">
                <IconList />
            </Button>
            <Button isIconOnly size="sm" variant="solid" className="bg-zinc-700 text-zinc-100 shadow-sm" radius="md">
                <IconGrid />
            </Button>
        </div>
        
        <div className="flex items-center gap-2 ml-2">
            <div className="w-32 h-1 bg-zinc-800 rounded-full relative">
                <div className="absolute left-0 top-0 h-full w-1/3 bg-zinc-600 rounded-full" />
            </div>
            <div className="flex items-center gap-0.5">
                <IconGrid className="size-3 text-zinc-600" />
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600"><path d="m6 9 6 6 6-6"/></svg>
            </div>
        </div>
      </div>
    </div>
  );
};
