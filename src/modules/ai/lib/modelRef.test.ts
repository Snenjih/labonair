import { describe, expect, it } from "vitest";
import {
  autoName,
  makeModelRef,
  parseModelRef,
  renameForDuplicates,
  resolveInstance,
} from "./modelRef";
import type { ProviderInstance } from "../config";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inst(id: string, providerId: "openai" | "anthropic" | "google", name?: string): ProviderInstance {
  return { id, providerId, name: name ?? providerId };
}

// ─── parseModelRef ────────────────────────────────────────────────────────────

describe("parseModelRef", () => {
  it("parses a bare model id", () => {
    expect(parseModelRef("gpt-4o")).toEqual({ modelDefId: "gpt-4o", instanceId: null });
  });

  it("parses a model id with instance", () => {
    expect(parseModelRef("gpt-4o@my-instance")).toEqual({
      modelDefId: "gpt-4o",
      instanceId: "my-instance",
    });
  });

  it("uses the last @ when multiple @ signs are present", () => {
    const result = parseModelRef("org@model@instance");
    expect(result.modelDefId).toBe("org@model");
    expect(result.instanceId).toBe("instance");
  });
});

// ─── makeModelRef ─────────────────────────────────────────────────────────────

describe("makeModelRef", () => {
  it("returns bare model id when no instance", () => {
    expect(makeModelRef("gpt-4o")).toBe("gpt-4o");
  });

  it("returns bare model id when instance is null", () => {
    expect(makeModelRef("gpt-4o", null)).toBe("gpt-4o");
  });

  it("combines model id and instance id with @", () => {
    expect(makeModelRef("gpt-4o", "inst1")).toBe("gpt-4o@inst1");
  });
});

// ─── resolveInstance ──────────────────────────────────────────────────────────

describe("resolveInstance", () => {
  const instances = [
    inst("id-1", "openai", "openai"),
    inst("id-2", "openai", "openai2"),
    inst("id-3", "anthropic", "anthropic"),
  ];

  it("finds instance by exact id", () => {
    const result = resolveInstance("openai", "id-2", instances);
    expect(result?.id).toBe("id-2");
  });

  it("returns first instance for provider when instanceId is null", () => {
    const result = resolveInstance("openai", null, instances);
    expect(result?.id).toBe("id-1");
  });

  it("returns null when instanceId not found", () => {
    expect(resolveInstance("openai", "missing", instances)).toBeNull();
  });

  it("returns null when provider has no instances", () => {
    expect(resolveInstance("google", null, instances)).toBeNull();
  });
});

// ─── autoName ─────────────────────────────────────────────────────────────────

describe("autoName", () => {
  it("returns bare providerId when no existing instances", () => {
    expect(autoName("openai", [])).toBe("openai");
  });

  it("returns providerId+2 when one instance already exists", () => {
    expect(autoName("openai", [inst("id-1", "openai")])).toBe("openai2");
  });

  it("returns providerId+3 when two instances already exist", () => {
    const existing = [inst("id-1", "openai"), inst("id-2", "openai")];
    expect(autoName("openai", existing)).toBe("openai3");
  });

  it("ignores instances of other providers", () => {
    const existing = [inst("id-1", "anthropic"), inst("id-2", "anthropic")];
    expect(autoName("openai", existing)).toBe("openai");
  });
});

// ─── renameForDuplicates ──────────────────────────────────────────────────────

describe("renameForDuplicates", () => {
  it("does not rename when there is only one instance of each provider", () => {
    const instances = [inst("id-1", "openai", "openai"), inst("id-2", "anthropic", "anthropic")];
    const result = renameForDuplicates(instances);
    expect(result[0].name).toBe("openai");
    expect(result[1].name).toBe("anthropic");
  });

  it("renames duplicate default-named instances numerically", () => {
    const instances = [
      inst("id-1", "openai", "openai"),
      inst("id-2", "openai", "openai"),
    ];
    const result = renameForDuplicates(instances);
    expect(result[0].name).toBe("openai1");
    expect(result[1].name).toBe("openai2");
  });

  it("does not rename custom-named instances", () => {
    const instances = [
      inst("id-1", "openai", "My GPT Key"),
      inst("id-2", "openai", "Work Key"),
    ];
    const result = renameForDuplicates(instances);
    expect(result[0].name).toBe("My GPT Key");
    expect(result[1].name).toBe("Work Key");
  });

  it("renames instances with auto-generated numeric names", () => {
    const instances = [
      inst("id-1", "openai", "openai1"),
      inst("id-2", "openai", "openai2"),
    ];
    const result = renameForDuplicates(instances);
    expect(result[0].name).toBe("openai1");
    expect(result[1].name).toBe("openai2");
  });
});
