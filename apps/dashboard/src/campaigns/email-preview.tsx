import { useEffect, useRef } from "react";

// WARNING: the frame may read its own document (allow-same-origin) so the page can size it to the email and stop its links, but it never runs the email's scripts, submits its forms or navigates the page (docs/security.md).
const SANDBOX = "allow-same-origin";

// WARNING: a click in the frame comes from the frame's own window, whose Element isn't this page's, so it's checked against the frame's.
const stopLinksIn =
  (frame: Window & typeof globalThis) => (event: MouseEvent) => {
    if (
      event.target instanceof frame.Element &&
      event.target.closest("a[href], area[href]") !== null
    ) {
      event.preventDefault();
    }
  };

// WARNING: the frame is shrunk to nothing before it's measured, or an email whose page is set to 100% height would keep whatever height it had; it happens within one task, so it's never drawn shrunk.
const fitToContent = (frame: HTMLIFrameElement) => {
  const page = frame.contentDocument?.documentElement;

  if (page === undefined) {
    return;
  }

  frame.style.height = "0px";
  frame.style.height = `${page.scrollHeight}px`;
};

/**
 * The email as it arrives, in a frame that runs none of its scripts, on the
 * recessed fill. It keeps its own colours in dark mode, as an inbox shows it,
 * and its links don't open. With `fit`, the frame is as tall as the email and
 * follows its width; otherwise it has the given height and scrolls inside.
 */
export const EmailPreview = ({
  className = "",
  fit = false,
  html,
}: {
  className?: string;
  fit?: boolean;
  html: string;
}) => {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const element = frame.current;

    if (!fit || element === null) {
      return;
    }

    let width = element.clientWidth;

    // WARNING: only a change of width reflows the email; fitting changes the height, which must not fit it again.
    const resized = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        fitToContent(element);
      }
    });

    resized.observe(element);

    return () => resized.disconnect();
  }, [fit]);

  return (
    <div className="rounded-xl bg-kumo-recessed p-2 ring ring-kumo-hairline">
      <iframe
        className={`block w-full rounded bg-white ${className}`}
        onLoad={(event) => {
          const loaded = event.currentTarget;

          // SAFETY: a frame's window has the same globals as this page's, its own Element among them.
          const window = loaded.contentWindow as
            | (Window & typeof globalThis)
            | null;

          if (window !== null) {
            window.document.addEventListener("click", stopLinksIn(window));
          }

          if (fit) {
            fitToContent(loaded);
          }
        }}
        ref={frame}
        sandbox={SANDBOX}
        srcDoc={html}
        title="Preview of the email"
      />
    </div>
  );
};
