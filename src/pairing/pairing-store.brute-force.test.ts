import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resolveOAuthDir } from "../config/paths.js";
import { withEnvAsync } from "../test-utils/env.js";
import {
  _resetPairingApproveState,
  approveChannelPairingCode,
  upsertChannelPairingRequest,
} from "./pairing-store.js";

let fixtureRoot = "";
let caseId = 0;

beforeAll(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-brute-force-test-"));
});

afterAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true }).catch(() => {});
});

afterEach(() => {
  _resetPairingApproveState();
});

function makeEnv() {
  caseId += 1;
  const dir = path.join(fixtureRoot, `case-${caseId}`);
  return {
    OPENCLAW_STATE_DIR: dir,
    OPENCLAW_OAUTH_DIR: resolveOAuthDir({} as NodeJS.ProcessEnv, dir),
  };
}

describe("pairing brute-force protection (#16458)", () => {
  it("blocks approval attempts after 10 consecutive failures", async () => {
    const env = makeEnv();
    await withEnvAsync(env, async () => {
      // Create a pairing request
      const { code } = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "user-123",
        env,
      });
      expect(code).toBeTruthy();

      // Simulate 10 wrong guesses
      for (let i = 0; i < 10; i++) {
        const result = await approveChannelPairingCode({
          channel: "telegram",
          code: "WRONGCODE",
          env,
        });
        expect(result).toBeNull();
      }

      // 11th attempt with CORRECT code should be blocked (cooldown active)
      const blocked = await approveChannelPairingCode({
        channel: "telegram",
        code,
        env,
      });
      expect(blocked).toBeNull();
    });
  });

  it("expires individual request after 5 failed guesses against it", async () => {
    const env = makeEnv();
    await withEnvAsync(env, async () => {
      const { code } = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "user-456",
        env,
      });
      expect(code).toBeTruthy();

      // 5 wrong guesses (per-request threshold)
      for (let i = 0; i < 5; i++) {
        await approveChannelPairingCode({
          channel: "telegram",
          code: "BADGUESS" + i,
          env,
        });
      }

      // The correct code should now fail because the request was expired
      const result = await approveChannelPairingCode({
        channel: "telegram",
        code,
        env,
      });
      expect(result).toBeNull();
    });
  });

  it("allows approval before reaching failure threshold", async () => {
    const env = makeEnv();
    await withEnvAsync(env, async () => {
      const { code } = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "user-789",
        env,
      });
      expect(code).toBeTruthy();

      // A few wrong guesses (under threshold)
      for (let i = 0; i < 3; i++) {
        await approveChannelPairingCode({
          channel: "telegram",
          code: "WRONG" + i,
          env,
        });
      }

      // Correct code should still work
      const result = await approveChannelPairingCode({
        channel: "telegram",
        code,
        env,
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe("user-789");
    });
  });

  it("resets failure count after successful approval", async () => {
    const env = makeEnv();
    await withEnvAsync(env, async () => {
      // First request
      const { code: code1 } = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "user-first",
        env,
      });

      // 4 failures (under per-request threshold of 5)
      for (let i = 0; i < 4; i++) {
        await approveChannelPairingCode({
          channel: "telegram",
          code: "WRONG" + i,
          env,
        });
      }

      // Approve correctly — resets counter
      const approved = await approveChannelPairingCode({
        channel: "telegram",
        code: code1,
        env,
      });
      expect(approved).not.toBeNull();

      // Second request — should work even after previous failures
      const { code: code2 } = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "user-second",
        env,
      });

      const result = await approveChannelPairingCode({
        channel: "telegram",
        code: code2,
        env,
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe("user-second");
    });
  });

  it("isolates rate limiting between channels", async () => {
    const env = makeEnv();
    await withEnvAsync(env, async () => {
      const { code: telegramCode } = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "tg-user",
        env,
      });
      const { code: discordCode } = await upsertChannelPairingRequest({
        channel: "discord",
        id: "dc-user",
        env,
      });

      // Exhaust telegram rate limit
      for (let i = 0; i < 10; i++) {
        await approveChannelPairingCode({
          channel: "telegram",
          code: "WRONG" + i,
          env,
        });
      }

      // Telegram blocked
      const tgResult = await approveChannelPairingCode({
        channel: "telegram",
        code: telegramCode,
        env,
      });
      expect(tgResult).toBeNull();

      // Discord should still work
      const dcResult = await approveChannelPairingCode({
        channel: "discord",
        code: discordCode,
        env,
      });
      expect(dcResult).not.toBeNull();
      expect(dcResult!.id).toBe("dc-user");
    });
  });
});
