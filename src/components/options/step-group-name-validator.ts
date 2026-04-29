/**
 * Marco Extension — Step-Group name validation
 *
 * Pure helpers shared by every UI surface that lets the user type a
 * step-group name (single create/rename dialogs, batch-rename preview,
 * import conflict resolution, etc.).
 *
 * Keeping the rules in one module guarantees that all entry points
 * accept exactly the same inputs — a name accepted by the tree view's
 * inline rename can never be rejected by the batch-rename preview.
 *
 * @see ./StepGroupListPanel.tsx — single rename
 * @see ./BatchRenameDialog.tsx — batch rename
 */

/**
 * Maximum length matches the `maxLength` enforced on every existing
 * single-rename input. Keeping them aligned avoids one panel accepting
 * names the other rejects.
 */
export const STEP_GROUP_NAME_MAX_LEN = 120;

/**
 * Pure validator — always returns either `null` (valid) or a short,
 * user-facing message safe to render under an input. Rules:
 *
 *  1. Non-empty after trim.
 *  2. ≤ 120 characters.
 *  3. Case-insensitively unique among the supplied sibling names.
 *
 * @param raw          - the raw input value (NOT trimmed)
 * @param siblingNames - existing names of every sibling under the
 *                       intended parent. For rename, the current name
 *                       must be EXCLUDED by the caller so renaming to
 *                       the same value isn't reported as a clash.
 */
export function validateStepGroupName(
    raw: string,
    siblingNames: ReadonlyArray<string>,
): string | null {
    const trimmed = raw.trim();
    if (trimmed === "") return "Name is required.";
    if (trimmed.length > STEP_GROUP_NAME_MAX_LEN) {
        return `Name must be ${STEP_GROUP_NAME_MAX_LEN} characters or fewer.`;
    }
    const lower = trimmed.toLowerCase();
    const clash = siblingNames.find((s) => s.toLowerCase() === lower);
    if (clash !== undefined) return "Another group at this level already has that name.";
    return null;
}
