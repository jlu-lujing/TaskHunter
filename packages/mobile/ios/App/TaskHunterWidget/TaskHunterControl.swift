import AppIntents
import SwiftUI
import WidgetKit

// Control Center control (iOS 18+): tap the TaskHunter logo to start a new session.
//
// IMPORTANT: this file is a member of BOTH the app target and the widget extension target.
// iOS requires the control's AppIntent to exist in the app target too, otherwise tapping the
// control can't open the app (the tap does nothing). It's kept self-contained (inline URL, no
// dependency on the widget's shared code) so it compiles cleanly in the app target.
@available(iOS 18.0, *)
struct TaskHunterNewSessionControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "TaskHunterNewSessionControl") {
            ControlWidgetButton(action: OpenNewSessionIntent()) {
                // Custom symbol is referenced via `image:` (the asset-catalog symbol path;
                // `systemImage:` only finds Apple's system SF Symbols → shows a "?"). The glyph
                // uses bold strokes so it stays visible at the control's small, tinted size —
                // thin strokes rendered blank.
                Label("New Session", image: "OCLogoSymbol")
            }
        }
        .displayName("New Session")
        .description("Start a new TaskHunter session.")
    }
}

@available(iOS 18.0, *)
struct OpenNewSessionIntent: AppIntent {
    static let title: LocalizedStringResource = "New TaskHunter Session"
    static let openAppWhenRun: Bool = true
    // Hidden from the Shortcuts action list: run from there, its OpenURLIntent for the app's own
    // scheme is refused. Shortcuts and Siri use NewSessionShortcutIntent (TaskHunterAppShortcuts.swift).
    static let isDiscoverable: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        return .result(opensIntent: OpenURLIntent(URL(string: "taskhunter://new")!))
    }
}
