import React from 'react';
import { Card, CardFooter } from '@heroui/react';
import type { MovieRecord } from '../../features/drives/types';
import { buildPreviewUrl } from '../../features/drives/utils';

interface MovieCardProps {
  movie: MovieRecord;
  onClick?: (movie: MovieRecord) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onClick }) => {
  const fallbackTitle = movie.resourcePath.split('/').filter(Boolean).pop() ?? '未命名电影';
  const title = movie.title?.trim() || fallbackTitle;
  const subtitle = movie.originalTitle?.trim() || null;
  const plot = movie.plot?.trim() || null;
  const year = movie.year ? String(movie.year) : null;
  const posterUrl = movie.posterPath
    ? buildPreviewUrl(movie.driveKey, movie.posterPath)
    : null;

  return (
    <Card
      isPressable
      radius="lg"
      className="group border-none bg-[#27272a] transition-colors hover:bg-[#3f3f46]"
      onPress={() => onClick?.(movie)}
    >
      <div className="relative aspect-[2/3] overflow-hidden">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.24),_transparent_45%),linear-gradient(160deg,_rgba(63,63,70,0.95)_0%,_rgba(24,24,27,1)_72%)] transition-transform duration-300 group-hover:scale-105" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 top-auto h-24 bg-gradient-to-t from-black/60 to-transparent" />
        {!posterUrl ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
            <span className="line-clamp-3 text-sm font-semibold tracking-[0.04em] text-zinc-100">
              {title}
            </span>
          </div>
        ) : null}
      </div>
      <CardFooter className="flex-col items-start px-3 py-2">
        <p className="w-full truncate text-xs font-medium text-zinc-100" title={title}>
          {title}
        </p>
        {subtitle && subtitle !== title ? (
          <p className="w-full truncate text-[10px] text-zinc-400" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
        {year && (
          <p className="text-[10px] font-bold text-zinc-500">
            {year}
          </p>
        )}
        {plot ? (
          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-400">
            {plot}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
};
