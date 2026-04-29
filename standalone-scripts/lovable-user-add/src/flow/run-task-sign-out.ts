/**
 * User Add — task-level sign-out stub.
 *
 * Spec line P17 says "sign-out always runs". Because User Add has no
 * per-row login (operator is logged in once via the popup), sign-out
 * is task-level: runs once after all rows complete (or after task
 * cancellation). Q6 default applies — sign-out failure is logged but
 * does NOT flip per-row HasError flags.
 *
 * **Stub**: actual DOM clicks (Profile → SignOut) live in the
 * shared `lovable-common-xpath` module being introduced in P18.
 * Until P18, this returns a logged-but-no-op result so P17 wiring
 * compiles and the per-row state machine can be exercised end-to-end
 * in unit tests without a live browser.
 */

import { UserAddLogPhase, UserAddLogSeverity, buildUserAddEntry } from "./log-sink";
import type { UserAddLogSink } from "./log-sink";

export interface TaskSignOutResult {
    Succeeded: boolean;
    DurationMs: number;
    Error: string | null;
}

const STUB_PENDING_MESSAGE = "Task sign-out stubbed — actual DOM clicks land in P18 (shared XPath module)";

export const runTaskSignOut = async (
    taskId: string, sink: UserAddLogSink,
): Promise<TaskSignOutResult> => {
    const startedAt = Date.now();
    sink.write(buildUserAddEntry(
        taskId, null, UserAddLogPhase.SignOut, UserAddLogSeverity.Warn, STUB_PENDING_MESSAGE,
    ));

    return Promise.resolve({
        Succeeded: false, DurationMs: Date.now() - startedAt, Error: STUB_PENDING_MESSAGE,
    });
};
