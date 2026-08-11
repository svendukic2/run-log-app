'use client';

// The one call to the RUN-61 follow API, shared by every store that holds a
// follow flag: the public profile (RUN-63) and the People search (RUN-62).
// Extracted when the second caller appeared rather than copied, so the two
// can never disagree about which verb means what or what a failure says.
//
// Deliberately does NOT touch any cache. Each store patches its own after
// this resolves, because only the store knows which of its rows moved.
import { ApiError, apiFetch } from './session';

export async function requestFollow(userId: string, next: boolean): Promise<void> {
  // Idempotent both ways, so the verb states the desired end state rather
  // than a transition: a repeated follow is not an error anywhere.
  const response = await apiFetch(`/api/users/${userId}/follow`, {
    method: next ? 'POST' : 'DELETE',
  });
  if (!response.ok) {
    throw new ApiError(
      next
        ? `Following this runner failed (${response.status}).`
        : `Unfollowing this runner failed (${response.status}).`,
      response.status,
    );
  }
}
