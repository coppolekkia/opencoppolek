import Testing
@testable import OpenClaw

@Suite(.serialized)
@MainActor
struct UpdaterControllerTests {
    // Regression: debug builds with empty SUFeedURL must use DisabledUpdaterController
    // so the About screen shows "Updates unavailable" instead of a Sparkle error (#29926).

    @Test func disabledUpdaterReportsUnavailable() {
        let controller = DisabledUpdaterController()
        #expect(!controller.isAvailable)
        #expect(!controller.automaticallyChecksForUpdates)
        #expect(!controller.automaticallyDownloadsUpdates)
        #expect(!controller.updateStatus.isUpdateReady)
    }

    @Test func disabledUpdaterCheckIsNoOp() {
        let controller = DisabledUpdaterController()
        // Should not crash or trigger Sparkle dialogs.
        controller.checkForUpdates(nil)
        #expect(!controller.isAvailable)
    }

    @Test func aboutSettingsShowsUnavailableForDisabledUpdater() {
        let controller = DisabledUpdaterController()
        let view = AboutSettings(updater: controller)
        // Body should build without error; the isAvailable == false branch
        // renders "Updates unavailable in this build." instead of the update button.
        _ = view.body
    }
}
