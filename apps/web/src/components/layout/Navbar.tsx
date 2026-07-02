import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react';
import { Link } from '@tanstack/react-router';
import { SearchBar } from '../ui/SearchComponents';
import { getCurrentProfile } from '../../features/profile/api';
import { TaskPanel } from '../../features/jobs/components/TaskPanel';

export const Navbar = () => {
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getCurrentProfile,
  });

  return (
    <div className="h-[64px] w-full p-2.5 flex shrink-0">
      <div className="flex-1 bg-[#27272a] rounded-lg flex items-center justify-between px-6 border border-white/[0.03]">
        <Link to="/dashboard" className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <span className="bg-linear-to-br from-white to-white/60 bg-clip-text text-transparent">Cinereel</span>
        </Link>

        <div className="flex items-center gap-4">
          <TaskPanel />
          <div className="relative flex items-center gap-2">
            <Link
              to="/profile"
              aria-label={`打开${profileQuery.data?.name ?? '个人'}信息`}
              className="size-8 rounded-full bg-[#3f3f46] border border-white/10 overflow-hidden shadow-xl ring-2 ring-white/5 transition hover:ring-[#f59e0b]/40"
            >
              {profileQuery.data?.avatarUrl ? (
                <img
                  src={profileQuery.data.avatarUrl}
                  alt={profileQuery.data.name}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-[#f59e0b] to-[#fb7185] text-[11px] font-semibold text-white">
                  {(profileQuery.data?.name ?? '我').slice(0, 1)}
                </div>
              )}
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <SearchBar />
            <Button 
                color="success" 
                variant="solid" 
                size="sm" 
                className="font-semibold px-4 h-9 min-w-0"
                as={Link}
                to="/publish"
            >
                发布
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
