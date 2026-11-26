import { Banner, Button, Loader, Select } from "@cloudflare/kumo";
import { MAX_SUPPRESSIONS_ADDED_AT_ONCE } from "@repo/domain";
import type { Organization } from "@repo/domain";
import { useBlocker } from "@tanstack/react-router";
import { Array as Arr } from "effect";
import { useEffect, useId, useRef, useState } from "react";

import { FileArrowUpIcon, FileCsvIcon } from "../icons/icons.tsx";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { SlotArt } from "../layout/empty-state.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { countOfAddresses, suppressedMessage } from "./addresses.ts";
import { useRefreshSuppressions, useSuppressBatch } from "./audience-api.ts";
import { addressesIn, readCsv } from "./csv-addresses.ts";
import type { ColumnAddresses, CsvFile } from "./csv-addresses.ts";
import { formatCount } from "./format.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const SKIPPED_SHOWN = 3;

const CSV_FILE = /\.csv$/iu;

interface ChosenFile {
  readonly name: string;
  readonly size: number;
}

interface Totals {
  readonly added: number;
  readonly alreadySuppressed: number;
}

type Step =
  | { readonly kind: "choose"; readonly refused?: string }
  | { readonly kind: "reading"; readonly file: ChosenFile }
  | {
      readonly kind: "read";
      readonly file: ChosenFile;
      readonly csv: CsvFile;
      readonly column: number | undefined;
      readonly found: ColumnAddresses;
    }
  | {
      readonly kind: "importing" | "failed" | "done";
      readonly file: ChosenFile;
      readonly found: ColumnAddresses;
      readonly sent: number;
      readonly totals: Totals;
    };

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${formatCount(Math.max(1, Math.round(bytes / 1024)))} KB`
    : `${(bytes / 1024 / 1024).toLocaleString("en", { maximumFractionDigits: 1 })} MB`;

const rows = (count: number) =>
  `${formatCount(count)} ${count === 1 ? "row" : "rows"}`;

const refusalOf = (file: File) => {
  if (!CSV_FILE.test(file.name) && file.type !== "text/csv") {
    return `${file.name} isn’t a CSV file. Save it as CSV (comma-separated) from the program it came from, then choose the CSV file.`;
  }

  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is ${sizeOf(file.size)}. Mailquilt reads CSV files up to 10 MB: split it into smaller files and import each one.`;
  }
};

const actionLabelOf = (step: Step) => {
  switch (step.kind) {
    case "choose": {
      return "Choose file";
    }

    case "reading": {
      return "Suppress addresses";
    }

    case "read": {
      return step.found.addresses.length === 0
        ? "Choose another file"
        : `Suppress ${countOfAddresses(step.found.addresses.length)}`;
    }

    case "importing":
    case "done": {
      return `Suppress ${countOfAddresses(step.found.addresses.length)}`;
    }

    default: {
      return step.sent === 0
        ? `Suppress ${countOfAddresses(step.found.addresses.length)}`
        : `Suppress the other ${formatCount(step.found.addresses.length - step.sent)}`;
    }
  }
};

const FileRow = ({
  action,
  detail,
  name,
}: {
  action?: React.ReactNode;
  detail: React.ReactNode;
  name: string;
}) => (
  <div className="flex flex-wrap items-center gap-x-3 rounded-lg bg-kumo-elevated py-2.5 pr-2 pl-3 ring ring-kumo-hairline">
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-(--mq-block-ink) text-kumo-inverse"
    >
      <FileCsvIcon className="size-5" />
    </span>
    <span className="min-w-0 flex-1 basis-40">
      <span className="block font-medium break-words text-kumo-strong">
        {name}
      </span>
      <span className="block text-sm text-kumo-subtle">{detail}</span>
    </span>
    {action}
  </div>
);

