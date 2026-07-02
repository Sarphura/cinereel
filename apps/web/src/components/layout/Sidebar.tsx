import React from 'react';
import {
  SidebarItem,
  SidebarSection,
  SidebarLine
} from './SidebarLayout';
import {
  IconDashboard,
  IconMovie,
  IconTv,
  IconMusic,
  IconDownload,
  IconMark,
  IconUpload,
} from '../icons/Icons';

export const Sidebar = () => {
  return (
    <aside className="w-[240px] border-r border-white/3 flex flex-col p-4 shrink-0 overflow-y-auto">
      <div className="space-y-5">
        <SidebarItem 
            icon={<IconDashboard />} 
            label="仪表盘" 
            to="/dashboard"
        />

        <div className="space-y-3">
          <SidebarSection label="资料库" />
          <div className="space-y-0.5">
            <SidebarItem 
                icon={<IconMovie />} 
                label="电影" 
                to="/movies"
            />
            <SidebarItem 
                icon={<IconTv />} 
                label="剧集" 
                to="/series"
            />
            <SidebarItem 
                icon={<IconMusic />} 
                label="音乐" 
                to="/music"
            />
          </div>
        </div>

        <SidebarLine />

        <div className="space-y-3">
          <SidebarSection label="管理" />
          <div className="space-y-0.5">
            <SidebarItem 
                icon={<IconDownload />} 
                label="下载" 
                to="/downloads"
            />
            <SidebarItem 
                icon={<IconMark />} 
                activeIcon={<IconMark className="text-[#f59e0b]" />}
                label="订阅" 
                color="#f59e0b"
                to="/subscribed-drives"
                search={{ driveKey: undefined }}
            />
            <SidebarItem
              icon={<IconUpload />}
              activeIcon={<IconUpload className="text-[#f59e0b]" />}
              label="发布"
              color="#f59e0b"
              to="/publish"
              search={{ driveKey: undefined }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
};
