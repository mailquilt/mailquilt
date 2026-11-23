import { LinkButton } from "@cloudflare/kumo";

import { QuiltSlot } from "../brand/quilt-block.tsx";
import { AuthHeading, AuthLayout } from "./auth-layout.tsx";

/** Any address the dashboard has no page for: an empty slot in the quilt. */
export const NotFound = () => (
  <AuthLayout>
    <QuiltSlot className="mb-7 size-12" />
    <AuthHeading description="The link may be out of date, or the address mistyped.">
      There’s no page here
    </AuthHeading>
    <LinkButton className="w-full justify-center" href="/" variant="primary">
      Go to Mailquilt
    </LinkButton>
  </AuthLayout>
);
