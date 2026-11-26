import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}

/** One labelled region per topic, so screen-reader users can jump between them. */
export function Section({ id, title, description, aside, children }: SectionProps): React.JSX.Element {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description ? <p className="card-description">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function PendingBadge({ children }: { children: ReactNode }): React.JSX.Element {
  return <span className="badge badge-pending">{children}</span>;
}
