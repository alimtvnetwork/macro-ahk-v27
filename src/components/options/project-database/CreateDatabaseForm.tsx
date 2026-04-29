/**
 * Marco Extension — Create Database Form (Inline)
 *
 * Inline expandable form for creating namespace-based databases.
 * Supports live validation, reserved prefix detection, and database kind selection.
 *
 * @see spec/21-app/02-features/chrome-extension/90-namespace-database-creation.md
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { sendMessage } from "@/lib/message-client";
import {
  DATABASE_KINDS,
  MAX_USER_DATABASES,
  validateNamespace,
  validateDatabaseName,
  KV_KIND_SCHEMA,
  CONFIG_KIND_SCHEMA,
  type NamespaceDatabaseRequest,
} from "@/types/default-databases";


interface CreateDatabaseFormProps {
  projectSlug: string;
  /** Current count of user-created databases (excludes defaults) */
  userDbCount: number;
  onCreated: () => void;
  onCancel: () => void;
}

// eslint-disable-next-line max-lines-per-function -- form with validation, multiple fields, and async submission
export function CreateDatabaseForm({
  projectSlug,
  userDbCount,
  onCreated,
  onCancel,
}: CreateDatabaseFormProps) {
  const [namespace, setNamespace] = useState("");
  const [dbName, setDbName] = useState("");
  const [kindId, setKindId] = useState("1");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const nsValidation = useMemo(() => (namespace ? validateNamespace(namespace) : null), [namespace]);
  const nameValidation = useMemo(() => (dbName ? validateDatabaseName(dbName) : null), [dbName]);
  const atLimit = userDbCount >= MAX_USER_DATABASES;

  const canSubmit =
    !atLimit &&
    !creating &&
    namespace.trim().length > 0 &&
    dbName.trim().length > 0 &&
    (nsValidation?.valid ?? false) &&
    (nameValidation?.valid ?? false);

  const handleCreate = async () => {
    if (!canSubmit) return;

    setCreating(true);
    try {
      const request: NamespaceDatabaseRequest = {
        namespace: namespace.trim(),
        databaseName: dbName.trim(),
        databaseKindId: Number(kindId),
        description: description.trim() || undefined,
      };

      // Determine which schema to auto-create based on kind
      const kindNum = Number(kindId);
      let extraSchema = "";
      if (kindNum === 1) extraSchema = KV_KIND_SCHEMA;
      else if (kindNum === 3) extraSchema = CONFIG_KIND_SCHEMA;

      // Create via PROJECT_DB_CREATE_TABLE for KV/Config kinds
      if (extraSchema) {
        await sendMessage({
          type: "PROJECT_API",
          project: projectSlug,
          method: "SCHEMA",
          endpoint: "execRaw",
          params: { sql: extraSchema },
        });
      }

      // Register in ProjectDatabases
      await sendMessage({
        type: "PROJECT_API",
        project: projectSlug,
        method: "POST",
        endpoint: "ProjectDatabases",
        body: {
          DatabaseName: request.databaseName,
          Namespace: request.namespace,
          DatabaseKindId: request.databaseKindId,
          IsDefault: 0,
          Description: request.description ?? null,
        },
      });

      const kindLabel = DATABASE_KINDS.find((k) => k.id === kindNum)?.name ?? "Unknown";
      toast.success(`Database "${request.databaseName}" (${kindLabel}) created in ${request.namespace}`);
      onCreated();
    } catch (err) {
      toast.error(`Failed to create database: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Create Database
          </CardTitle>
          {atLimit && (
            <Badge variant="destructive" className="text-[10px]">
              Limit reached ({MAX_USER_DATABASES})
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Namespace */}
        <div className="space-y-1">
          <Label className="text-xs">Namespace</Label>
          <Input
            placeholder="MyPlugin.Config"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            className={`h-8 text-sm font-mono ${nsValidation && !nsValidation.valid ? "border-destructive" : ""}`}
            disabled={atLimit}
          />
          {nsValidation && !nsValidation.valid && (
            <p className="text-[10px] text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {nsValidation.error}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            PascalCase dot-separated, 2–5 segments (e.g. Scraper.Results)
          </p>
        </div>

        {/* Database Name */}
        <div className="space-y-1">
          <Label className="text-xs">Database Name</Label>
          <Input
            placeholder="MyStore"
            value={dbName}
            onChange={(e) => setDbName(e.target.value)}
            className={`h-8 text-sm font-mono ${nameValidation && !nameValidation.valid ? "border-destructive" : ""}`}
            disabled={atLimit}
          />
          {nameValidation && !nameValidation.valid && (
            <p className="text-[10px] text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {nameValidation.error}
            </p>
          )}
        </div>

        {/* Database Kind */}
        <div className="space-y-1">
          <Label className="text-xs">Database Kind</Label>
          <Select value={kindId} onValueChange={setKindId} disabled={atLimit}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATABASE_KINDS.map((k) => (
                <SelectItem key={k.id} value={String(k.id)} className="text-xs">
                  {k.name} — {k.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label className="text-xs">Description (optional)</Label>
          <Input
            placeholder="What is this database for?"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            className="h-8 text-sm"
            maxLength={200}
            disabled={atLimit}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={!canSubmit}
            className="h-7 text-xs gap-1"
          >
            {creating && <Loader2 className="h-3 w-3 animate-spin" />}
            Create
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
