import Foundation
import OpenClawProtocol

enum OpenClawConfigFile {
    private static let logger = Logger(subsystem: "ai.openclaw", category: "config")
    private static let configAuditFileName = "config-audit.jsonl"
    private static let importedGatewayTokenMaxLength = 512

    enum RemoteGatewayTokenSetResult: Equatable {
        case set
        case cleared
        case unchanged
        case rejectedInvalid
    }

    static func url() -> URL {
        OpenClawPaths.configURL
    }

    static func stateDirURL() -> URL {
        OpenClawPaths.stateDirURL
    }

    static func defaultWorkspaceURL() -> URL {
        OpenClawPaths.workspaceURL
    }

    static func loadDict() -> [String: Any] {
        let url = self.url()
        guard FileManager().fileExists(atPath: url.path) else { return [:] }
        do {
            let data = try Data(contentsOf: url)
            guard let root = self.parseConfigData(data) else {
                self.logger.warning("config JSON root invalid")
                return [:]
            }
            return root
        } catch {
            self.logger.warning("config read failed: \(error.localizedDescription)")
            return [:]
        }
    }

    static func saveDict(_ dict: [String: Any]) {
        // Nix mode disables config writes in production, but tests rely on saving temp configs.
        if ProcessInfo.processInfo.isNixMode, !ProcessInfo.processInfo.isRunningTests { return }
        let url = self.url()
        let previousData = try? Data(contentsOf: url)
        let previousRoot = previousData.flatMap { self.parseConfigData($0) }
        let previousBytes = previousData?.count
        let hadMetaBefore = self.hasMeta(previousRoot)
        let gatewayModeBefore = self.gatewayMode(previousRoot)

        var output = dict
        self.stampMeta(&output)

        do {
            let data = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
            try FileManager().createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true)
            try data.write(to: url, options: [.atomic])
            let nextBytes = data.count
            let gatewayModeAfter = self.gatewayMode(output)
            let suspicious = self.configWriteSuspiciousReasons(
                existsBefore: previousData != nil,
                previousBytes: previousBytes,
                nextBytes: nextBytes,
                hadMetaBefore: hadMetaBefore,
                gatewayModeBefore: gatewayModeBefore,
                gatewayModeAfter: gatewayModeAfter)
            if !suspicious.isEmpty {
                self.logger.warning("config write anomaly (\(suspicious.joined(separator: ", "))) at \(url.path)")
            }
            self.appendConfigWriteAudit([
                "result": "success",
                "configPath": url.path,
                "existsBefore": previousData != nil,
                "previousBytes": previousBytes ?? NSNull(),
                "nextBytes": nextBytes,
                "hasMetaBefore": hadMetaBefore,
                "hasMetaAfter": self.hasMeta(output),
                "gatewayModeBefore": gatewayModeBefore ?? NSNull(),
                "gatewayModeAfter": gatewayModeAfter ?? NSNull(),
                "suspicious": suspicious,
            ])
        } catch {
            self.logger.error("config save failed: \(error.localizedDescription)")
            self.appendConfigWriteAudit([
                "result": "failed",
                "configPath": url.path,
                "existsBefore": previousData != nil,
                "previousBytes": previousBytes ?? NSNull(),
                "nextBytes": NSNull(),
                "hasMetaBefore": hadMetaBefore,
                "hasMetaAfter": self.hasMeta(output),
                "gatewayModeBefore": gatewayModeBefore ?? NSNull(),
                "gatewayModeAfter": self.gatewayMode(output) ?? NSNull(),
                "suspicious": [],
                "error": error.localizedDescription,
            ])
        }
    }

    static func loadGatewayDict() -> [String: Any] {
        let root = self.loadDict()
        return root["gateway"] as? [String: Any] ?? [:]
    }

    static func updateGatewayDict(_ mutate: (inout [String: Any]) -> Void) {
        var root = self.loadDict()
        var gateway = root["gateway"] as? [String: Any] ?? [:]
        mutate(&gateway)
        if gateway.isEmpty {
            root.removeValue(forKey: "gateway")
        } else {
            root["gateway"] = gateway
        }
        self.saveDict(root)
    }

    static func browserControlEnabled(defaultValue: Bool = true) -> Bool {
        let root = self.loadDict()
        let browser = root["browser"] as? [String: Any]
        return browser?["enabled"] as? Bool ?? defaultValue
    }

    static func setBrowserControlEnabled(_ enabled: Bool) {
        var root = self.loadDict()
        var browser = root["browser"] as? [String: Any] ?? [:]
        browser["enabled"] = enabled
        root["browser"] = browser
        self.saveDict(root)
        self.logger.debug("browser control updated enabled=\(enabled)")
    }

    static func agentWorkspace() -> String? {
        AgentWorkspaceConfig.workspace(from: self.loadDict())
    }

    static func setAgentWorkspace(_ workspace: String?) {
        var root = self.loadDict()
        AgentWorkspaceConfig.setWorkspace(in: &root, workspace: workspace)
        self.saveDict(root)
        let hasWorkspace = !(workspace?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        self.logger.debug("agents.defaults.workspace updated set=\(hasWorkspace)")
    }

    static func gatewayPassword() -> String? {
        let root = self.loadDict()
        guard let gateway = root["gateway"] as? [String: Any],
              let remote = gateway["remote"] as? [String: Any]
        else {
            return nil
        }
        return remote["password"] as? String
    }

    static func remoteGatewayToken() -> String? {
        let root = self.loadDict()
        guard let gateway = root["gateway"] as? [String: Any],
              let remote = gateway["remote"] as? [String: Any],
              let token = remote["token"] as? String
        else {
            return nil
        }
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    @discardableResult
    static func setRemoteGatewayToken(_ value: String) -> RemoteGatewayTokenSetResult {
        let current = self.remoteGatewayToken() ?? ""
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmed.isEmpty {
            guard !current.isEmpty else { return .unchanged }
            self.updateGatewayDict { gateway in
                var remote = gateway["remote"] as? [String: Any] ?? [:]
                remote.removeValue(forKey: "token")
                if remote.isEmpty {
                    gateway.removeValue(forKey: "remote")
                } else {
                    gateway["remote"] = remote
                }
            }
            return .cleared
        }

        guard let normalized = self.extractGatewayToken(trimmed) else {
            return .rejectedInvalid
        }
        guard normalized != current else { return .unchanged }

        self.updateGatewayDict { gateway in
            var remote = gateway["remote"] as? [String: Any] ?? [:]
            remote["token"] = normalized
            gateway["remote"] = remote
        }
        return .set
    }

    static func extractGatewayToken(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let value = self.gatewayToken(fromURLString: trimmed) {
            return self.validImportedGatewayToken(value)
        }
        if !trimmed.contains("://"),
           self.looksLikeURL(trimmed),
           let value = self.gatewayToken(fromURLString: "https://\(trimmed)")
        {
            return self.validImportedGatewayToken(value)
        }
        if self.looksLikeURL(trimmed) { return nil }
        if self.containsURLSeparators(trimmed) { return nil }
        return self.validImportedGatewayToken(trimmed)
    }

    static func gatewayPort() -> Int? {
        let root = self.loadDict()
        guard let gateway = root["gateway"] as? [String: Any] else { return nil }
        if let port = gateway["port"] as? Int, port > 0 { return port }
        if let number = gateway["port"] as? NSNumber, number.intValue > 0 {
            return number.intValue
        }
        if let raw = gateway["port"] as? String,
           let parsed = Int(raw.trimmingCharacters(in: .whitespacesAndNewlines)),
           parsed > 0
        {
            return parsed
        }
        return nil
    }

    static func remoteGatewayPort() -> Int? {
        guard let url = self.remoteGatewayUrl(),
              let port = url.port,
              port > 0
        else { return nil }
        return port
    }

    static func remoteGatewayPort(matchingHost sshHost: String) -> Int? {
        let trimmedSshHost = sshHost.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedSshHost.isEmpty,
              let url = self.remoteGatewayUrl(),
              let port = url.port,
              port > 0,
              let urlHost = url.host?.trimmingCharacters(in: .whitespacesAndNewlines),
              !urlHost.isEmpty
        else {
            return nil
        }

        let sshKey = Self.hostKey(trimmedSshHost)
        let urlKey = Self.hostKey(urlHost)
        guard !sshKey.isEmpty, !urlKey.isEmpty, sshKey == urlKey else { return nil }
        return port
    }

    static func setRemoteGatewayUrl(host: String, port: Int?) {
        guard let port, port > 0 else { return }
        let trimmedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedHost.isEmpty else { return }
        self.updateGatewayDict { gateway in
            var remote = gateway["remote"] as? [String: Any] ?? [:]
            let existingUrl = (remote["url"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let scheme = URL(string: existingUrl)?.scheme ?? "ws"
            remote["url"] = "\(scheme)://\(trimmedHost):\(port)"
            gateway["remote"] = remote
        }
    }

    static func clearRemoteGatewayUrl() {
        self.updateGatewayDict { gateway in
            guard var remote = gateway["remote"] as? [String: Any] else { return }
            guard remote["url"] != nil else { return }
            remote.removeValue(forKey: "url")
            if remote.isEmpty {
                gateway.removeValue(forKey: "remote")
            } else {
                gateway["remote"] = remote
            }
        }
    }

    private static func remoteGatewayUrl() -> URL? {
        let root = self.loadDict()
        guard let gateway = root["gateway"] as? [String: Any],
              let remote = gateway["remote"] as? [String: Any],
              let raw = remote["url"] as? String
        else {
            return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: trimmed) else { return nil }
        return url
    }

    static func hostKey(_ host: String) -> String {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return "" }
        if trimmed.contains(":") { return trimmed }
        let digits = CharacterSet(charactersIn: "0123456789.")
        if trimmed.rangeOfCharacter(from: digits.inverted) == nil {
            return trimmed
        }
        return trimmed.split(separator: ".").first.map(String.init) ?? trimmed
    }

    private static func gatewayToken(from queryItems: [URLQueryItem]?) -> String? {
        guard let tokenItem = queryItems?.first(where: { $0.name.caseInsensitiveCompare("token") == .orderedSame }),
              let value = tokenItem.value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty
        else {
            return nil
        }
        return value
    }

    private static func gatewayToken(fromURLString raw: String) -> String? {
        guard let components = URLComponents(string: raw) else { return nil }
        if let value = self.gatewayToken(from: components.queryItems) {
            return value
        }
        if let fragment = components.fragment,
           let value = self.gatewayToken(fromFragment: fragment)
        {
            return value
        }
        return nil
    }

    private static func gatewayToken(fromFragment fragment: String) -> String? {
        let trimmed = fragment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        var queryCandidate = trimmed
        if queryCandidate.hasPrefix("?") {
            queryCandidate = String(queryCandidate.dropFirst())
        }
        var components = URLComponents()
        components.query = queryCandidate
        if let value = self.gatewayToken(from: components.queryItems) {
            return value
        }

        if let questionMark = queryCandidate.firstIndex(of: "?") {
            let query = String(queryCandidate[queryCandidate.index(after: questionMark)...])
            components.query = query
            return self.gatewayToken(from: components.queryItems)
        }
        return nil
    }

    private static func validImportedGatewayToken(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard trimmed.count <= self.importedGatewayTokenMaxLength else { return nil }
        let invalidChars = CharacterSet.whitespacesAndNewlines.union(.controlCharacters)
        guard trimmed.rangeOfCharacter(from: invalidChars) == nil else { return nil }
        return trimmed
    }

    private static func looksLikeURL(_ raw: String) -> Bool {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        if trimmed.contains("://") || trimmed.hasPrefix("www.") { return true }
        guard let slashIndex = trimmed.firstIndex(of: "/") else { return false }
        let hostCandidate = String(trimmed[..<slashIndex]).lowercased()
        guard !hostCandidate.isEmpty else { return false }
        if hostCandidate.contains(".") { return true }
        if let colon = hostCandidate.lastIndex(of: ":"), colon != hostCandidate.startIndex {
            let hostPart = String(hostCandidate[..<colon])
            let portPart = String(hostCandidate[hostCandidate.index(after: colon)...])
            if !hostPart.isEmpty,
               let port = Int(portPart),
               port > 0,
               port <= 65535
            {
                let allowedHostChars = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-.[]:"))
                if hostPart.unicodeScalars.allSatisfy({ allowedHostChars.contains($0) }) {
                    return true
                }
            }
        }
        let ipv6OrHostPortChars = CharacterSet(charactersIn: "0123456789abcdef:[]")
        if hostCandidate.contains(":"),
           hostCandidate.unicodeScalars.allSatisfy({ ipv6OrHostPortChars.contains($0) })
        {
            return true
        }
        return false
    }

    private static func containsURLSeparators(_ raw: String) -> Bool {
        raw.contains("/") || raw.contains("?") || raw.contains("#") || raw.contains("&") || raw.contains(":")
    }

    private static func parseConfigData(_ data: Data) -> [String: Any]? {
        if let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return root
        }
        let decoder = JSONDecoder()
        if #available(macOS 12.0, *) {
            decoder.allowsJSON5 = true
        }
        if let decoded = try? decoder.decode([String: AnyCodable].self, from: data) {
            self.logger.notice("config parsed with JSON5 decoder")
            return decoded.mapValues { $0.foundationValue }
        }
        return nil
    }

    private static func stampMeta(_ root: inout [String: Any]) {
        var meta = root["meta"] as? [String: Any] ?? [:]
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "macos-app"
        meta["lastTouchedVersion"] = version
        meta["lastTouchedAt"] = ISO8601DateFormatter().string(from: Date())
        root["meta"] = meta
    }

    private static func hasMeta(_ root: [String: Any]?) -> Bool {
        guard let root else { return false }
        return root["meta"] is [String: Any]
    }

    private static func hasMeta(_ root: [String: Any]) -> Bool {
        root["meta"] is [String: Any]
    }

    private static func gatewayMode(_ root: [String: Any]?) -> String? {
        guard let root else { return nil }
        return self.gatewayMode(root)
    }

    private static func gatewayMode(_ root: [String: Any]) -> String? {
        guard let gateway = root["gateway"] as? [String: Any],
              let mode = gateway["mode"] as? String
        else { return nil }
        let trimmed = mode.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func configWriteSuspiciousReasons(
        existsBefore: Bool,
        previousBytes: Int?,
        nextBytes: Int,
        hadMetaBefore: Bool,
        gatewayModeBefore: String?,
        gatewayModeAfter: String?) -> [String]
    {
        var reasons: [String] = []
        if !existsBefore {
            return reasons
        }
        if let previousBytes, previousBytes >= 512, nextBytes < max(1, previousBytes / 2) {
            reasons.append("size-drop:\(previousBytes)->\(nextBytes)")
        }
        if !hadMetaBefore {
            reasons.append("missing-meta-before-write")
        }
        if gatewayModeBefore != nil, gatewayModeAfter == nil {
            reasons.append("gateway-mode-removed")
        }
        return reasons
    }

    private static func configAuditLogURL() -> URL {
        self.stateDirURL()
            .appendingPathComponent("logs", isDirectory: true)
            .appendingPathComponent(self.configAuditFileName, isDirectory: false)
    }

    private static func appendConfigWriteAudit(_ fields: [String: Any]) {
        var record: [String: Any] = [
            "ts": ISO8601DateFormatter().string(from: Date()),
            "source": "macos-openclaw-config-file",
            "event": "config.write",
            "pid": ProcessInfo.processInfo.processIdentifier,
            "argv": Array(ProcessInfo.processInfo.arguments.prefix(8)),
        ]
        for (key, value) in fields {
            record[key] = value is NSNull ? NSNull() : value
        }
        guard JSONSerialization.isValidJSONObject(record),
              let data = try? JSONSerialization.data(withJSONObject: record)
        else {
            return
        }
        var line = Data()
        line.append(data)
        line.append(0x0A)
        let logURL = self.configAuditLogURL()
        do {
            try FileManager().createDirectory(
                at: logURL.deletingLastPathComponent(),
                withIntermediateDirectories: true)
            if !FileManager().fileExists(atPath: logURL.path) {
                FileManager().createFile(atPath: logURL.path, contents: nil)
            }
            let handle = try FileHandle(forWritingTo: logURL)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: line)
        } catch {
            // best-effort
        }
    }
}
