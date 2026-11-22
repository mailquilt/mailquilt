import { Button, Loader } from "@cloudflare/kumo";

import { AuthHeading, AuthLayout } from "./auth-layout.tsx";

/**
 * The whole page while what it needs is still loading. Pages wait here
 * rather than drawing a guess and changing it a moment later.
 */
export const PageLoading = () => (
  <div className="flex min-h-svh items-center justify-center bg-kumo-base">
    <Loader />
  </div>
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
