import { Button } from "@cloudflare/kumo";

import { AuthHeading, AuthLayout } from "./auth-layout.tsx";
import { PatchLoader } from "./empty-state.tsx";

/**
 * The whole page while what it needs is still loading. Pages wait here
 * rather than drawing a guess and changing it a moment later. `onFrame`
 * draws it on the frame's ink, for a wait that only ever leads to the
 * signed-in frame, so the frame's arrival changes nothing on screen.
 */
export const PageLoading = ({ onFrame = false }: { onFrame?: boolean }) => (
  <div
    className={`flex min-h-svh items-center justify-center ${onFrame ? "mq-frame-loading" : "bg-kumo-base"}`}
  >
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
      size="lg"
      variant="primary"
    >
      Try again
    </Button>
  </AuthLayout>
);
