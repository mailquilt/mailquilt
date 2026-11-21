import {
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";

import { CheckInbox } from "../../auth/check-inbox.tsx";
import { SignedOutOnly } from "../../layout/session-gates.tsx";

const CheckYourInbox = () => {
  const { state } = useLocation();
  const navigate = useNavigate();

  return (
    <SignedOutOnly>
      <CheckInbox
        email={state.verificationEmail}
        onSent={(email) =>
          navigate({
            replace: true,
            state: { verificationEmail: email },
            to: "/check-your-inbox",
          })
        }
      />
    </SignedOutOnly>
  );
};

export const Route = createFileRoute("/_auth/check-your-inbox")({
  component: CheckYourInbox,
  head: () => ({ meta: [{ title: "Check your inbox – Mailquilt" }] }),
});
