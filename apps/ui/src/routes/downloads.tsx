import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { RoutePlaceholder } from '../components/RoutePlaceholder';

function DownloadsPage() {
  return <RoutePlaceholder label="downloads" />;
}

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
});
