import { Banner, Button } from "@cloudflare/kumo";
import { WarningIcon } from "@phosphor-icons/react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { Predicate } from "effect";

import { UNREACHABLE_MESSAGE } from "../auth/auth-client.ts";
import { NewAccountForm } from "../auth/new-account-form.tsx";
import { AuthHeading } from "../layout/auth-layout.tsx";
import { useMarkSetUp, useSetUpInstance } from "./instance-api.ts";
import { useInstanceStatusOfGate } from "./setup-gate.tsx";

/**
 * First-run setup, for whoever reaches a fresh install first: it makes the
 * instance admin, signs them in and takes them to Instance settings to
 * choose where account emails go out. If someone else finished first, it
 * says so and offers sign-in. If the sign-in after setup fails, it sends
 * them to sign in themselves. Once setup has run, anyone arriving here is
 * sent to sign in.
 */
export const SetupPage = () => {
  const setUp = useSetUpInstance();
  const markSetUp = useMarkSetUp();
  const navigate = useNavigate();
  const status = useInstanceStatusOfGate();

  // WARNING: only before a try; afterwards this page leads the way itself, and a redirect here would cut in front of it.
  if (status.setUp && setUp.isIdle) {
    return <Navigate replace to="/sign-in" />;
  }

  const taken = Predicate.isTagged(setUp.error, "SetupClosed");

  const goToSignIn = async ({ justSetUp }: { justSetUp: boolean }) => {
    await markSetUp();
    await navigate({ replace: true, state: { justSetUp }, to: "/sign-in" });
  };

  return (
    <>
      <AuthHeading description="You’re the first one here. The account you make now runs this Mailquilt: its settings, the server its own emails go through, and who can sign up.">
        Set up this Mailquilt
      </AuthHeading>
      {taken ? (
        <div className="flex flex-col gap-5">
          <Banner
            description="If it was you in another tab, sign in. Otherwise, ask the person who deployed this Mailquilt."
            icon={<WarningIcon />}
            role="alert"
            title="Someone else just finished setup."
            variant="alert"
          />
          <Button
            className="w-full justify-center"
            onClick={() => goToSignIn({ justSetUp: false })}
            variant="primary"
          >
            Sign in
          </Button>
        </div>
      ) : (
        <>
          <NewAccountForm
            busy={setUp.isPending}
            busyLabel="Creating admin account…"
            onSubmit={(account) =>
              setUp.mutate(account, {
                onSuccess: async (outcome) => {
                  if (outcome === "set up") {
                    return goToSignIn({ justSetUp: true });
                  }

                  await markSetUp();
                  await navigate({
                    state: { justSetUp: true },
                    to: "/instance",
                  });
                },
              })
            }
            problem={setUp.isError ? UNREACHABLE_MESSAGE : null}
            submitLabel="Create admin account"
          />
          <p className="mt-5 text-base text-pretty text-kumo-subtle">
            Whoever finishes setup first becomes the admin, so finish it now.
          </p>
        </>
      )}
    </>
  );
};
