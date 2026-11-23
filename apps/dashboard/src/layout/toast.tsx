import { Toast, useKumoToastManager } from "@cloudflare/kumo";

import { WarningCircleIcon } from "../icons/icons.tsx";

const DoneBlock = () => <span aria-hidden="true" className="mq-done-block" />;

const ProblemMark = () => (
  <WarningCircleIcon
    aria-hidden="true"
    className="mt-0.5 shrink-0 text-kumo-danger"
    size={18}
  />
);

const ToastBody = ({
  className,
  mark,
}: {
  className?: string;
  mark: React.ReactNode;
}) => (
  <div className={`flex gap-3 ${className ?? ""}`}>
    {mark}
    <div className="flex min-w-0 flex-col gap-0.5">
      <Toast.Title className="text-base leading-5 font-semibold text-balance text-kumo-strong" />
      <Toast.Description className="text-sm leading-4.5 text-pretty text-kumo-subtle empty:hidden" />
    </div>
  </div>
);

const ConfirmationBody = () => <ToastBody mark={<DoneBlock />} />;

const ProblemBody = () => (
  <ToastBody className="mq-lasting-toast" mark={<ProblemMark />} />
);

interface ToastMessage {
  readonly description?: string;
  readonly title: string;
}

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
    add: ({ description, title }: ToastMessage) =>
      toasts.add({ content: <ConfirmationBody />, description, title }),
  };
};

/**
 * A problem that lasts until something else clears it, such as the API being
 * unreachable: the same toast with a warning mark, and no timeout. There is
 * one per `id`; showing it again changes its words in place, and `clear`
 * removes it.
 */
export const useProblemToast = (id: string) => {
  const toasts = useKumoToastManager();

  const showing = toasts.toasts.some(
    (toast) => toast.id === id && toast.transitionStatus !== "ending"
  );

  return {
    clear: () => {
      if (showing) {
        toasts.close(id);
      }
    },
    show: ({ description, title }: ToastMessage) => {
      if (showing) {
        toasts.update(id, { description, title });

        return;
      }

      toasts.add({
        content: <ProblemBody />,
        description,
        id,
        timeout: 0,
        title,
      });
    },
  };
};
