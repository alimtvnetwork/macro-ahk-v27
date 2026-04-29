/* eslint-disable sonarjs/no-duplicate-string -- strategy type literals are repeated by design */
/**
 * ValidationRuleEditor — Reusable component for column validation rules.
 *
 * Supports five validation strategies:
 *   1. String: startsWith, endsWith, contains, minLength, maxLength
 *   2. Date: format pattern (e.g. YYYY-MM-DD)
 *   3. Regex: custom pattern with live tester
 *   4. Enum: fixed list of allowed values
 *   5. Number: min/max range constraints
 *
 * Used by ColumnEditor and Schema tab for per-column validation.
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Check, X, FlaskConical } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ValidationStrategy = "string" | "date" | "regex" | "enum" | "number";

export interface StringValidation {
  startsWith?: string;
  endsWith?: string;
  contains?: string;
  minLength?: number;
  maxLength?: number;
}

export interface DateValidation {
  format: string; // e.g. "YYYY-MM-DD", "ISO8601"
}

export interface RegexValidation {
  pattern: string;
  flags?: string;
}

export interface EnumValidation {
  values: string[];
}

export interface NumberValidation {
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface ValidationRule {
  strategy: ValidationStrategy;
  string?: StringValidation;
  date?: DateValidation;
  regex?: RegexValidation;
  enum?: EnumValidation;
  number?: NumberValidation;
}

interface ValidationRuleEditorProps {
  rule: ValidationRule | null;
  onChange: (rule: ValidationRule | null) => void;
  readOnly?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function testStringValidation(value: string, v: StringValidation): boolean {
  if (v.startsWith && !value.startsWith(v.startsWith)) return false;
  if (v.endsWith && !value.endsWith(v.endsWith)) return false;
  if (v.contains && !value.includes(v.contains)) return false;
  if (v.minLength !== undefined && value.length < v.minLength) return false;
  if (v.maxLength !== undefined && value.length > v.maxLength) return false;
  return true;
}

function testDateValidation(value: string, v: DateValidation): boolean {
  if (v.format === "ISO8601") {
    return !isNaN(Date.parse(value));
  }
  // Simple YYYY-MM-DD pattern
  if (v.format === "YYYY-MM-DD") {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
  }
  // Fallback: try parsing
  return !isNaN(Date.parse(value));
}

function testRegexValidation(value: string, v: RegexValidation): boolean {
  try {
    const re = new RegExp(v.pattern, v.flags ?? "");
    return re.test(value);
  } catch {
    return false;
  }
}

function testEnumValidation(value: string, v: EnumValidation): boolean {
  return v.values.includes(value);
}

function testNumberValidation(value: string, v: NumberValidation): boolean {
  const num = Number(value);
  if (isNaN(num)) return false;
  if (v.integer && !Number.isInteger(num)) return false;
  if (v.min !== undefined && num < v.min) return false;
  if (v.max !== undefined && num > v.max) return false;
  return true;
}

// eslint-disable-next-line react-refresh/only-export-components
export function testValidation(value: string, rule: ValidationRule): boolean {
  switch (rule.strategy) {
    case "string": return rule.string ? testStringValidation(value, rule.string) : true;
    case "date": return rule.date ? testDateValidation(value, rule.date) : true;
    case "regex": return rule.regex ? testRegexValidation(value, rule.regex) : true;
    case "enum": return rule.enum ? testEnumValidation(value, rule.enum) : true;
    case "number": return rule.number ? testNumberValidation(value, rule.number) : true;
    default: return true;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function ValidationRuleEditor({ rule, onChange, readOnly = false }: ValidationRuleEditorProps) {
  const [testValue, setTestValue] = useState("");
  const [showTester, setShowTester] = useState(false);

  const strategy = rule?.strategy ?? "string";

  const testResult = useMemo(() => {
    if (!rule || !testValue) return null;
    return testValidation(testValue, rule);
  }, [rule, testValue]);

  const setStrategy = (s: ValidationStrategy) => {
    const base: ValidationRule = { strategy: s };
    if (s === "string") base.string = {};
    if (s === "date") base.date = { format: "YYYY-MM-DD" };
    if (s === "regex") base.regex = { pattern: "", flags: "" };
    if (s === "enum") base.enum = { values: [] };
    if (s === "number") base.number = {};
    onChange(base);
  };

  const updateEnum = (values: string[]) => {
    onChange({ ...rule!, enum: { values } });
  };

  const updateString = (patch: Partial<StringValidation>) => {
    onChange({ ...rule!, string: { ...(rule?.string ?? {}), ...patch } });
  };

  const updateDate = (patch: Partial<DateValidation>) => {
    onChange({ ...rule!, date: { ...(rule?.date ?? { format: "YYYY-MM-DD" }), ...patch } });
  };

  const updateRegex = (patch: Partial<RegexValidation>) => {
    onChange({ ...rule!, regex: { ...(rule?.regex ?? { pattern: "" }), ...patch } });
  };

  const updateNumber = (patch: Partial<NumberValidation>) => {
    onChange({ ...rule!, number: { ...(rule?.number ?? {}), ...patch } });
  };

  if (!rule) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-[10px] text-muted-foreground">No validation</p>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStrategy("string")}
            className="h-5 text-[10px] px-2"
          >
            + Add Validation
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={strategy} onValueChange={(v) => setStrategy(v as ValidationStrategy)} disabled={readOnly}>
            <SelectTrigger className="h-6 w-20 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">String</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="regex">Regex</SelectItem>
              <SelectItem value="enum">Enum</SelectItem>
              <SelectItem value="number">Number</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTester(!showTester)}
            className="h-5 text-[10px] gap-1 px-1.5"
          >
            <FlaskConical className="h-3 w-3" /> Test
          </Button>
        </div>
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            className="h-5 w-5 p-0 text-destructive"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* String validation fields */}
      {strategy === "string" && (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="space-y-0.5">
            <Label className="text-[9px] text-muted-foreground">Starts with</Label>
            <Input
              value={rule.string?.startsWith ?? ""}
              onChange={(e) => updateString({ startsWith: e.target.value || undefined })}
              className="h-6 text-[10px]"
              readOnly={readOnly}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[9px] text-muted-foreground">Ends with</Label>
            <Input
              value={rule.string?.endsWith ?? ""}
              onChange={(e) => updateString({ endsWith: e.target.value || undefined })}
              className="h-6 text-[10px]"
              readOnly={readOnly}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[9px] text-muted-foreground">Contains</Label>
            <Input
              value={rule.string?.contains ?? ""}
              onChange={(e) => updateString({ contains: e.target.value || undefined })}
              className="h-6 text-[10px]"
              readOnly={readOnly}
            />
          </div>
          <div className="flex gap-1.5">
            <div className="space-y-0.5 flex-1">
              <Label className="text-[9px] text-muted-foreground">Min len</Label>
              <Input
                type="number"
                value={rule.string?.minLength ?? ""}
                onChange={(e) => updateString({ minLength: e.target.value ? Number(e.target.value) : undefined })}
                className="h-6 text-[10px]"
                readOnly={readOnly}
              />
            </div>
            <div className="space-y-0.5 flex-1">
              <Label className="text-[9px] text-muted-foreground">Max len</Label>
              <Input
                type="number"
                value={rule.string?.maxLength ?? ""}
                onChange={(e) => updateString({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
                className="h-6 text-[10px]"
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>
      )}

      {/* Date validation fields */}
      {strategy === "date" && (
        <div className="space-y-0.5">
          <Label className="text-[9px] text-muted-foreground">Date format</Label>
          <Select
            value={rule.date?.format ?? "YYYY-MM-DD"}
            onValueChange={(v) => updateDate({ format: v })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              <SelectItem value="ISO8601">ISO 8601</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Regex validation fields */}
      {strategy === "regex" && (
        <div className="space-y-1.5">
          <div className="space-y-0.5">
            <Label className="text-[9px] text-muted-foreground">Pattern</Label>
            <Input
              value={rule.regex?.pattern ?? ""}
              onChange={(e) => updateRegex({ pattern: e.target.value })}
              placeholder="^[A-Z][a-z]+$"
              className="h-6 text-[10px] font-mono"
              readOnly={readOnly}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[9px] text-muted-foreground">Flags</Label>
            <Input
              value={rule.regex?.flags ?? ""}
              onChange={(e) => updateRegex({ flags: e.target.value })}
              placeholder="gi"
              className="h-6 text-[10px] font-mono w-16"
              readOnly={readOnly}
            />
          </div>
        </div>
      )}

      {/* Enum validation fields */}
      {strategy === "enum" && (
        <div className="space-y-1.5">
          <Label className="text-[9px] text-muted-foreground">
            Allowed values (one per line)
          </Label>
          <textarea
            value={(rule.enum?.values ?? []).join("\n")}
            onChange={(e) => updateEnum(e.target.value.split("\n").filter(Boolean))}
            placeholder={"Active\nInactive\nSuspended"}
            className="h-16 w-full text-[10px] font-mono rounded-md border border-border bg-background px-2 py-1 resize-y"
            readOnly={readOnly}
          />
          <div className="flex flex-wrap gap-1">
            {(rule.enum?.values ?? []).map((v, i) => (
              <Badge key={i} variant="outline" className="text-[9px] gap-1">
                {v}
                {!readOnly && (
                  <button
                    className="hover:text-destructive"
                    onClick={() => updateEnum((rule.enum?.values ?? []).filter((_, j) => j !== i))}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Number validation fields */}
      {strategy === "number" && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <Label className="text-[9px] text-muted-foreground">Min</Label>
              <Input
                type="number"
                value={rule.number?.min ?? ""}
                onChange={(e) => updateNumber({ min: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="0"
                className="h-6 text-[10px]"
                readOnly={readOnly}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[9px] text-muted-foreground">Max</Label>
              <Input
                type="number"
                value={rule.number?.max ?? ""}
                onChange={(e) => updateNumber({ max: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="100"
                className="h-6 text-[10px]"
                readOnly={readOnly}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="integer-only"
              checked={rule.number?.integer ?? false}
              onChange={(e) => updateNumber({ integer: e.target.checked || undefined })}
              disabled={readOnly}
              className="h-3 w-3 rounded border-border"
            />
            <Label htmlFor="integer-only" className="text-[9px] text-muted-foreground cursor-pointer">
              Integer only (no decimals)
            </Label>
          </div>
        </div>
      )}

      {/* Live tester */}
      {showTester && (
        <div className="space-y-1 pt-1 border-t border-border">
          <Label className="text-[9px] text-muted-foreground">Test value</Label>
          <div className="flex gap-1.5 items-center">
            <Input
              value={testValue}
              onChange={(e) => setTestValue(e.target.value)}
              placeholder="Enter test value…"
              className="h-6 text-[10px] flex-1"
            />
            {testValue && testResult !== null && (
              <Badge
                variant="outline"
                className={`text-[9px] shrink-0 ${testResult ? "text-green-600 border-green-300" : "text-red-500 border-red-300"}`}
              >
                {testResult ? <Check className="h-3 w-3 mr-0.5" /> : <X className="h-3 w-3 mr-0.5" />}
                {testResult ? "Pass" : "Fail"}
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
