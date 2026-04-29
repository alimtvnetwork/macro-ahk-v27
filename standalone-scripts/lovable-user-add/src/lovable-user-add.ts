/**
 * Entry class for the Lovable User Add project.
 *
 * P11 scaffold: empty class with `start()` placeholder. P12 wires the
 * SQLite migration + MembershipRole seed; P14 mounts the popup UI;
 * P15–P17 wire the per-row Step A (POST membership) → Step B (Owner
 * promotion via shared `LovableApiClient.promoteToOwner`) → sign-out
 * flow.
 *
 * No retry logic (mem://constraints/no-retry-policy). All errors are
 * routed through `RiseupAsiaMacroExt.Logger.error()`.
 */

const PROJECT_NAMESPACE = "LovableUserAdd";
const PHASE_LABEL = "P11-scaffold";

export class LovableUserAdd {
    public readonly namespace: string = PROJECT_NAMESPACE;

    public start(): void {
        this.logBootstrap();
    }

    private logBootstrap(): void {
        const logger = globalThis.console;
        logger.info(`[${PROJECT_NAMESPACE}] ${PHASE_LABEL} loaded — flow wiring pending P12+.`);
    }
}

export default LovableUserAdd;
