/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic storage query results */
import { useState, useMemo } from "react";
import { useStorageStats, useDataBrowser, useDataStore } from "@/hooks/use-extension-data";
import { useSessionStorage, useCookies, useLocalStorage } from "@/hooks/use-storage-surfaces";
import type { DataBrowserFilters } from "@/hooks/use-extension-data";
import { StorageCategoryCards, type StorageCategory } from "./StorageCategoryCards";
import { StorageCard } from "./StorageCard";
import { DataTable } from "./DataTable";
import { DataStoreTable } from "./DataStoreTable";
import { SessionStorageTable } from "./SessionStorageTable";
import { CookiesTable } from "./CookiesTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

type ActiveView = "logs" | "errors" | "datastore";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Root data browser panel with category cards, cross-category search, and sub-views. */
// eslint-disable-next-line max-lines-per-function
export function DataBrowserPanel() {
  const { stats, loading: isStatsLoading, refresh: refreshStats } = useStorageStats();
  const session = useSessionStorage();
  const cookies = useCookies();
  const local = useLocalStorage();

  const [activeCategory, setActiveCategory] = useState<StorageCategory>("database");
  const [activeDb, setActiveDb] = useState<ActiveView>("logs");
  const [filters, setFilters] = useState<DataBrowserFilters>({});
  const [globalSearch, setGlobalSearch] = useState("");

  const browser = useDataBrowser(
    activeDb === "datastore" ? "logs" : activeDb,
    15,
    activeDb === "datastore" ? {} : filters,
  );
  const dataStore = useDataStore();

  const handlePurgeComplete = async () => {
    await refreshStats();
    await browser.fetchPage(0);
  };

  const handleDbChange = (db: ActiveView) => {
    setActiveDb(db);
    setFilters({});
  };

  const isFirstPage = browser.page === 0;
  const isLastPage = browser.page >= browser.totalPages - 1;
  const isDataStore = activeDb === "datastore";

  const dbStats = useMemo(() => {
    const dbList = stats?.databases ?? [];
    const tableCount = dbList.reduce((sum, db) => sum + Object.keys(db.tables).length, 0);
    const totalRows = (stats?.logCount ?? 0) + (stats?.errorCount ?? 0) + (stats?.sessionCount ?? 0);
    const estimatedSize = totalRows * 200;
    return {
      tables: tableCount,
      views: 1,
      totalRows,
      sizeFormatted: `~${formatSize(estimatedSize)}`,
      loading: isStatsLoading,
    };
  }, [stats, isStatsLoading]);

  return (
    <div className="space-y-4">
      <StorageCategoryCards
        active={activeCategory}
        onSelect={(cat) => { setActiveCategory(cat); setGlobalSearch(""); }}
        dbStats={dbStats}
        sessionStats={{ count: session.count, sizeFormatted: formatSize(session.totalSize), loading: session.loading }}
        cookieStats={{ count: cookies.count, sizeFormatted: formatSize(cookies.totalSize), loading: cookies.loading }}
        localStats={{ count: local.count, sizeFormatted: formatSize(local.totalSize), loading: local.loading }}
      />

      {/* Cross-category search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder={`Search across ${activeCategory === "database" ? "database" : activeCategory === "session" ? "session storage" : activeCategory === "cookies" ? "cookies" : "local storage"}…`}
          className="h-8 text-xs pl-8 pr-8"
        />
        {globalSearch && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGlobalSearch("")}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {activeCategory === "database" && (
        <>
          <StorageCard
            stats={stats}
            isStatsLoading={isStatsLoading}
            onRefreshStats={refreshStats}
            onPurgeComplete={handlePurgeComplete}
          />
          {isDataStore ? (
            <DataStoreTable
              entries={dataStore.entries}
              loading={dataStore.loading}
              onRefresh={dataStore.refresh}
            />
          ) : (
            <DataTable
              activeDb={activeDb as "logs" | "errors"}
              onDbChange={handleDbChange}
              rows={browser.rows}
              isLoading={browser.loading}
              page={browser.page}
              totalPages={browser.totalPages}
              total={browser.total}
              isFirstPage={isFirstPage}
              isLastPage={isLastPage}
              onPrevPage={() => browser.fetchPage(browser.page - 1)}
              onNextPage={() => browser.fetchPage(browser.page + 1)}
              filters={filters}
              onFiltersChange={setFilters}
            />
          )}
        </>
      )}

      {activeCategory === "session" && (
        <SessionStorageTable
          entries={session.entries}
          loading={session.loading}
          onRefresh={session.refresh}
          searchTerm={globalSearch}
        />
      )}

      {activeCategory === "cookies" && (
        <CookiesTable
          entries={cookies.entries}
          loading={cookies.loading}
          onRefresh={cookies.refresh}
          searchTerm={globalSearch}
        />
      )}

      {activeCategory === "local" && (
        <DataStoreTable
          entries={local.entries as any}
          loading={local.loading}
          onRefresh={local.refresh}
        />
      )}
    </div>
  );
}
