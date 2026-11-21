import { AuthHeading } from "../layout/auth-layout.tsx";
import { SendLinkForm } from "./send-link-form.tsx";

/**
 * Where a verification link that no longer works lands: say why, and send a
 * fresh link to the address the person types.
 */
export const LinkExpired = ({
  error,
  onSent,
}: {
  error: string;
  onSent: (email: string) => void;
}) => {
  const expired = error === "TOKEN_EXPIRED";

  return (
    <>
      <AuthHeading
        description={`${expired ? "Verification links work for one hour." : "It may have been copied only in part."} Enter your email and we’ll send a fresh link.`}
      >
        {expired ? "This link has expired" : "This link doesn’t work"}
      </AuthHeading>
      <SendLinkForm onSent={onSent} />
    </>
  );
};
