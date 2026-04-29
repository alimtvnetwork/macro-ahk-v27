/**
 * Log/label prefix strings used for structured logging and identification.
 */
export enum Label {
  PromptPrewarm = 'prompt-prewarm',
  WsPrefetch = 'ws-prefetch',
  StartupRetry = 'Startup: Retry #',
  AuthAutoResync = 'Auth auto-resync (',
  LogMacroloopV = '[MacroLoop v',
  ExtensionBridge = 'Extension bridge ',
  DomainGuard = 'domain-guard',
  SourceExtension = 'marco-extension',
  NextTasks = 'next-tasks',
  LogSessionCheck = '[SessionCheck/',
  LogXpathUtils = '[XPathUtils.',
  KeepingExistingWs = ': Keeping existing workspace: ',
  IgnoringApiSet = '" — ignoring, API already set: ',
}
