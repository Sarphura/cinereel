import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { RoutePlaceholder } from '../components/RoutePlaceholder';

function SeriesPage() {
  return <RoutePlaceholder label="series" />;
}

export const Route = createFileRoute('/series')({
  component: SeriesPage,
});
