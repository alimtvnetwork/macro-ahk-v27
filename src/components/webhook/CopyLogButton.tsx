import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatWebhookDeliveryLog,
  type WebhookDeliveryResult,
} from "./format-webhook-log";

interface CopyLogButtonProps {
  entry: WebhookDeliveryResult;
  className?: string;
  size?: "sm" | "default" | "icon";
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy path
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * "Copy log to clipboard" button for a single WebhookDeliveryResult.
 * Drops next to each delivery entry. Dark-themed, sonner toast on result,
 * 2-second checkmark feedback. Pure presentational — no business logic.
 */
export function CopyLogButton({ entry, className, size = "sm" }: CopyLogButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = formatWebhookDeliveryLog(entry);
    const ok = await writeToClipboard(text);
    if (ok) {
      setCopied(true);
      toast.success("Webhook log copied");
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy log to clipboard");
    }
  }, [entry]);

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={handleCopy}
      className={cn("gap-2", className)}
      aria-label="Copy webhook log to clipboard"
      title="Copy webhook log to clipboard"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Copy log</span>
        </>
      )}
    </Button>
  );
}
