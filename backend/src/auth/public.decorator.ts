import { SetMetadata } from '@nestjs/common';

// Marks a route or controller as reachable without a token. The global
// JwtAuthGuard (RUN-57) checks this metadata before demanding a Bearer
// token; everything NOT marked public is protected by default, so a new
// controller cannot be accidentally shipped open.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
