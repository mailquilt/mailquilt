import { Button } from "@cloudflare/kumo";

import { AuthHeading, AuthLayout } from "./auth-layout.tsx";
import { PatchLoader } from "./empty-state.tsx";

/**
 * The whole page while what it needs is still loading. Pages wait here
 * rather than drawing a guess and changing it a moment later. It is drawn on
 * the frame's ink, because every page it leads to is ink around a light
 * block (the signed-in frame, or the quilt on signed-out pages), so the first
 * load never flashes white.
 */
export const PageLoading = () => (
  <div className="mq-frame-loading flex min-h-svh items-center justify-center">
    <output aria-label="Loading">
      <PatchLoader />
    </output>
  </div>
);

/**
 * A signed-in page's area while what it needs is still loading. The sidebar
 * stays; the page draws once, in its real state. The loader is centred in the
 * window, where `PageLoading` drew it a moment before, so it doesn't jump when
 * the sidebar appears.
 */
export const PageAreaLoading = ({ label }: { label: string }) => (
  <output className="pointer-events-none fixed inset-0 flex items-center justify-center">
    <PatchLoader />
    <span className="sr-only">{label}</span>
  </output>
);

/** The whole page when something it can't work without failed to load. */
export const PageLoadFailed = ({
  description,
  onRetry,
  title,
}: {
  description: string;
  onRetry: () => void;
  title: string;
}) => (
  <AuthLayout>
    <AuthHeading description={description}>{title}</AuthHeading>
    <Button
      className="w-full justify-center"
      onClick={onRetry}
      variant="primary"
    >
      Try again
    </Button>
  </AuthLayout>
);
