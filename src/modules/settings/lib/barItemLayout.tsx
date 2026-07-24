import { Fragment, type ReactNode } from "react";

export interface DividerCluster {
  key: string;
  node: ReactNode;
  /** Items of the same category never get a divider between them, even when
   *  adjacent — a divider only appears at a boundary between two different
   *  categories (e.g. the AI cluster vs. everything else, or panel toggles
   *  vs. badges). */
  category: string;
}

/**
 * Inserts a divider only between two adjacent clusters of *different*
 * categories — never between clusters of the same category, and never a
 * leading/trailing/dangling divider next to an empty bucket. Shared between
 * the titlebar and statusbar bar-item renderers (different divider styling,
 * same insertion rule).
 */
export function withDividers(clusters: DividerCluster[], dividerClassName: string): ReactNode[] {
  const out: ReactNode[] = [];
  clusters.forEach((cluster, i) => {
    const prev = clusters[i - 1];
    if (prev && prev.category !== cluster.category) {
      out.push(<span key={`divider-before-${cluster.key}`} className={dividerClassName} />);
    }
    out.push(<Fragment key={cluster.key}>{cluster.node}</Fragment>);
  });
  return out;
}
