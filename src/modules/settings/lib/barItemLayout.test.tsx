import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { withDividers } from "./barItemLayout";

/** Counts how many entries in the returned node list are divider spans
 *  (identified by className) — avoids pulling in a DOM rendering library
 *  just to test this pure list-shaping function. */
function countDividers(nodes: ReturnType<typeof withDividers>, dividerClassName: string): number {
  return nodes.filter((n) => {
    const el = n as ReactElement<{ className?: string }>;
    return el?.props?.className === dividerClassName;
  }).length;
}

describe("withDividers", () => {
  it("renders nothing for an empty cluster list", () => {
    expect(withDividers([], "divider")).toEqual([]);
  });

  it("renders a single cluster with no divider", () => {
    const nodes = withDividers([{ key: "a", node: <span>A</span> }], "divider");
    expect(nodes).toHaveLength(1);
    expect(countDividers(nodes, "divider")).toBe(0);
  });

  it("inserts exactly one divider between two visible clusters", () => {
    const nodes = withDividers(
      [
        { key: "a", node: <span>A</span> },
        { key: "b", node: <span>B</span> },
      ],
      "divider",
    );
    expect(nodes).toHaveLength(3); // cluster, divider, cluster
    expect(countDividers(nodes, "divider")).toBe(1);
  });

  it("inserts n-1 dividers for n clusters", () => {
    const nodes = withDividers(
      [
        { key: "a", node: <span>A</span> },
        { key: "b", node: <span>B</span> },
        { key: "c", node: <span>C</span> },
      ],
      "divider",
    );
    expect(countDividers(nodes, "divider")).toBe(2);
  });
});
