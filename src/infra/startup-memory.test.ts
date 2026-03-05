import { describe, expect, it } from "vitest";
import {
  assessGatewayStartupMemory,
  formatGatewayMemoryError,
  formatGatewayMemoryWarning,
  GATEWAY_MIN_MEMORY_BYTES,
  GATEWAY_RECOMMENDED_MEMORY_BYTES,
} from "./startup-memory.js";

const MIB = 1024 ** 2;

describe("startup memory guard", () => {
  it("returns error when effective memory is below minimum", async () => {
    const assessment = await assessGatewayStartupMemory({
      hostMemoryBytes: 700 * MIB,
      cgroupMemoryBytes: null,
    });

    expect(assessment.status).toBe("error");
    expect(assessment.source).toBe("host");
    expect(formatGatewayMemoryError(assessment)).toContain("Insufficient memory");
    expect(formatGatewayMemoryError(assessment)).toContain("Minimum required");
  });

  it("returns warning when effective memory is below recommended but above minimum", async () => {
    const assessment = await assessGatewayStartupMemory({
      hostMemoryBytes: GATEWAY_MIN_MEMORY_BYTES + 128 * MIB,
      cgroupMemoryBytes: null,
    });

    expect(assessment.status).toBe("warn");
    expect(formatGatewayMemoryWarning(assessment)).toContain("below the recommended level");
  });

  it("uses cgroup limit when lower than host memory", async () => {
    const assessment = await assessGatewayStartupMemory({
      hostMemoryBytes: 8 * GATEWAY_RECOMMENDED_MEMORY_BYTES,
      cgroupMemoryBytes: 900 * MIB,
    });

    expect(assessment.status).toBe("error");
    expect(assessment.source).toBe("cgroup");
  });

  it("returns ok at or above recommended memory", async () => {
    const assessment = await assessGatewayStartupMemory({
      hostMemoryBytes: GATEWAY_RECOMMENDED_MEMORY_BYTES,
      cgroupMemoryBytes: null,
    });

    expect(assessment.status).toBe("ok");
    expect(assessment.source).toBe("host");
  });
});
