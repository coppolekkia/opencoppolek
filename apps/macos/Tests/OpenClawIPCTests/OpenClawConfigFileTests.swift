import Foundation
import Testing
@testable import OpenClaw

@Suite(.serialized)
struct OpenClawConfigFileTests {
    private func makeConfigOverridePath() -> String {
        FileManager().temporaryDirectory
            .appendingPathComponent("openclaw-config-\(UUID().uuidString)")
            .appendingPathComponent("openclaw.json")
            .path
    }

    @Test
    func configPathRespectsEnvOverride() async {
        let override = makeConfigOverridePath()

        await TestIsolation.withEnvValues(["OPENCLAW_CONFIG_PATH": override]) {
            #expect(OpenClawConfigFile.url().path == override)
        }
    }

    @MainActor
    @Test
    func remoteGatewayPortParsesAndMatchesHost() async {
        let override = makeConfigOverridePath()

        await TestIsolation.withEnvValues(["OPENCLAW_CONFIG_PATH": override]) {
            OpenClawConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "ws://gateway.ts.net:19999",
                    ],
                ],
            ])
            #expect(OpenClawConfigFile.remoteGatewayPort() == 19999)
            #expect(OpenClawConfigFile.remoteGatewayPort(matchingHost: "gateway.ts.net") == 19999)
            #expect(OpenClawConfigFile.remoteGatewayPort(matchingHost: "gateway") == 19999)
            #expect(OpenClawConfigFile.remoteGatewayPort(matchingHost: "other.ts.net") == nil)
        }
    }

    @MainActor
    @Test
    func setRemoteGatewayUrlPreservesScheme() async {
        let override = makeConfigOverridePath()

        await TestIsolation.withEnvValues(["OPENCLAW_CONFIG_PATH": override]) {
            OpenClawConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://old-host:111",
                    ],
                ],
            ])
            OpenClawConfigFile.setRemoteGatewayUrl(host: "new-host", port: 2222)
            let root = OpenClawConfigFile.loadDict()
            let url = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any])?["url"] as? String
            #expect(url == "wss://new-host:2222")
        }
    }

    @MainActor
    @Test
    func clearRemoteGatewayUrlRemovesOnlyUrlField() async {
        let override = makeConfigOverridePath()

        await TestIsolation.withEnvValues(["OPENCLAW_CONFIG_PATH": override]) {
            OpenClawConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://old-host:111",
                        "token": "tok",
                    ],
                ],
            ])
            OpenClawConfigFile.clearRemoteGatewayUrl()
            let root = OpenClawConfigFile.loadDict()
            let remote = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any]) ?? [:]
            #expect((remote["url"] as? String) == nil)
            #expect((remote["token"] as? String) == "tok")
        }
    }

    @MainActor
    @Test
    func remoteGatewayTokenRoundTripsAndPreservesRemoteURL() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("openclaw-config-\(UUID().uuidString)")
            .appendingPathComponent("openclaw.json")
            .path

        await TestIsolation.withEnvValues(["OPENCLAW_CONFIG_PATH": override]) {
            OpenClawConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://gateway.ts.net:18789",
                    ],
                ],
            ])

            OpenClawConfigFile.setRemoteGatewayToken("  test-token  ")
            #expect(OpenClawConfigFile.remoteGatewayToken() == "test-token")

            var root = OpenClawConfigFile.loadDict()
            var remote = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any]) ?? [:]
            #expect((remote["url"] as? String) == "wss://gateway.ts.net:18789")
            #expect((remote["token"] as? String) == "test-token")

            OpenClawConfigFile.setRemoteGatewayToken("")
            #expect(OpenClawConfigFile.remoteGatewayToken() == nil)
            root = OpenClawConfigFile.loadDict()
            remote = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any]) ?? [:]
            #expect((remote["url"] as? String) == "wss://gateway.ts.net:18789")
            #expect((remote["token"] as? String) == nil)
        }
    }

    @Test
    func extractGatewayTokenParsesDashboardURLOrRawValue() async {
        let tooLong = String(repeating: "a", count: 513)
        #expect(OpenClawConfigFile.extractGatewayToken("  https://host:18789/?token=abc123  ") == "abc123")
        #expect(OpenClawConfigFile.extractGatewayToken("https://host:18789/?ToKeN=abcDEF") == "abcDEF")
        #expect(OpenClawConfigFile.extractGatewayToken("https://host:18789/#token=abcFRAG") == "abcFRAG")
        #expect(OpenClawConfigFile.extractGatewayToken("https://host:18789/#/pairing?token=abcRoute") == "abcRoute")
        #expect(OpenClawConfigFile.extractGatewayToken("host:18789/#token=abcNoScheme") == "abcNoScheme")
        #expect(OpenClawConfigFile.extractGatewayToken("host:18789/?token=abcNoSchemeQuery") == "abcNoSchemeQuery")
        #expect(OpenClawConfigFile.extractGatewayToken("https://host:18789/?foo=bar") == nil)
        #expect(OpenClawConfigFile.extractGatewayToken("https://host:18789/#/pairing?foo=bar") == nil)
        #expect(OpenClawConfigFile.extractGatewayToken("github.com/openclaw/openclaw") == nil)
        #expect(OpenClawConfigFile.extractGatewayToken("host:18789/#/pairing?foo=bar") == nil)
        #expect(OpenClawConfigFile.extractGatewayToken("foo/bar") == nil)
        #expect(OpenClawConfigFile.extractGatewayToken("example.com?foo=bar") == nil)
        #expect(OpenClawConfigFile.extractGatewayToken(" raw-token ") == "raw-token")
        #expect(OpenClawConfigFile.extractGatewayToken("token with spaces") == nil)
        #expect(OpenClawConfigFile.extractGatewayToken("https://host:18789/#token=\(tooLong)") == nil)
        #expect(OpenClawConfigFile.extractGatewayToken(tooLong) == nil)
        #expect(OpenClawConfigFile.extractGatewayToken("   ") == nil)
    }

    @MainActor
    @Test
    func setRemoteGatewayTokenRejectsUrlLikeInputAndPreservesExistingValue() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("openclaw-config-\(UUID().uuidString)")
            .appendingPathComponent("openclaw.json")
            .path

        await TestIsolation.withEnvValues(["OPENCLAW_CONFIG_PATH": override]) {
            OpenClawConfigFile.setRemoteGatewayToken("known-good-token")
            #expect(OpenClawConfigFile.remoteGatewayToken() == "known-good-token")

            #expect(OpenClawConfigFile.setRemoteGatewayToken("https://github.com/openclaw/openclaw") == .rejectedInvalid)
            #expect(OpenClawConfigFile.remoteGatewayToken() == "known-good-token")

            #expect(OpenClawConfigFile.setRemoteGatewayToken("https://host:18789/#token=next-token") == .set)
            #expect(OpenClawConfigFile.remoteGatewayToken() == "next-token")
        }
    }

    @Test
    func stateDirOverrideSetsConfigPath() async {
        let dir = FileManager().temporaryDirectory
            .appendingPathComponent("openclaw-state-\(UUID().uuidString)", isDirectory: true)
            .path

        await TestIsolation.withEnvValues([
            "OPENCLAW_CONFIG_PATH": nil,
            "OPENCLAW_STATE_DIR": dir,
        ]) {
            #expect(OpenClawConfigFile.stateDirURL().path == dir)
            #expect(OpenClawConfigFile.url().path == "\(dir)/openclaw.json")
        }
    }

    @MainActor
    @Test
    func saveDictAppendsConfigAuditLog() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("openclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("openclaw.json")
        let auditPath = stateDir.appendingPathComponent("logs/config-audit.jsonl")

        defer { try? FileManager().removeItem(at: stateDir) }

        try await TestIsolation.withEnvValues([
            "OPENCLAW_STATE_DIR": stateDir.path,
            "OPENCLAW_CONFIG_PATH": configPath.path,
        ]) {
            OpenClawConfigFile.saveDict([
                "gateway": ["mode": "local"],
            ])

            let configData = try Data(contentsOf: configPath)
            let configRoot = try JSONSerialization.jsonObject(with: configData) as? [String: Any]
            #expect((configRoot?["meta"] as? [String: Any]) != nil)

            let rawAudit = try String(contentsOf: auditPath, encoding: .utf8)
            let lines = rawAudit
                .split(whereSeparator: \.isNewline)
                .map(String.init)
            #expect(!lines.isEmpty)
            guard let last = lines.last else {
                Issue.record("Missing config audit line")
                return
            }
            let auditRoot = try JSONSerialization.jsonObject(with: Data(last.utf8)) as? [String: Any]
            #expect(auditRoot?["source"] as? String == "macos-openclaw-config-file")
            #expect(auditRoot?["event"] as? String == "config.write")
            #expect(auditRoot?["result"] as? String == "success")
            #expect(auditRoot?["configPath"] as? String == configPath.path)
        }
    }
}
