import { Slot } from "../campaigns/campaign-status.tsx";
import { CheckIcon, CopySimpleIcon } from "../icons/icons.tsx";
import { Breakable } from "../layout/breakable.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import type { DnsRecordRow, DomainStatus, Mark } from "./dns-records.ts";

/** A small square button with only an icon, as a row's ⋯ menu is drawn. */
export const ICON_BUTTON =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-kumo-strong hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus";

/**
 * A domain's status as a small block of the logo: ink can send, the dashed
 * slot is a piece still missing, and pulses while it's checked. Decorative:
 * the words beside it say the same.
 */
export const DomainBlock = ({
  checking = false,
  status,
}: {
  checking?: boolean;
  status: DomainStatus;
}) => {
  if (!checking && (status === "ready" || status === "warning")) {
    return (
      <span
        aria-hidden="true"
        className="block size-3 shrink-0 rounded-quilt bg-(--mq-block-ink)"
      />
    );
  }

  return (
    <span className={`flex shrink-0 ${checking ? "mq-pulse" : ""}`}>
      <Slot />
    </span>
  );
};

/** A domain's status in words: "Ready, with 1 warning", "Can’t send yet". */
export const statusWords = (status: DomainStatus, warnings: number) => {
  if (status === "warning") {
    return `Ready, with ${warnings} ${warnings === 1 ? "warning" : "warnings"}`;
  }

  return {
    blocked: "Can’t send yet",
    ready: "Ready",
    unchecked: "Not checked yet",
  }[status];
};

/** A domain's status, as its block and its words. */
export const DomainStatusLabel = ({
  checking = false,
  status,
  warnings,
}: {
  checking?: boolean;
  status: DomainStatus;
  warnings: number;
}) => {
  let tone = "text-kumo-strong";

  if (checking || status === "unchecked") {
    tone = "text-kumo-subtle";
  } else if (status === "blocked") {
    tone = "font-medium text-kumo-danger";
  }

  return (
    <span className={`inline-flex items-center gap-2 text-sm ${tone}`}>
      <DomainBlock checking={checking} status={status} />
      {checking ? "Checking its DNS records…" : statusWords(status, warnings)}
    </span>
  );
};

/**
 * One record's result as a block: ink with a check passes, grey warns, the
 * dashed slot is missing, and pulses while it hasn't been checked.
 * Decorative: the words beside it say the same.
 */
export const MarkBlock = ({ mark }: { mark: Mark }) => {
  if (mark === "pass") {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-quilt bg-(--mq-block-ink) text-kumo-inverse"
      >
        <CheckIcon className="size-3.5" weight="bold" />
      </span>
    );
  }

  if (mark === "warn") {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-quilt bg-kumo-tint font-display text-xs font-semibold text-kumo-strong"
      >
        !
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="block size-5 shrink-0 rounded-quilt-slot border-2 border-dashed border-(--mq-logo-slot)"
    />
  );
};

const MARK_WORDS: Record<Mark, string> = {
  fail: "Missing.",
  pass: "Passes.",
  pending: "Not checked yet.",
  warn: "Warning.",
};

/** What the last check found for one record, with its block. */
export const Found = ({ record }: { record: DnsRecordRow }) => {
  const failed = record.mark === "fail";

  return (
    <p className="flex items-start gap-2 text-sm text-pretty">
      <span className="flex h-lh items-center">
        <MarkBlock mark={record.mark} />
      </span>
      <span className={failed ? "text-kumo-danger" : "text-kumo-default"}>
        <span className="font-medium">
          {record.wrong === true ? "Wrong." : MARK_WORDS[record.mark]}
        </span>
        {record.found === "" ? null : (
          <>
            {" "}
            <span className={failed ? undefined : "text-kumo-subtle"}>
              {record.found}
            </span>
          </>
        )}
      </span>
    </p>
  );
};

/**
 * A value to copy into DNS, wrapped in full with a copy button, rather than
 * cut to one line as Kumo's `ClipboardText` does: a DKIM name runs to 60
 * characters, and people check what they paste. Copying confirms with a
 * toast.
 */
export const CopyValue = ({ label, text }: { label: string; text: string }) => {
  const toasts = useConfirmationToast();

  return (
    <span className="flex min-h-9 min-w-0 items-start gap-1 rounded-lg bg-kumo-base py-1 pr-1 pl-3 ring ring-kumo-line">
      <span className="min-w-0 flex-1 py-1 font-mono text-sm leading-5 text-kumo-strong">
        <Breakable value={text} />
      </span>
      <button
        aria-label={`Copy the ${label}`}
        className={ICON_BUTTON}
        onClick={async () => {
          // WARNING: a page served over plain http, as a self-hosted install reached by its LAN address can be, has no clipboard, so a copy can fail.
          try {
            await navigator.clipboard.writeText(text);
            toasts.add({ title: `Copied the ${label}` });
          } catch {
            toasts.add({
              description: "Select it and copy it from there.",
              title: `Couldn’t copy the ${label}`,
            });
          }
        }}
        type="button"
      >
        <CopySimpleIcon aria-hidden="true" className="size-4" />
      </button>
    </span>
  );
};

/** What to publish when only the Provider knows the value, in a dashed box: a piece Mailquilt can't fill in. */
export const FromProvider = ({ text }: { text: string }) => (
  <span className="flex min-h-9 items-center rounded-lg border border-dashed border-kumo-line px-3 text-sm text-kumo-subtle">
    {text}
  </span>
);
