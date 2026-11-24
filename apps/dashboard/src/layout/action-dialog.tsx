import { Drawer } from "@base-ui/react/drawer";
import { Button, LayerDialog } from "@cloudflare/kumo";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const DESKTOP = "(min-width: 640px)";

const subscribeToDesktop = (onChange: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
};

const isDesktopNow = () => window.matchMedia(DESKTOP).matches;

const isDesktopWhilePrerendering = () => false;

const DISMISSALS_HELD_WHILE_BUSY = new Set([
  "close-press",
  "close-watcher",
  "escape-key",
  "outside-press",
  "swipe",
  "trigger-press",
]);

const actionOf = (formId: string) =>
  document.querySelector<HTMLButtonElement>(
    `button[form="${CSS.escape(formId)}"]`
  );

const SHEET_MOTION =
  "duration-420 ease-sheet data-[ending-style]:duration-260 data-[swiping]:duration-0 motion-reduce:transition-none";

/**
 * A dialog's open state and the `key` to give it. The key moves on once a
 * close has finished, so the next opening is a fresh mount, with its form
 * empty, that is still closed when it mounts and so animates in. Moving the
 * key in the same render that opens it would mount the dialog already open,
 * and it would appear without its entrance; keying it by `open` would
 * unmount it as it closes, without its exit. The key is this dialog's own,
 * so dialogs side by side never share one: React can't tell siblings with
 * the same key apart, and would leave a closed one on the page, invisible
 * and catching clicks. `openOnMount` opens it by
 * itself, just after the page draws, with its entrance.
 */
export const useDialog = (openOnMount = false) => {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  const id = useId();
  const opensItself = useRef(openOnMount);

  // WARNING: a dialog that is open when it first mounts appears without its entrance, so one that opens by itself opens just after.
  useEffect(() => {
    if (!opensItself.current) {
      return;
    }

    const frame = requestAnimationFrame(() => setOpen(true));

    return () => cancelAnimationFrame(frame);
  }, []);

  return {
    handleExited: () => setOpening((current) => current + 1),
    handleOpenChange: setOpen,
    key: `${id}${opening}`,
    open,
    setOpen,
  };
};

interface ActionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: React.ReactNode;
  /** The one thing the dialog does, such as "Create organization". */
  readonly actionLabel: string;
  /** The button that closes it without acting. @default "Cancel" */
  readonly dismissLabel?: string;
  /** The `id` of the form in `children` that the action submits. */
  readonly formId: string;
  /** While the action runs: the button shows progress and nothing closes the dialog. */
  readonly busy: boolean;
  /** The action can't be undone, such as a delete: its button is drawn in the danger colour, and a click outside doesn't close it. */
  readonly destructive?: boolean;
  /** On desktop, focused once the dialog has opened, such as its only field. */
  readonly initialFocus?: React.RefObject<HTMLElement | null>;
  /** Focused when it closes, such as the control that opened it, also when it opened by itself. */
  readonly finalFocus?: React.RefObject<HTMLElement | null>;
  /** Called once a close has finished: `useDialog`'s `handleExited`. */
  readonly onExited?: () => void;
  readonly children: React.ReactNode;
}

/**
 * A dialog with one action and a button that closes it, Cancel unless told
 * otherwise. From 640px wide, Kumo's own breakpoint, it is Kumo's
 * `LayerDialog`, centred, over the dark scrim (`styles.css`): the title and
 * the content on a card set in a frame, with Cancel at the frame's far left
 * and the action at its far right; a destructive one is `LayerDialog.Alert`.
 * On phones it is a sheet from the bottom edge, rounded at the top, with the
 * action above Cancel, both full width and clear of the home indicator, and
 * closed by swiping down. `LayerDialog`'s own phone layout keeps the desktop
 * card inside its drawer, so the sheet is built on Base UI's Drawer. On
 * phones the sheet itself takes focus as it opens, so the keyboard doesn't
 * cover it mid-slide; the person taps the field. Give it `useDialog`'s `key`
 * and `handleExited` so it animates in and out and starts fresh each time.
 */
