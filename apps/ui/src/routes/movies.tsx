import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { RoutePlaceholder } from '../components/RoutePlaceholder';

function MoviesPage() {
  return <RoutePlaceholder label="movies" />;
}

export const Route = createFileRoute('/movies')({
  component: MoviesPage,
});
