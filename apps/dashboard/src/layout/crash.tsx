import { Button, Collapsible, Empty, LinkButton } from "@cloudflare/kumo";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useContext, useState } from "react";

import { QuiltSlot } from "../brand/quilt-block.tsx";
import { CopyIcon } from "../icons/icons.tsx";
import { AuthHeading, AuthLayout } from "./auth-layout.tsx";
import { CrashPlaceContext } from "./crash-place.ts";
import { SlotArt } from "./empty-state.tsx";

const NEW_ISSUE_URL = "https://github.com/mailquilt/mailquilt/issues/new";

const WHAT_HAPPENED =
  "Mailquilt hit an error it didn’t expect. What you’ve saved is safe.";

const reload = () => location.reload();

const COPIED_FOR_MS = 2000;

const CopyMessage = ({ message }: { message: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      icon={CopyIcon}
      onClick={async () => {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_FOR_MS);
      }}
      size="sm"
      variant="secondary"
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy error"}</span>
    </Button>
  );
};

const ErrorDetails = ({
  centred,
  error,
}: {
  centred: boolean;
  error: unknown;
}) => {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <Collapsible
      className={`mt-5 flex w-full flex-col ${centred ? "items-center" : "items-start"}`}
    >
      <Collapsible.DefaultTrigger>Error details</Collapsible.DefaultTrigger>
      <Collapsible.DefaultPanel className="w-full max-w-[28rem] text-left">
        <p className="rounded-lg bg-kumo-elevated px-3 py-2 font-mono text-xs break-words text-kumo-default ring ring-kumo-hairline">
          {message}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-kumo-subtle">
          <CopyMessage message={message} />
          <span>
            If it happens again,{" "}
            <a
              className="underline decoration-kumo-hairline underline-offset-4 hover:text-kumo-strong"
              href={NEW_ISSUE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              report it on GitHub
            </a>
            .
          </span>
        </div>
      </Collapsible.DefaultPanel>
    </Collapsible>
  );
};

const PageCrash = ({ error }: { error: unknown }) => (
  <div
    className="mq-page-body absolute inset-0 flex items-center justify-center"
    role="alert"
  >
    <div className="mq-state w-full max-w-[36rem]">
      <Empty
        contents={
          <div className="flex w-full flex-col items-center">
            <Button onClick={reload} variant="secondary">
              Reload
            </Button>
            <ErrorDetails centred error={error} />
          </div>
        }
        description={WHAT_HAPPENED}
        icon={<SlotArt />}
        title="This page hit an error"
      />
    </div>
  </div>
);

const AuthCrash = ({ error }: { error: unknown }) => (
  <div role="alert">
    <QuiltSlot className="mb-7 size-12" />
    <AuthHeading description={WHAT_HAPPENED}>Something went wrong</AuthHeading>
    <Button
      className="w-full justify-center"
      onClick={reload}
      variant="primary"
    >
      Reload
    </Button>
    <LinkButton className="mt-2 w-full justify-center" href="/" variant="ghost">
      Go to Mailquilt
    </LinkButton>
    <ErrorDetails centred={false} error={error} />
  </div>
);

/**
 * The router's error component for every route. A page that throws is drawn
 * in the page block with the sidebar kept; a signed-out page in its layout;
 * and when a layout itself fails, the whole page, on the signed-out layout.
 */
export const Crash = ({ error }: ErrorComponentProps) => {
  const place = useContext(CrashPlaceContext);

  if (place === "page") {
    return <PageCrash error={error} />;
  }

  if (place === "auth") {
    return <AuthCrash error={error} />;
  }

  return (
    <AuthLayout>
      <AuthCrash error={error} />
    </AuthLayout>
  );
};
