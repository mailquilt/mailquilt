/**
 * The padded area a signed-in page's content sits in, inside the page
 * block: one gutter for the whole page (`--gutter`, which edge-to-edge
 * tables and rows line up with), full width up to 96rem. `TablePage` and the
 * form pages share it, so they line up.
 */
export const PageFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="mq-page-body mx-auto w-full max-w-[96rem] pt-9 pb-16 max-lg:pt-7 max-sm:pt-5 max-sm:pb-12">
    {children}
  </div>
);
