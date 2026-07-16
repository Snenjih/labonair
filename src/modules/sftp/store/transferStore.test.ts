import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTransferStore, type TransferJob } from "./transferStore";

// Reset store state between tests
beforeEach(() => {
  useTransferStore.setState({ jobs: [] });
});

function makeJob(id: string, status: TransferJob["status"] = "queued"): TransferJob {
  return {
    id,
    session_id: "sess-1",
    src_path: "/src/file.txt",
    dest_path: "/dest/file.txt",
    direction: "upload",
    status,
    bytes_total: 1000,
    bytes_transferred: 0,
    speed_bps: 0,
    skipped_count: 0,
  };
}

describe("addJob", () => {
  it("adds a job to an empty list", () => {
    useTransferStore.getState().addJob(makeJob("job-1"));
    expect(useTransferStore.getState().jobs).toHaveLength(1);
  });

  it("prepends new jobs (newest first)", () => {
    useTransferStore.getState().addJob(makeJob("job-1"));
    useTransferStore.getState().addJob(makeJob("job-2"));
    const { jobs } = useTransferStore.getState();
    expect(jobs[0].id).toBe("job-2");
    expect(jobs[1].id).toBe("job-1");
  });
});

describe("updateJob", () => {
  it("merges updated fields into the existing job", () => {
    useTransferStore.getState().addJob(makeJob("job-1"));
    useTransferStore.getState().updateJob({
      ...makeJob("job-1", "running"),
      bytes_transferred: 500,
    });
    const job = useTransferStore.getState().jobs.find((j) => j.id === "job-1");
    expect(job?.status).toBe("running");
    expect(job?.bytes_transferred).toBe(500);
  });

  it("does not affect other jobs", () => {
    useTransferStore.getState().addJob(makeJob("job-1"));
    useTransferStore.getState().addJob(makeJob("job-2"));
    useTransferStore.getState().updateJob({ ...makeJob("job-1", "completed") });
    const job2 = useTransferStore.getState().jobs.find((j) => j.id === "job-2");
    expect(job2?.status).toBe("queued");
  });
});

describe("removeJob", () => {
  it("removes a job by id", () => {
    useTransferStore.getState().addJob(makeJob("job-1"));
    useTransferStore.getState().addJob(makeJob("job-2"));
    useTransferStore.getState().removeJob("job-1");
    const { jobs } = useTransferStore.getState();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("job-2");
  });

  it("does nothing when job not found", () => {
    useTransferStore.getState().addJob(makeJob("job-1"));
    useTransferStore.getState().removeJob("non-existent");
    expect(useTransferStore.getState().jobs).toHaveLength(1);
  });
});

describe("clearCompleted", () => {
  it("removes completed and cancelled jobs", () => {
    useTransferStore.getState().addJob(makeJob("j1", "completed"));
    useTransferStore.getState().addJob(makeJob("j2", "cancelled"));
    useTransferStore.getState().addJob(makeJob("j3", "running"));
    useTransferStore.getState().addJob(makeJob("j4", "queued"));
    useTransferStore.getState().clearCompleted();
    const { jobs } = useTransferStore.getState();
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.id)).toContain("j3");
    expect(jobs.map((j) => j.id)).toContain("j4");
  });

  it("keeps failed jobs", () => {
    useTransferStore.getState().addJob(makeJob("j1", { failed: "connection lost" }));
    useTransferStore.getState().clearCompleted();
    expect(useTransferStore.getState().jobs).toHaveLength(1);
  });

  it("handles empty list gracefully", () => {
    useTransferStore.getState().clearCompleted();
    expect(useTransferStore.getState().jobs).toHaveLength(0);
  });
});

describe("cancelJob", () => {
  it("calls invoke with cancel_transfer command", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await useTransferStore.getState().cancelJob("job-1");
    expect(invoke).toHaveBeenCalledWith("cancel_transfer", { jobId: "job-1" });
  });
});
