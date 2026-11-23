import { Toast, useKumoToastManager } from "@cloudflare/kumo";

/** The "done" mark: the logo's block settling onto its dashed slot (`.mq-done-block` in styles.css). */
export const DoneBlock = () => (
  <span aria-hidden="true" className="mq-done-block" />
);

const ConfirmationBody = () => (
  <div className="flex gap-3">
    <DoneBlock />
    <div className="flex min-w-0 flex-col gap-0.5">
      <Toast.Title className="text-base leading-5 font-semibold text-balance text-kumo-strong" />
      <Toast.Description className="text-sm leading-4.5 text-pretty text-kumo-subtle empty:hidden" />
    </div>
  </div>
);

/**
 * Confirms something that's done and leaves you on the page, such as a save.
 * Kumo's toast system keeps the stacking, swipe, pause on hover and the
 * announcement to screen readers; the content is the done mark, a strong
 * title and at most one quiet line. It has no close button: it leaves on its
 * own.
 */
export const useConfirmationToast = () => {
  const toasts = useKumoToastManager();

  return {
    add: ({ description, title }: { description?: string; title: string }) =>
      toasts.add({ content: <ConfirmationBody />, description, title }),
  };
};
