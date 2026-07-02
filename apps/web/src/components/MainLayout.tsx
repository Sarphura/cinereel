import React from 'react';
import { Navbar } from './layout/Navbar';
import { Sidebar } from './layout/Sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen w-full bg-[#18181b] overflow-hidden">
      <Navbar />

      <div className="flex-1 flex w-full min-h-0">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};
