import { useId } from "react";

/**
 * One part of a settings or form page: what it's for on the left, its
 * fields on the right, a hairline between parts. One column below 1024px.
 * `footer`, such as a part's own Save button, sits under its fields at
 * their right edge, as every form's and dialog's action does.
 */
export const SettingsSection = ({
  about,
  children,
  footer,
  title,
}: {
  about: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  title: string;
}) => {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="mq-section">
      <div>
        <h2
          className="font-display text-display-xs font-semibold text-kumo-strong"
          id={headingId}
        >
          {title}
        </h2>
        <p className="mt-1.5 max-w-[30ch] text-sm leading-5 text-pretty text-kumo-subtle max-lg:max-w-[60ch]">
          {about}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {children}
        {footer === undefined ? null : (
          <div className="flex justify-end">{footer}</div>
        )}
      </div>
    </section>
  );
};
