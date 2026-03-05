import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessageMattermost } from "./send.js";

// --- Shared mock state ---
const mockRecord = vi.fn();
const mockConvertTables = vi.fn((s: string) => s);

const mockState = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({})),
  loadOutboundMediaFromUrl: vi.fn(),
  resolveMattermostAccount: vi.fn(() => ({
    accountId: "default",
    botToken: "bot-token",
    baseUrl: "https://mattermost.example.com",
  })),
  createMattermostClient: vi.fn(),
  createMattermostDirectChannel: vi.fn(),
  createMattermostPost: vi.fn(),
  fetchMattermostMe: vi.fn(),
  fetchMattermostUser: vi.fn(),
  fetchMattermostUserByUsername: vi.fn(),
  normalizeMattermostBaseUrl: vi.fn((input: string | undefined) => input?.trim() ?? ""),
  uploadMattermostFile: vi.fn(),
}));

vi.mock("openclaw/plugin-sdk/mattermost", () => ({
  loadOutboundMediaFromUrl: mockState.loadOutboundMediaFromUrl,
}));

vi.mock("./accounts.js", () => ({
  resolveMattermostAccount: mockState.resolveMattermostAccount,
}));

vi.mock("./client.js", () => ({
  createMattermostClient: mockState.createMattermostClient,
  createMattermostDirectChannel: mockState.createMattermostDirectChannel,
  createMattermostPost: mockState.createMattermostPost,
  fetchMattermostMe: mockState.fetchMattermostMe,
  fetchMattermostUser: mockState.fetchMattermostUser,
  fetchMattermostUserByUsername: mockState.fetchMattermostUserByUsername,
  normalizeMattermostBaseUrl: mockState.normalizeMattermostBaseUrl,
  uploadMattermostFile: mockState.uploadMattermostFile,
}));

vi.mock("../runtime.js", () => ({
  getMattermostRuntime: () => ({
    config: {
      loadConfig: mockState.loadConfig,
    },
    logging: {
      shouldLogVerbose: () => false,
      getChildLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    },
    channel: {
      text: {
        resolveMarkdownTableMode: () => "off",
        convertMarkdownTables: (text: string) => mockConvertTables(text),
        chunkMarkdownText: (s: string) => [s],
      },
      activity: {
        record: mockRecord,
      },
    },
  }),
}));

describe("sendMessageMattermost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.createMattermostClient.mockReturnValue({});
    mockState.createMattermostPost.mockResolvedValue({ id: "post-1" });
    mockState.uploadMattermostFile.mockResolvedValue({ id: "file-1" });
    mockState.createMattermostDirectChannel.mockResolvedValue({ id: "dm-channel-id" });
    mockState.fetchMattermostMe.mockResolvedValue({ id: "bot-id" });
  });

  it("uses provided cfg and skips runtime loadConfig", async () => {
    const providedCfg = {
      channels: {
        mattermost: {
          botToken: "provided-token",
        },
      },
    };

    await sendMessageMattermost("channel:town-square", "hello", {
      cfg: providedCfg as any,
      accountId: "work",
    });

    expect(mockState.loadConfig).not.toHaveBeenCalled();
    expect(mockState.resolveMattermostAccount).toHaveBeenCalledWith({
      cfg: providedCfg,
      accountId: "work",
    });
  });

  it("falls back to runtime loadConfig when cfg is omitted", async () => {
    const runtimeCfg = {
      channels: {
        mattermost: {
          botToken: "runtime-token",
        },
      },
    };
    mockState.loadConfig.mockReturnValueOnce(runtimeCfg);

    await sendMessageMattermost("channel:town-square", "hello");

    expect(mockState.loadConfig).toHaveBeenCalledTimes(1);
    expect(mockState.resolveMattermostAccount).toHaveBeenCalledWith({
      cfg: runtimeCfg,
      accountId: undefined,
    });
  });

  it("loads outbound media with trusted local roots before upload", async () => {
    mockState.loadOutboundMediaFromUrl.mockResolvedValueOnce({
      buffer: Buffer.from("media-bytes"),
      fileName: "photo.png",
      contentType: "image/png",
      kind: "image",
    });

    await sendMessageMattermost("channel:town-square", "hello", {
      mediaUrl: "file:///tmp/agent-workspace/photo.png",
      mediaLocalRoots: ["/tmp/agent-workspace"],
    });

    expect(mockState.loadOutboundMediaFromUrl).toHaveBeenCalledWith(
      "file:///tmp/agent-workspace/photo.png",
      {
        mediaLocalRoots: ["/tmp/agent-workspace"],
      },
    );
    expect(mockState.uploadMattermostFile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        channelId: "town-square",
        fileName: "photo.png",
        contentType: "image/png",
      }),
    );
  });
});

describe("sendMessageMattermost recipient resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.createMattermostClient.mockReturnValue({});
    mockState.createMattermostPost.mockResolvedValue({ id: "post-id" });
    mockState.createMattermostDirectChannel.mockResolvedValue({ id: "dm-channel-id" });
    mockState.fetchMattermostMe.mockResolvedValue({ id: "bot-id" });
  });

  it("resolves unprefixed opaque id as user first (DM)", async () => {
    mockState.fetchMattermostUser.mockResolvedValueOnce({ id: "user-id" });

    const res = await sendMessageMattermost("someOpaqueUserId123", "hello");

    expect(mockState.createMattermostDirectChannel).toHaveBeenCalledTimes(1);
    expect(mockState.createMattermostPost).toHaveBeenCalledTimes(1);
    const params = mockState.createMattermostPost.mock.calls[0]?.[1];
    expect(params.channelId).toBe("dm-channel-id");

    expect(res.channelId).toBe("dm-channel-id");
    expect(res.messageId).toBe("post-id");
  });

  it("treats unprefixed opaque id as channel when it does not resolve as user", async () => {
    mockState.fetchMattermostUser.mockRejectedValueOnce(new Error("404"));

    const res = await sendMessageMattermost("someOpaqueChannelId123", "hello");

    expect(mockState.createMattermostDirectChannel).toHaveBeenCalledTimes(0);
    const params = mockState.createMattermostPost.mock.calls[0]?.[1];
    expect(params.channelId).toBe("someOpaqueChannelId123");
    expect(res.channelId).toBe("someOpaqueChannelId123");
  });
});
