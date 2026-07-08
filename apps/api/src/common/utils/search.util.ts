import { BadRequestException } from '@nestjs/common';

const MAX_SEARCH_LENGTH = 100;

export function normalizeSearchTerm(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > MAX_SEARCH_LENGTH) {
    throw new BadRequestException(
      `Search term must be ${MAX_SEARCH_LENGTH} characters or less`,
    );
  }
  return trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
