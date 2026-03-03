import Foundation
import OpenClawKit

enum RemoteGatewayTokenVerifier {
    private static let tokenProbeScopes: [String] = [
        "operator.admin",
        "operator.read",
        "operator.write",
        "operator.approvals",
        "operator.pairing",
    ]

    static func verify(token: String, timeoutMs: Double = 8000) async throws {
        let endpoint = try await GatewayEndpointStore.shared.requireConfig()
        let channel = GatewayChannelActor(
            url: endpoint.url,
            token: token,
            password: nil,
            connectOptions: GatewayConnectOptions(
                role: "operator",
                scopes: self.tokenProbeScopes,
                caps: [],
                commands: [],
                permissions: [:],
                clientId: "openclaw-macos-token-verify",
                clientMode: "ui",
                clientDisplayName: InstanceIdentity.displayName,
                includeDeviceIdentity: false))

        do {
            _ = try await channel.request(method: "health", params: nil, timeoutMs: timeoutMs)
            await channel.shutdown()
        } catch {
            await channel.shutdown()
            throw error
        }
    }

    static func failureMessage(for error: Error) -> String {
        let message = (error as NSError).localizedDescription
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = message.lowercased()
        if lower.contains("unauthorized") || lower.contains("rejected token") || lower.contains("auth") {
            return "Token rejected by gateway. Copy a fresh dashboard URL containing #token=... and try again."
        }
        if lower.contains("timed out") || lower.contains("connect") {
            return "Could not verify token with gateway right now. Check SSH/direct connectivity, then retry."
        }
        return "Could not verify token with gateway: \(message)"
    }
}
