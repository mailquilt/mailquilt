/** The column every signed-in page's content sits in, beside the sidebar. */
export const PageColumn = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-[50rem] px-6 py-10 md:px-12 md:py-16">
    {children}
  </div>
);
