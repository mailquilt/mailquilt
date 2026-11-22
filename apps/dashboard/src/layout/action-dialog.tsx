import { Drawer } from "@base-ui/react/drawer";
import { Button, LayerDialog } from "@cloudflare/kumo";
import { useSyncExternalStore } from "react";

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

const SHEET_MOTION =
  "duration-450 ease-sheet data-[swiping]:duration-0 motion-reduce:transition-none";

interface ActionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: React.ReactNode;
  /** The one thing the dialog does, such as "Create organization". */
  readonly actionLabel: string;
  /** The `id` of the form in `children` that the action submits. */
  readonly formId: string;
  /** While the action runs: the button shows progress and nothing closes the dialog. */
  readonly busy: boolean;
  /** The action can't be undone, such as a delete: its button is drawn in the danger colour. */
  readonly destructive?: boolean;
  /** On desktop, focused once the dialog has opened, such as its only field. */
  readonly initialFocus?: React.RefObject<HTMLElement | null>;
  /** On phones, focused when the sheet closes, such as the control that opened it. */
  readonly finalFocus?: React.RefObject<HTMLElement | null>;
  readonly children: React.ReactNode;
}

/**
 * A dialog with one action and Cancel. From 640px wide, Kumo's own
 * breakpoint, it is Kumo's
 * `LayerDialog`: the content on a raised card and the actions on the frame
 * around it, centred. On phones it is a sheet from the bottom edge: one
 * surface, the buttons full width where a thumb rests, clear of the home
 * indicator, and closed by swiping down. Kumo's own phone layout keeps the
 * desktop card inside the drawer, so the sheet is built on the same Base UI
 * Drawer instead. On phones the sheet itself takes focus as it opens, so the
 * keyboard doesn't cover it mid-slide; the person taps the field.
 */
export const ActionDialog = ({
  actionLabel,
  busy,
  children,
  description,
  destructive = false,
  finalFocus,
  formId,
  initialFocus,
  onOpenChange,
  open,
  title,
}: ActionDialogProps) => {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    isDesktopNow,
    isDesktopWhilePrerendering
  );

  if (isDesktop) {
    return (
      <LayerDialog.Root
        dismissDisabled={busy}
        onOpenChange={onOpenChange}
        onOpenChangeComplete={(isOpen) => {
          if (isOpen) {
            initialFocus?.current?.focus();
          }
        }}
        open={open}
      >
        <LayerDialog.Content size="sm" verticalAlign="center">
          <LayerDialog.Title>
            <span className="font-display text-display-sm font-semibold text-kumo-strong">
              {title}
            </span>
          </LayerDialog.Title>
          <LayerDialog.Description>{description}</LayerDialog.Description>
          <LayerDialog.Body>{children}</LayerDialog.Body>
          <LayerDialog.Actions dismissLabel="Cancel">
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
      </LayerDialog.Root>
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
      open={open}
    >
      <Drawer.Portal>
        <Drawer.Backdrop
          className={`fixed inset-0 bg-kumo-recessed opacity-80 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 ${SHEET_MOTION}`}
        />
        <Drawer.Viewport
          className="fixed inset-0 flex items-end"
          data-base-ui-swipe-ignore={busy ? "" : undefined}
        >
          <Drawer.Popup
            finalFocus={finalFocus}
            className={`flex max-h-[90dvh] w-full [transform:translate3d(0,var(--drawer-swipe-movement-y,0px),0)] flex-col rounded-t-2xl bg-kumo-base shadow-quilt-label transition-transform outline-none data-[ending-style]:[transform:translate3d(0,100%,0)] data-[starting-style]:[transform:translate3d(0,100%,0)] ${SHEET_MOTION}`}
          >
            <div aria-hidden="true" className="flex justify-center pt-2 pb-4">
              <span className="h-1 w-9 rounded-full bg-kumo-fill" />
            </div>
            <Drawer.Content className="flex min-h-0 flex-col overflow-y-auto px-5 pb-sheet-bottom">
              <Drawer.Title className="font-display text-display-sm font-semibold text-kumo-strong">
                {title}
              </Drawer.Title>
              <Drawer.Description className="mt-1.5 text-base text-(--mq-body)">
                {description}
              </Drawer.Description>
              <div className="mt-5">{children}</div>
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  className="h-11 w-full justify-center text-lg"
                  form={formId}
                  loading={busy}
                  size="lg"
                  type="submit"
                  variant={destructive ? "destructive" : "primary"}
                >
                  {actionLabel}
                </Button>
                <Drawer.Close
                  disabled={busy}
                  render={
                    <Button
                      className="h-11 w-full justify-center text-lg"
                      size="lg"
                      variant="ghost"
                    />
                  }
                >
                  Cancel
                </Drawer.Close>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
