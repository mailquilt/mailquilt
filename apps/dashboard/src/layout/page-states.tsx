import { Button } from "@cloudflare/kumo";

import { QuiltSlot } from "../brand/quilt-block.tsx";
import { AuthHeading, AuthLayout } from "./auth-layout.tsx";
import { PatchLoader } from "./empty-state.tsx";

/**
 * The whole page while a signed-out page waits for the install's status
 * (signed-in pages wait on `FrameLoading`). Pages wait here rather than
 * drawing a guess and changing it a moment later. It is drawn on the frame's
 * ink, because every page it leads to is ink around a light block, so the
 * first load never flashes white.
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
 * light page block, as every page's content is, not in the window.
 */
export const PageAreaLoading = ({ label }: { label: string }) => (
  <output className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <PatchLoader />
    <span className="sr-only">{label}</span>
  </output>
);

/** The whole page when something it can't work without failed to load: the empty slot, as on Not found. */
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
    <QuiltSlot className="mb-7 size-12" />
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
