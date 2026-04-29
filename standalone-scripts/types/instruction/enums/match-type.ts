/**
 * How a `TargetUrl.pattern` should be interpreted by the injection
 * scheduler when deciding whether to inject the script into a tab.
 */
export const enum MatchType {
    Glob = "glob",
    Regex = "regex",
    Exact = "exact",
}
