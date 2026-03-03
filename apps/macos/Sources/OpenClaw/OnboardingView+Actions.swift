import AppKit
import Foundation
import OpenClawDiscovery
import OpenClawIPC
import SwiftUI

extension OnboardingView {
    @MainActor
    func validateAndSaveRemoteGatewayTokenDraft() async {
        guard !self.remoteTokenImportInProgress else { return }
        self.remoteTokenImportInProgress = true
        defer { self.remoteTokenImportInProgress = false }

        let previousToken = OpenClawConfigFile.remoteGatewayToken() ?? ""
        guard let token = OpenClawConfigFile.extractGatewayToken(self.remoteTokenDraft) else {
            NSSound.beep()
            withAnimation(.easeInOut(duration: 0.35)) {
                self.remoteTokenImportShakeCount += 1
            }
            self.remoteTokenImportMessage =
                "Token rejected. Paste the raw gateway token or a dashboard URL containing #token=..."
            return
        }
        if token == previousToken {
            self.remoteTokenImportMessage = "Token already matches your current gateway token. No changes made."
            self.remoteTokenDraft = previousToken
            return
        }

        self.remoteTokenImportMessage = "Verifying token with gateway…"
        do {
            try await RemoteGatewayTokenVerifier.verify(token: token)
        } catch {
            NSSound.beep()
            withAnimation(.easeInOut(duration: 0.35)) {
                self.remoteTokenImportShakeCount += 1
            }
            self.remoteTokenImportMessage = RemoteGatewayTokenVerifier.failureMessage(for: error)
            return
        }

        switch OpenClawConfigFile.setRemoteGatewayToken(token) {
        case .set:
            self.remoteTokenDraft = token
            self.remoteTokenImportMessage = "Token verified and saved to gateway.remote.token."
        case .unchanged:
            self.remoteTokenDraft = OpenClawConfigFile.remoteGatewayToken() ?? ""
            self.remoteTokenImportMessage = "Token already matches your current gateway token. No changes made."
        case .rejectedInvalid:
            NSSound.beep()
            withAnimation(.easeInOut(duration: 0.35)) {
                self.remoteTokenImportShakeCount += 1
            }
            self.remoteTokenImportMessage =
                "Token rejected. Paste the raw gateway token or a dashboard URL containing #token=..."
        case .cleared:
            self.remoteTokenDraft = ""
            self.remoteTokenImportMessage = "Gateway token cleared."
        }
    }

    func selectLocalGateway() {
        self.state.connectionMode = .local
        self.preferredGatewayID = nil
        self.showAdvancedConnection = false
        self.remoteTokenImportMessage = nil
        self.remoteTokenDraft = OpenClawConfigFile.remoteGatewayToken() ?? ""
        GatewayDiscoveryPreferences.setPreferredStableID(nil)
    }

    func selectUnconfiguredGateway() {
        Task { await self.onboardingWizard.cancelIfRunning() }
        self.state.connectionMode = .unconfigured
        self.preferredGatewayID = nil
        self.showAdvancedConnection = false
        self.remoteTokenImportMessage = nil
        self.remoteTokenDraft = OpenClawConfigFile.remoteGatewayToken() ?? ""
        GatewayDiscoveryPreferences.setPreferredStableID(nil)
    }

    func selectRemoteGateway(_ gateway: GatewayDiscoveryModel.DiscoveredGateway) {
        Task { await self.onboardingWizard.cancelIfRunning() }
        self.preferredGatewayID = gateway.stableID
        GatewayDiscoveryPreferences.setPreferredStableID(gateway.stableID)
        GatewayDiscoverySelectionSupport.applyRemoteSelection(gateway: gateway, state: self.state)

        self.state.connectionMode = .remote
        self.remoteTokenImportMessage = nil
        self.remoteTokenDraft = OpenClawConfigFile.remoteGatewayToken() ?? ""
        MacNodeModeCoordinator.shared.setPreferredGatewayStableID(gateway.stableID)
    }

    @MainActor
    func importRemoteGatewayTokenFromClipboard() async {
        guard !self.remoteTokenImportInProgress else { return }
        self.remoteTokenImportInProgress = true
        defer { self.remoteTokenImportInProgress = false }

        let clipboard = NSPasteboard.general.string(forType: .string) ?? ""
        let previousToken = OpenClawConfigFile.remoteGatewayToken() ?? ""
        guard let token = OpenClawConfigFile.extractGatewayToken(clipboard) else {
            NSSound.beep()
            withAnimation(.easeInOut(duration: 0.35)) {
                self.remoteTokenImportShakeCount += 1
            }
            if !previousToken.isEmpty {
                self.remoteTokenImportMessage =
                    "Clipboard import rejected (no token found). Kept your existing gateway token. To import a token run `openclaw dashboard --no-open` on the gateway host and copy the URL containing #token=..."
            } else {
                self.remoteTokenImportMessage =
                    "Clipboard has no gateway token. On the gateway host run `openclaw dashboard --no-open`, copy the URL containing #token=..., then import again."
            }
            return
        }
        if token == previousToken {
            self.remoteTokenImportMessage = "Clipboard token already matches your current gateway token. No changes made."
            return
        }
        self.remoteTokenImportMessage = "Verifying token with gateway…"
        do {
            try await RemoteGatewayTokenVerifier.verify(token: token)
        } catch {
            NSSound.beep()
            withAnimation(.easeInOut(duration: 0.35)) {
                self.remoteTokenImportShakeCount += 1
            }
            self.remoteTokenImportMessage = RemoteGatewayTokenVerifier.failureMessage(for: error)
            return
        }
        switch OpenClawConfigFile.setRemoteGatewayToken(token) {
        case .set:
            self.remoteTokenDraft = token
            self.remoteTokenImportMessage = "Token verified and saved to gateway.remote.token."
        case .unchanged:
            self.remoteTokenDraft = OpenClawConfigFile.remoteGatewayToken() ?? ""
            self.remoteTokenImportMessage = "Clipboard token already matches your current gateway token. No changes made."
        case .rejectedInvalid:
            NSSound.beep()
            withAnimation(.easeInOut(duration: 0.35)) {
                self.remoteTokenImportShakeCount += 1
            }
            self.remoteTokenImportMessage =
                "Token rejected. Paste the raw gateway token or a dashboard URL containing #token=..."
        case .cleared:
            self.remoteTokenDraft = OpenClawConfigFile.remoteGatewayToken() ?? ""
            self.remoteTokenImportMessage =
                "Clipboard import rejected. Existing token was kept."
        }
    }

    func openSettings(tab: SettingsTab) {
        SettingsTabRouter.request(tab)
        self.openSettings()
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .openclawSelectSettingsTab, object: tab)
        }
    }

    func handleBack() {
        withAnimation {
            self.currentPage = max(0, self.currentPage - 1)
        }
    }

    func handleNext() {
        if self.isWizardBlocking { return }
        if self.currentPage < self.pageCount - 1 {
            withAnimation { self.currentPage += 1 }
        } else {
            self.finish()
        }
    }

    func finish() {
        UserDefaults.standard.set(true, forKey: "openclaw.onboardingSeen")
        UserDefaults.standard.set(currentOnboardingVersion, forKey: onboardingVersionKey)
        OnboardingController.shared.close()
    }

    func copyToPasteboard(_ text: String) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
        self.copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.copied = false }
    }
}
