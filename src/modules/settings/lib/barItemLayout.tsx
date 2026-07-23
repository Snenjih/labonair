import { Fragment, type ReactNode } from "react";

export interface DividerCluster {
  key: string;
  node: ReactNode;
}

/**
 * Inserts a divider between adjacent visible clusters only — never a
 * leading/trailing/dangling divider next to an empty bucket. Shared between
 * the titlebar and statusbar bar-item renderers (different divider styling,
 * same insertion rule).
 */
export function withDividers(clusters: DividerCluster[], dividerClassName: string): ReactNode[] {
  const out: ReactNode[] = [];
  clusters.forEach((cluster, i) => {
    if (i > 0) out.push(<span key={`divider-before-${cluster.key}`} className={dividerClassName} />);
    out.push(<Fragment key={cluster.key}>{cluster.node}</Fragment>);
  });
  return out;
}
