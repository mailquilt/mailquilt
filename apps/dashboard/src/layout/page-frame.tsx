/**
 * The area a signed-in page's content sits in, beside the sidebar: full
 * width up to 80rem, with the page's padding. `TablePage` and the form pages
 * share it, so they line up.
 */
export const PageFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-[80rem] px-4 pt-6 pb-12 sm:px-6 md:px-10 md:pt-10">
    {children}
  </div>
);
