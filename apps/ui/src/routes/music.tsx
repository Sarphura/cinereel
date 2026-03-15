import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { RoutePlaceholder } from '../components/RoutePlaceholder';

function MusicPage() {
  return <RoutePlaceholder label="music" />;
}

export const Route = createFileRoute('/music')({
  component: MusicPage,
});
