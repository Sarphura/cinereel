import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@heroui/react';
import { moviesQueryOptions } from '../features/movies/api';
import { MovieCard } from '../features/movies/components/MovieCard';
import { FilterBar } from '../features/movies/components/FilterBar';

function MoviesPage() {
  const moviesQuery = useQuery(moviesQueryOptions());
  const isLoading = moviesQuery.isPending;
  const hasQueryError = moviesQuery.isError;
  const movies = moviesQuery.data ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#18181b]">
      <FilterBar totalCount={movies.length} />
      
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner color="success" size="lg" />
          </div>
        ) : (
          <>
            {hasQueryError ? (
              <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/5 text-sm text-rose-200">
                电影资料加载失败，请稍后重试。
              </div>
            ) : null}

            {!hasQueryError && movies.length === 0 ? (
              <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] text-sm text-zinc-400">
                当前还没有可显示的电影元数据。
              </div>
            ) : null}

            {!hasQueryError && movies.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {movies.map((movie) => (
                  <MovieCard
                    key={`${movie.driveKey}:${movie.resourcePath}`}
                    movie={movie}
                    onClick={(selectedMovie) => console.log('Click movie:', selectedMovie)}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/movies')({
  component: MoviesPage,
});
