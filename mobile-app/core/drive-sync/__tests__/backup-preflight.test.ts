import { DriveTimeoutError } from "../drive-errors";
import { PREFLIGHT_PROBE_TIMEOUT_MS, runPreflightWith, type PreflightDeps } from "../backup-preflight";

function deps(overrides: Partial<PreflightDeps> = {}) {
  const isOnline = jest.fn(async () => true as boolean | null);
  const getToken = jest.fn(async () => "token");
  const probe = jest.fn(async (_timeoutMs: number) => undefined);
  return { isOnline, getToken, probe, ...overrides } as PreflightDeps & {
    isOnline: jest.Mock;
    getToken: jest.Mock;
    probe: jest.Mock;
  };
}

describe("runPreflightWith", () => {
  it("passes when there is a connection, a token and the light Drive request answers", async () => {
    const d = deps();
    await expect(runPreflightWith(d)).resolves.toBeNull();
    expect(d.probe).toHaveBeenCalledWith(PREFLIGHT_PROBE_TIMEOUT_MS);
  });

  it("fails at once as 'offline' without asking for a token or touching Drive (airplane mode)", async () => {
    const d = deps({ isOnline: jest.fn(async () => false) });
    await expect(runPreflightWith(d)).resolves.toBe("offline");
    expect(d.getToken).not.toHaveBeenCalled();
    expect(d.probe).not.toHaveBeenCalled();
  });

  it("an unknown connection state does not block by itself", async () => {
    await expect(runPreflightWith(deps({ isOnline: jest.fn(async () => null) }))).resolves.toBeNull();
  });

  it("fails as 'auth' when no token can be obtained, and never calls Drive", async () => {
    const d = deps({ getToken: jest.fn(async () => Promise.reject(new Error("Sign in required"))) });
    await expect(runPreflightWith(d)).resolves.toBe("auth");
    expect(d.probe).not.toHaveBeenCalled();
  });

  it("reports a token failure caused by the network as 'offline', not as an account problem", async () => {
    const d = deps({ getToken: jest.fn(async () => Promise.reject(new Error("Network request failed"))) });
    await expect(runPreflightWith(d)).resolves.toBe("offline");
  });

  it("fails as 'offline' when the light request cannot connect", async () => {
    const d = deps({ probe: jest.fn(async () => Promise.reject(new Error("Network request failed"))) });
    await expect(runPreflightWith(d)).resolves.toBe("offline");
  });

  it("fails as 'unreachable' when the light request times out or Drive is down", async () => {
    await expect(runPreflightWith(deps({ probe: jest.fn(async () => Promise.reject(new DriveTimeoutError(6000))) }))).resolves.toBe("unreachable");
    await expect(runPreflightWith(deps({ probe: jest.fn(async () => Promise.reject(new Error("Drive API error (503): x"))) }))).resolves.toBe("unreachable");
  });

  it("fails as 'auth' when Drive rejects the credentials", async () => {
    const d = deps({ probe: jest.fn(async () => Promise.reject(new Error("Drive API error (401): x"))) });
    await expect(runPreflightWith(d)).resolves.toBe("auth");
  });

  it("lets an error that is not about reachability surface in the run itself", async () => {
    const d = deps({ probe: jest.fn(async () => Promise.reject(new Error("something odd"))) });
    await expect(runPreflightWith(d)).resolves.toBeNull();
  });
});
