/**
 * Marco Extension — useBenignWarningStats
 *
 * Fetches the most recent log + error rows from the background SW and
 * tallies how many entries match each `BENIGN_WARNING_PATTERNS` regex.
 *
 * Used exclusively by `BootFailureBanner` so the support-report bundle
 * can disclose *which* warnings were suppressed and *how many* — keeping
 * the otherwise-invisible filter auditable.
 */

import { useEffect, useState } from "react";
import { sendMessage } from "@/lib/message-client";
import { tallyBenignWarnings, type BenignWarningTally } from "@/lib/benign-warnings";

interface RawLog {
    id: number;
    timestamp: string;
    level: string;
    detail?: string;
    message?: string;
    action?: string;
}

interface RawError {
    id: number;
    timestamp: string;
    level: string;
    message: string;
}

const EMPTY_TALLY: BenignWarningTally = { total: 0, matched: [] };

/**
 * Returns the live benign-warning tally. Refreshes when `bumpKey` changes
 * — the banner increments it after each refresh so the disclosed counts
 * stay aligned with what the activity timeline currently filters out.
 */
export function useBenignWarningStats(bumpKey: number, limit = 500): BenignWarningTally {
    const [tally, setTally] = useState<BenignWarningTally>(EMPTY_TALLY);

    useEffect(() => {
        let cancelled = false;
        const run = async (): Promise<void> => {
            try {
                const [logRes, errRes] = await Promise.all([
                    sendMessage<{ logs: RawLog[] }>({ type: "GET_RECENT_LOGS", limit }),
                    sendMessage<{ errors: RawError[] }>({ type: "GET_ACTIVE_ERRORS" }),
                ]);
                const merged = [
                    ...(logRes.logs ?? []).map((l) => ({
                        level: (l.level ?? "info").toLowerCase() === "warning" ? "warn" : (l.level ?? "info").toLowerCase(),
                        message: l.message ?? l.detail ?? l.action ?? "",
                        detail: l.detail,
                    })),
                    ...(errRes.errors ?? []).map((e) => ({
                        level: (e.level ?? "info").toLowerCase() === "warning" ? "warn" : (e.level ?? "info").toLowerCase(),
                        message: e.message ?? "",
                    })),
                ];
                if (cancelled === false) {
                    setTally(tallyBenignWarnings(merged));
                }
            } catch {
                // Preview / SW-unavailable — leave tally empty so the report
                // simply omits the section.
                if (cancelled === false) {
                    setTally(EMPTY_TALLY);
                }
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [bumpKey, limit]);

    return tally;
}
