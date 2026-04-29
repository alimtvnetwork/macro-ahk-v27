/**
 * LocalStorage and cache key constants.
 */
export enum StorageKey {
  PanelState = 'ml_panel_state',
  PanelGeometry = 'ml_panel_geometry',
  BackdropOpacity = 'marco_backdrop_opacity',
  RenameHistory = 'ml_rename_history',
  LogManagerConfig = 'marco_log_manager_config',
  LogStorage = 'ahk_macroloop_logs',
  TokenSavedAt = 'marco_token_saved_at',
  RenamePresetPrefix = 'MacroController.RenamePresets.',
  WsHistory = 'ml_workspace_history',
  WsShared = 'ml_known_workspaces',
  WsCachePrefix = 'marco_ws_cache_',
  WsLastProject = 'marco_last_project_id',
  ReinjectPrefix = '__marco_reinject_',
  GkvForbiddenGroup = 'rename_forbidden',
  ForcedTheme = 'dark',
}
