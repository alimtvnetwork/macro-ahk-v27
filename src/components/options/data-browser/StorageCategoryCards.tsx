/**
 * Storage Category Cards — Spec 55
 *
 * Four clickable cards showing Database, Session Storage, Cookies,
 * and IndexedDB/LocalStorage with item counts and sizes.
 */

import { Database, HardDrive, Cookie, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

export type StorageCategory = "database" | "session" | "cookies" | "local";

interface CategoryStats {
  label: string;
  icon: React.ElementType;
  itemCount: number;
  itemLabel: string;
  sizeFormatted: string;
  loading: boolean;
}

interface StorageCategoryCardsProps {
  active: StorageCategory;
  onSelect: (cat: StorageCategory) => void;
  dbStats: { tables: number; views: number; totalRows: number; sizeFormatted: string; loading: boolean };
  sessionStats: { count: number; sizeFormatted: string; loading: boolean };
  cookieStats: { count: number; sizeFormatted: string; loading: boolean };
  localStats: { count: number; sizeFormatted: string; loading: boolean };
}

// eslint-disable-next-line max-lines-per-function
export function StorageCategoryCards({
  active,
  onSelect,
  dbStats,
  sessionStats,
  cookieStats,
  localStats,
}: StorageCategoryCardsProps) {
  const categories: Array<CategoryStats & { id: StorageCategory }> = [
    {
      id: "database",
      label: "Database",
      icon: Database,
      itemCount: dbStats.tables + dbStats.views,
      itemLabel: `${dbStats.tables} tables · ${dbStats.views} view${dbStats.views !== 1 ? "s" : ""}`,
      sizeFormatted: dbStats.sizeFormatted,
      loading: dbStats.loading,
    },
    {
      id: "session",
      label: "Session Storage",
      icon: Archive,
      itemCount: sessionStats.count,
      itemLabel: `${sessionStats.count} key${sessionStats.count !== 1 ? "s" : ""}`,
      sizeFormatted: sessionStats.sizeFormatted,
      loading: sessionStats.loading,
    },
    {
      id: "cookies",
      label: "Cookies",
      icon: Cookie,
      itemCount: cookieStats.count,
      itemLabel: `${cookieStats.count} cookie${cookieStats.count !== 1 ? "s" : ""}`,
      sizeFormatted: cookieStats.sizeFormatted,
      loading: cookieStats.loading,
    },
    {
      id: "local",
      label: "Local Storage",
      icon: HardDrive,
      itemCount: localStats.count,
      itemLabel: `${localStats.count} key${localStats.count !== 1 ? "s" : ""}`,
      sizeFormatted: localStats.sizeFormatted,
      loading: localStats.loading,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {categories.map((cat) => {
        const Icon = cat.icon;
        const isActive = active === cat.id;

        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={cn(
              "group relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all",
              "hover:border-primary/50 hover:shadow-sm",
              isActive
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                : "border-border bg-card"
            )}
          >
            <div className="flex w-full items-center justify-between">
              <Icon className={cn(
                "h-4 w-4 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
              )} />
              {cat.loading && (
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-pulse" />
              )}
            </div>
            <span className={cn(
              "text-sm font-medium leading-tight",
              isActive ? "text-foreground" : "text-foreground/80"
            )}>
              {cat.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {cat.itemLabel}
            </span>
            <span className="text-[10px] text-muted-foreground/70 tabular-nums">
              {cat.sizeFormatted}
            </span>
          </button>
        );
      })}
    </div>
  );
}