const SkippedRows = ({
  column,
  skipped,
}: {
  column: string;
  skipped: ColumnAddresses["skipped"];
}) => {
  const more = skipped.length - SKIPPED_SHOWN;

  return (
    <div>
      <p className="text-sm text-pretty text-kumo-default">
        <span className="font-medium text-kumo-strong">
          {rows(skipped.length)} skipped
        </span>
        : {skipped.length === 1 ? "its" : "their"} {column} column isn’t an
        email address.
      </p>
      <ul className="mt-2 border-t border-kumo-hairline text-sm">
        {skipped.slice(0, SKIPPED_SHOWN).map(({ row, value }) => (
          <li
            className="flex gap-4 border-b border-kumo-hairline py-1.5"
            key={row}
          >
            <span className="w-20 shrink-0 text-kumo-subtle tabular-nums">
              Row {formatCount(row)}
            </span>
            <span
              className={`min-w-0 wrap-anywhere ${value === "" ? "text-kumo-subtle" : "text-kumo-default"}`}
            >
              {value === "" ? "Empty" : value}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-1.5 text-sm text-kumo-subtle">
          And {rows(more)} more.
        </p>
      ) : null}
    </div>
  );
};

const noteWhileSending = (kind: Step["kind"], sent: number) => {
  if (kind !== "failed") {
    return `Keep this page open until it’s done. Mailquilt sends the addresses in parts of ${MAX_SUPPRESSIONS_ADDED_AT_ONCE} from your browser.`;
  }

  return sent === 0
    ? "Mailquilt couldn’t confirm any part of it. Trying again is safe: an address that went through already is counted, not added twice."
    : `Those ${formatCount(sent)} stay suppressed, whatever you do next. Suppressing the rest is safe to repeat: an address that went through already is counted, not added twice.`;
};

const MOST_SEGMENTS = 20;

const batchesOf = (count: number) =>
  Math.ceil(count / MAX_SUPPRESSIONS_ADDED_AT_ONCE);

const ImportProgress = ({
  failed,
  sent,
  total,
}: {
  failed: boolean;
  sent: number;
  total: number;
}) => {
  const batches = batchesOf(total);
  const segments = Math.min(batches, MOST_SEGMENTS);
  const sentBatches = batchesOf(sent);

  const lastBatchOf = (segment: number) =>
    Math.ceil(((segment + 1) * batches) / segments);

  const stateOf = (segment: number) => {
    if (lastBatchOf(segment) <= sentBatches) {
      return "done";
    }

    const sending =
      !failed && (segment === 0 || lastBatchOf(segment - 1) <= sentBatches);

    return sending ? "sending" : "waiting";
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div aria-hidden="true" className="mq-batches">
        {Array.from({ length: segments }, (_, index) => (
          <i data-state={stateOf(index)} key={index} />
        ))}
      </div>
      <output className="block text-sm text-kumo-default tabular-nums">
        {failed && sent === 0 ? (
          "None confirmed before it stopped"
        ) : (
          <>
            {failed ? null : "Suppressing "}
            <span className="font-medium text-kumo-strong">
              {formatCount(sent)} of {formatCount(total)}
            </span>
            {failed ? " suppressed before it stopped" : "…"}
          </>
        )}
      </output>
    </div>
  );
};

/**
 * Imports Suppressions from a CSV file. The file is read in the browser:
 * only its addresses are sent, 250 to a request, one request at a time.
 * If a request fails, the ones before it stay Suppressed, and the rest can
 * be sent again; an address already Suppressed is counted, not added twice.
 * Give it `useDialog`'s `key` and `handleExited`, so each opening starts
 * with no file.
 */
export const ImportSuppressionsDialog = ({
  finalFocus,
  onExited,
  onOpenChange,
  open,
  organization,
}: {
  finalFocus?: React.RefObject<HTMLElement | null>;
  /** `useDialog`'s `handleExited`, so it starts fresh after each close. */
  onExited?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organization: Organization;
}) => {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [dragging, setDragging] = useState(false);
  const refresh = useRefreshSuppressions(organization.id);
  const sendBatch = useSuppressBatch(organization.id);
  const toasts = useConfirmationToast();
  const formId = useId();
  const picker = useRef<HTMLInputElement>(null);

  // WARNING: a file dropped beside the drop zone would otherwise be opened by the browser, leaving the app.
  useEffect(() => {
    if (!open) {
      return;
    }

    const keepFile = (event: DragEvent) => event.preventDefault();

    window.addEventListener("dragover", keepFile);
    window.addEventListener("drop", keepFile);

    return () => {
      window.removeEventListener("dragover", keepFile);
      window.removeEventListener("drop", keepFile);
    };
  }, [open]);

  const importing = step.kind === "importing";

  useBlocker({
    enableBeforeUnload: () => importing,
    shouldBlockFn: () => importing,
  });

  const shown = useRef(true);

  useEffect(() => {
    shown.current = true;

    return () => {
      shown.current = false;
    };
  }, []);

  const read = async (file: File) => {
    const refused = refusalOf(file);

    if (refused !== undefined) {
      setStep({ kind: "choose", refused });

      return;
    }

    const chosen = { name: file.name, size: file.size };
    setStep({ file: chosen, kind: "reading" });

    const text = await file.text().catch(() => null);

    if (text === null) {
      setStep({
        kind: "choose",
        refused: `Mailquilt couldn’t read ${file.name}. Choose it again.`,
      });

      return;
    }

    const csv = readCsv(text);

    setStep({
      column: csv.column,
      csv,
      file: chosen,
      found:
        csv.column === undefined
          ? { addresses: [], skipped: [] }
          : addressesIn(csv, csv.column),
      kind: "read",
    });
  };

  const finish = (file: ChosenFile, found: ColumnAddresses, totals: Totals) => {
    setStep({
      file,
      found,
      kind: "done",
      sent: found.addresses.length,
      totals,
    });
    refresh();
    onOpenChange(false);
    toasts.add(
      suppressedMessage(totals, {
        alsoSkipped:
          found.skipped.length === 0
            ? undefined
            : `${rows(found.skipped.length)} ${found.skipped.length === 1 ? "wasn’t an address" : "weren’t addresses"}`,
      })
    );
  };

  const send: (
    file: ChosenFile,
    found: ColumnAddresses,
    sent: number,
    totals: Totals
  ) => Promise<void> = async (file, found, sent, totals) => {
    const batch = found.addresses.slice(
      sent,
      sent + MAX_SUPPRESSIONS_ADDED_AT_ONCE
    );

    if (!shown.current) {
      return;
    }

    if (!Arr.isReadonlyArrayNonEmpty(batch)) {
      finish(file, found, totals);

      return;
    }

    setStep({ file, found, kind: "importing", sent, totals });

    const result = await sendBatch.mutateAsync(batch).catch(() => null);

    if (result === null) {
      setStep({ file, found, kind: "failed", sent, totals });
      refresh();

      return;
    }

    return send(file, found, sent + batch.length, {
      added: totals.added + result.added,
      alreadySuppressed: totals.alreadySuppressed + result.alreadySuppressed,
    });
  };

  const act = () => {
    switch (step.kind) {
      case "read": {
        if (step.found.addresses.length === 0) {
          picker.current?.click();
        } else {
          send(step.file, step.found, 0, { added: 0, alreadySuppressed: 0 });
        }

        return;
      }

      case "failed": {
        send(step.file, step.found, step.sent, step.totals);

        return;
      }

      default: {
        if (step.kind === "choose") {
          picker.current?.click();
        }
      }
    }
  };

  const chooseAnother = (
    <Button
      className="shrink-0 max-sm:ml-9"
      onClick={() => picker.current?.click()}
      type="button"
      variant="ghost"
    >
      Choose another
    </Button>
  );

  const body = () => {
    switch (step.kind) {
      case "choose": {
        return (
          <>
            {step.refused === undefined ? null : (
              <Banner role="alert" title={step.refused} variant="error" />
            )}
            <div
              className="mq-dropzone flex flex-col items-center justify-center gap-1 px-6 py-8 text-center max-sm:hidden"
              data-dragging={dragging ? "" : undefined}
              data-invalid={step.refused === undefined ? undefined : ""}
              onDragLeave={(event) => {
                const stillInside =
                  event.relatedTarget instanceof Node &&
                  event.currentTarget.contains(event.relatedTarget);

                if (!stillInside) {
                  setDragging(false);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);

                const [file] = event.dataTransfer.files;

                if (file !== undefined) {
                  read(file);
                }
              }}
            >
              <FileArrowUpIcon className="size-7 text-kumo-subtle" />
              <p className="mt-3 text-base font-medium text-kumo-strong">
                Drop a CSV file here
              </p>
              <p className="text-sm text-kumo-subtle">
                or use Choose file. Up to 10 MB.
              </p>
            </div>
            <p className="text-base text-pretty text-kumo-default sm:hidden">
              Choose the CSV file exported from the tool you used before, up to
              10 MB.
            </p>
            <p className="text-sm text-pretty text-kumo-subtle">
              Mailquilt uses the column named email, e-mail or address, or else
              the first column of addresses. You can change it once the file is
              read.
            </p>
          </>
        );
      }

      case "reading": {
        return (
          <FileRow
            detail={
              <span className="inline-flex items-center gap-2">
                <Loader size="sm" />
                Reading the file…
              </span>
            }
            name={step.file.name}
          />
        );
      }

      case "read": {
        const { column } = step;
        const { columns } = step.csv;
        const detail = `${rows(step.csv.rows)}, ${sizeOf(step.file.size)}`;

        if (column === undefined) {
          return (
            <>
              <FileRow detail={detail} name={step.file.name} />
              <div className="flex gap-3 px-1">
                <span className="pt-0.5">
                  <SlotArt size={20} />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-kumo-strong">
                    No email addresses in this file
                  </p>
                  <p className="text-sm text-pretty text-kumo-subtle">
                    Mailquilt looked in every column. Check it’s the list of
                    addresses you meant to import, then choose another file.
                  </p>
                </div>
              </div>
            </>
          );
        }

        const columnName = columns[column] ?? "";

        return (
          <>
            <FileRow
              action={chooseAnother}
              detail={detail}
              name={step.file.name}
            />
            <Select
              className="w-full"
              label="Addresses from column"
              onValueChange={(value) =>
                setStep({
                  ...step,
                  column: Number(value),
                  found: addressesIn(step.csv, Number(value)),
                })
              }
              renderValue={() => columnName}
              value={String(column)}
            >
              {columns.map((name, index) => (
                <Select.Option key={index} value={String(index)}>
                  {name}
                </Select.Option>
              ))}
            </Select>
            <div className="flex flex-col gap-4">
              <p className="font-display text-display-sm font-semibold text-kumo-strong tabular-nums">
                {step.found.addresses.length === 0
                  ? `No addresses in the ${columnName} column`
                  : `${countOfAddresses(step.found.addresses.length)} to suppress`}
              </p>
              {step.found.skipped.length === 0 ? null : (
                <SkippedRows column={columnName} skipped={step.found.skipped} />
              )}
            </div>
          </>
        );
      }

      default: {
        const total = step.found.addresses.length;
        const note = noteWhileSending(step.kind, step.sent);

        return (
          <>
            {step.kind === "failed" ? (
              <Banner
                role="alert"
                title="The import stopped: Mailquilt couldn’t reach its server."
                variant="error"
              />
            ) : null}
            <FileRow detail={countOfAddresses(total)} name={step.file.name} />
            <ImportProgress
              failed={step.kind === "failed"}
              sent={step.sent}
              total={total}
            />
            <p className="text-sm text-pretty text-kumo-subtle">{note}</p>
          </>
        );
      }
    }
  };

  return (
    <ActionDialog
      actionLabel={actionLabelOf(step)}
      busy={step.kind === "reading" || step.kind === "importing"}
      description="Mailquilt suppresses the addresses in one column of the file. Only those addresses leave your computer; the rest of the file isn’t sent."
      finalFocus={finalFocus}
      formId={formId}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title="Import a CSV"
    >
      <form
        className="flex flex-col gap-5"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          act();
        }}
      >
        <input
          accept=".csv,text/csv"
          aria-label="CSV file"
          className="sr-only"
          onChange={(event) => {
            const [file] = event.currentTarget.files ?? [];
            event.currentTarget.value = "";

            if (file !== undefined) {
              read(file);
            }
          }}
          ref={picker}
          tabIndex={-1}
          type="file"
        />
        {body()}
      </form>
    </ActionDialog>
  );
};
