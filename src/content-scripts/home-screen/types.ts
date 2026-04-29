/**
 * Shared types for the home-screen feature.
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/04-workspace-dictionary.md
 */
export type CaughtError = unknown;

export interface WorkspaceRecord {
    index: number;
    name: string;
    fullXPath: string;
    proLabelXPath: string;
    isSelected: boolean;
    creditAvailable: number;
    creditTotal: number;
}

export interface WorkspaceDictionary {
    byName: Record<string, WorkspaceRecord>;
    byIndex: WorkspaceRecord[];
    selectedIndex: number | null;
}

export enum NavDirection {
    UP = "up",
    DOWN = "down",
}

export interface CreditPair {
    available: number;
    total: number;
}

export type CreditMap = Map<string, CreditPair>;