export const ActionDialog = ({
  actionLabel,
  busy,
  children,
  description,
  destructive = false,
  dismissLabel = "Cancel",
  finalFocus,
  formId,
  initialFocus,
  onExited,
  onOpenChange,
  open,
  title,
}: ActionDialogProps) => {
  const isDesktopWidth = useSyncExternalStore(
    subscribeToDesktop,
    isDesktopNow,
    isDesktopWhilePrerendering
  );

  const [openedOnDesktop, setOpenedOnDesktop] = useState<boolean | null>(null);

  // WARNING: switching between the dialog and the sheet re-creates the form, losing what was typed, so a dialog keeps the layout it opened in until it has closed, even if the screen turns.
  if (open && openedOnDesktop === null) {
    setOpenedOnDesktop(isDesktopWidth);
  }

  const isDesktop = openedOnDesktop ?? isDesktopWidth;

  const finishClosing = () => {
    setOpenedOnDesktop(null);
    onExited?.();
  };

  const insideDialog = useRef<HTMLDivElement>(null);

  // WARNING: Kumo's loading Button disables itself, and the browser then drops keyboard focus to the page behind the dialog, a moment after this effect runs. So focus moves off the action onto the dialog first, while busy, and back to the action afterwards if nothing else took it (a failure, or Send again).
  useEffect(() => {
    const node = insideDialog.current?.closest<HTMLElement>(
      '[role="dialog"], [role="alertdialog"]'
    );

    if (!node) {
      return;
    }

    const action = actionOf(formId);

    if (
      busy &&
      (document.activeElement === action ||
        !node.contains(document.activeElement))
    ) {
      node.focus();
    }

    if (!busy && document.activeElement === node) {
      action?.focus();
    }
  }, [busy, formId]);

  if (isDesktop) {
    // WARNING: LayerDialog focuses its own frame as it opens and takes no initialFocus or finalFocus, so focus moves once the open or close has finished.
    const settle = (isOpen: boolean) => {
      (isOpen ? initialFocus : finalFocus)?.current?.focus();

      if (!isOpen) {
        finishClosing();
      }
    };

    const Root = destructive ? LayerDialog.Alert : LayerDialog.Root;

    return (
      <Root
        dismissDisabled={busy}
        onOpenChange={onOpenChange}
        onOpenChangeComplete={settle}
        open={open}
      >
        <LayerDialog.Content verticalAlign="center">
          <LayerDialog.Title>
            <span className="block font-display text-display-sm font-semibold text-balance break-words text-kumo-strong">
              {title}
            </span>
          </LayerDialog.Title>
          <LayerDialog.Description>
            <span className="block text-base text-pretty break-words">
              {description}
            </span>
          </LayerDialog.Description>
          <LayerDialog.Body>
            <div className="mq-dialog-body" ref={insideDialog}>
              {children}
            </div>
          </LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={dismissLabel}>
            <LayerDialog.Action
              form={formId}
              loading={busy}
              type="submit"
              variant={destructive ? "destructive" : "primary"}
            >
              {actionLabel}
            </LayerDialog.Action>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </Root>
    );
  }

  return (
    <Drawer.Root
      disablePointerDismissal={busy}
      onOpenChange={(nextOpen, details) => {
        if (
          !nextOpen &&
          busy &&
          DISMISSALS_HELD_WHILE_BUSY.has(details.reason)
        ) {
          details.cancel();

          return;
        }

        onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          finishClosing();
        }
      }}
      open={open}
    >
      <Drawer.Portal>
        <Drawer.Backdrop
          className={`fixed inset-0 z-60 bg-(--mq-scrim) transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 ${SHEET_MOTION}`}
        />
        <Drawer.Viewport
          className="fixed inset-0 z-61 flex items-end"
          data-base-ui-swipe-ignore={busy ? "" : undefined}
        >
          <Drawer.Popup
            className={`flex max-h-[calc(100svh-3rem)] w-full [transform:translate3d(0,var(--drawer-swipe-movement-y,0px),0)] flex-col rounded-t-2xl bg-kumo-base shadow-sheet transition-transform outline-none data-[ending-style]:[transform:translate3d(0,100%,0)] data-[starting-style]:[transform:translate3d(0,100%,0)] ${SHEET_MOTION}`}
            finalFocus={finalFocus}
            ref={insideDialog}
          >
            <span
              aria-hidden="true"
              className="mx-auto mt-2 block h-1 w-9 shrink-0 rounded-full bg-kumo-line"
            />
            <Drawer.Content className="flex min-h-0 flex-col overflow-y-auto px-4 pt-3.5 pb-2">
              <Drawer.Title className="font-display text-display-sm font-semibold text-balance break-words text-kumo-strong">
                {title}
              </Drawer.Title>
              <Drawer.Description className="mt-1.5 text-base text-pretty break-words text-kumo-subtle">
                {description}
              </Drawer.Description>
              <div className="mt-5 empty:hidden has-[>form:empty]:hidden">
                {children}
              </div>
            </Drawer.Content>
            <div className="flex flex-col gap-2 px-4 pt-3 pb-sheet-bottom">
              <Button
                className="max-sm:w-full max-sm:justify-center"
                form={formId}
                loading={busy}
                type="submit"
                variant={destructive ? "destructive" : "primary"}
              >
                {actionLabel}
              </Button>
              <Drawer.Close
                disabled={busy}
                render={
                  <Button
                    className="max-sm:w-full max-sm:justify-center"
                    variant="secondary"
                  />
                }
              >
                {dismissLabel}
              </Drawer.Close>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
