import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { RoutePlaceholder } from '../components/RoutePlaceholder';

function DashboardPage() {
  return <RoutePlaceholder label="dashboard" />;
}

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});
