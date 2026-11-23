import { PageFrame } from "./page-frame.tsx";
import { PageHeader } from "./page-header.tsx";

/**
 * A signed-in page built around a table: its header (title, what it holds
 * and its main actions) above, and the table below at full width.
 */
export const TablePage = ({
  actions,
  children,
  description,
  title,
  titleDetail,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
  titleDetail?: string;
}) => (
  <PageFrame>
    <PageHeader
      actions={actions}
      description={description}
      title={title}
      titleDetail={titleDetail}
    />
    {children}
  </PageFrame>
);
