// The accent pill of the primary action (design library node 48:38), shared by
// the Add run button, link-shaped variants (the coach teaser's "Open coach",
// RUN-21) and the Settings "Save changes" button (RUN-36) so they cannot drift
// apart. Lives outside any 'use client' module: a client module's exports turn
// into client references on the server, so a server component (the Settings
// page) could not interpolate the string otherwise.
export const ACCENT_PILL_CLASSES =
  'flex w-full shrink-0 items-center justify-center gap-[9px] rounded-[14px] bg-accent px-[28px] py-[16px] text-[16px] font-semibold text-white hover:bg-accent-pressed';
