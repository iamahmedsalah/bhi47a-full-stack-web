import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_PUBLIC_IN_DEV_KEY = 'isPublicInDev';
export const PublicInDev = () => SetMetadata(IS_PUBLIC_IN_DEV_KEY, true);

/**
 * Attempts JWT authentication (populating `req.user` when a valid token is
 * present) but never rejects the request when the token is missing/invalid.
 * The handler is responsible for enforcing its own access policy.
 */
export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
