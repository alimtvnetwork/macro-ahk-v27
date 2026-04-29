import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/use-onboarding";
import { AlertTriangle } from "lucide-react";
import {
  Rocket,
  FolderCode,
  Globe,
  Shield,
  ChevronRight,
  ChevronLeft,
  Check,
  ExternalLink,
  Zap,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { logError } from "@/components/options/options-logger";

interface OnboardingFlowProps {
  onComplete: () => void;
}

const STEPS = ["welcome", "project", "permissions", "ready"] as const;
type Step = (typeof STEPS)[number];

// eslint-disable-next-line max-lines-per-function
export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [direction, setDirection] = useState(1);
  const stepIndex = STEPS.indexOf(step);

  /**
   * Ordered history of every step the wizard has shown, including the
   * initial mount. Mirrored onto the root via `data-onboarding-step-history`
   * (comma-separated) and broadcast via the
   * `marco:onboarding-step-change` CustomEvent so E2E tests can assert
   * the EXACT sequence of transitions instead of inferring from final state.
   */
  const stepHistoryRef = useRef<Step[]>([]);
  const [stepHistory, setStepHistory] = useState<Step[]>([]);

  useEffect(() => {
    const previous = stepHistoryRef.current[stepHistoryRef.current.length - 1];
    if (previous === step) {
      return; // ignore re-renders that don't change step
    }
    const next = [...stepHistoryRef.current, step];
    stepHistoryRef.current = next;
    setStepHistory(next);

    // Broadcast for any external listeners (e.g. Playwright addInitScript).
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("marco:onboarding-step-change", {
          detail: { from: previous ?? null, to: step, history: next, index: next.length - 1 },
        }),
      );
    }
  }, [step]);

  const goNext = () => {
    const nextIndex = stepIndex + 1;
    const isLastStep = nextIndex >= STEPS.length;

    if (isLastStep) {
      onComplete();
    } else {
      setDirection(1);
      setStep(STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = stepIndex - 1;
    const hasPreviousStep = prevIndex >= 0;

    if (hasPreviousStep) {
      setDirection(-1);
      setStep(STEPS[prevIndex]);
    }
  };

  const isLastStep = stepIndex === STEPS.length - 1;
  const ctaTestId = isLastStep ? "onboarding-get-started" : "onboarding-continue";
  const ctaLabel = isLastStep ? "Get Started" : "Continue";
  const ctaAriaLabel = isLastStep
    ? "Get started and finish onboarding"
    : `Continue to next onboarding step (${stepIndex + 2} of ${STEPS.length})`;

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      data-testid="onboarding-flow"
      data-onboarding-step={step}
      data-onboarding-step-history={stepHistory.join(",")}
      data-onboarding-transition-count={String(stepHistory.length)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-active-heading"
      aria-describedby="onboarding-progress"
    >
      {/* Progress Bar */}
      <div
        className="w-full bg-muted h-1"
        id="onboarding-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={stepIndex + 1}
        aria-label={`Onboarding step ${stepIndex + 1} of ${STEPS.length}`}
      >
        <div
          className="h-1 bg-primary transition-all duration-500 ease-out"
          style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl relative overflow-hidden">
            <div
              key={step}
              className="page-enter"
            >
              <OnboardingStepBoundary stepId={step}>
                {step === "welcome" && <WelcomeStep />}
                {step === "project" && <ProjectStep />}
                {step === "permissions" && <PermissionsStep />}
                {step === "ready" && <ReadyStep />}
              </OnboardingStepBoundary>
            </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8" role="group" aria-label="Onboarding navigation">
            <Button
              variant="ghost"
              onClick={goBack}
              disabled={stepIndex === 0}
              className="gap-1.5"
              aria-label="Go back to previous onboarding step"
              aria-disabled={stepIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>

            <div
              className="flex gap-1.5"
              role="tablist"
              aria-label="Onboarding step indicators"
            >
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  role="tab"
                  aria-selected={i === stepIndex}
                  aria-label={`Step ${i + 1}: ${s}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i <= stepIndex
                      ? "w-6 bg-primary"
                      : "w-1.5 bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>

            <Button
              onClick={goNext}
              className="gap-1.5"
              data-testid={ctaTestId}
              data-onboarding-cta={isLastStep ? "finish" : "next"}
              aria-label={ctaAriaLabel}
            >
              {isLastStep ? (
                <>
                  {ctaLabel}
                  <Rocket className="h-4 w-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  {ctaLabel}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Components                                                    */
/* ------------------------------------------------------------------ */

function WelcomeStep() {
  return (
    <div className="text-center space-y-6">
      <div className="anim-scale-bounce anim-delay-1 mx-auto h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
        <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-2xl">M</span>
        </div>
      </div>

      <div className="space-y-3 anim-fade-in-up anim-delay-2">
        <h1
          id="onboarding-active-heading"
          className="text-3xl font-bold tracking-tight"
          data-testid="onboarding-welcome-heading"
        >
          Welcome to Marco
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Your programmable browser automation layer for developer workspaces.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4">
        {[
          { icon: <Zap className="h-5 w-5" />, title: "Auto-Inject", description: "Scripts run on matching pages automatically" },
          { icon: <Shield className="h-5 w-5" />, title: "Error Isolation", description: "Script errors are caught and logged safely" },
          { icon: <FolderCode className="h-5 w-5" />, title: "Project System", description: "Organize scripts by URL pattern groups" },
        ].map((feature, i) => (
          <div
            key={feature.title}
            className="anim-fade-in-up"
            style={{ animationDelay: `${0.3 + i * 0.1}s` }}
          >
            <FeatureCard {...feature} />
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
function ProjectStep() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="outline" className="mb-2">
          Pre-configured
        </Badge>
         <h2 className="text-2xl font-bold tracking-tight">
           Default Project: Macro Controller
         </h2>
         <p className="text-muted-foreground">
           Marco ships with a built-in project targeting supported domains. Here's
           what it does:
         </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="font-medium text-sm">URL Patterns</div>
              <div className="text-xs text-muted-foreground mt-1 space-y-1">
                <code className="block bg-muted px-2 py-1 rounded">
                  https://lovable.dev/projects/*
                </code>
                <code className="block bg-muted px-2 py-1 rounded">
                  https://*.lovable.app/*
                </code>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="font-medium text-sm">Settings</div>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <div>
                  <Check className="inline h-3 w-3 mr-1 text-[hsl(var(--success))]" />
                  Script isolation enabled
                </div>
                <div>
                  <Check className="inline h-3 w-3 mr-1 text-[hsl(var(--success))]" />
                  Retry on navigate enabled
                </div>
                <div>
                  <Check className="inline h-3 w-3 mr-1 text-[hsl(var(--success))]" />
                  Log level: info
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <FolderCode className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="font-medium text-sm">Scripts</div>
              <div className="text-xs text-muted-foreground mt-1">
                No scripts are pre-loaded. Add your own in the Options dashboard
                or import a <code className="bg-muted px-1 rounded">marco-project.json</code> bundle.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
function PermissionsStep() {
  const { granted, loading, requestPermission } = usePermissions();

  const optionalOrigins = [
    {
      origin: "https://*/*",
      label: "All HTTPS Sites",
      description: "Inject scripts on any HTTPS website",
      risk: "broad",
    },
    {
      origin: "http://localhost/*",
      label: "Localhost",
      description: "Inject on local development servers",
      risk: "low",
    },
    {
      origin: "https://github.com/*",
      label: "GitHub",
      description: "Automate GitHub workflows",
      risk: "low",
    },
  ];

  const handleRequest = async (origin: string) => {
    const isGranted = await requestPermission(origin);
    const isSuccess = isGranted === true;

    if (isSuccess) {
      toast.success("Permission granted");
    } else {
      toast.error("Permission denied — you can grant it later in Settings");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="outline" className="mb-2">
          Optional
        </Badge>
        <h2 className="text-2xl font-bold tracking-tight">
          Host Permissions
        </h2>
        <p className="text-muted-foreground">
           Marco needs host permissions to inject scripts on additional domains.
           These are <strong>optional</strong> — skip if you only use the default target sites.
         </p>
      </div>

      <div className="space-y-3">
        {optionalOrigins.map((item, i) => {
          const isGranted = granted.some((g) => g === item.origin);

          return (
            <div
              key={item.origin}
              className="anim-fade-in-up"
              style={{ animationDelay: `${0.15 + i * 0.1}s` }}
            >
              <Card
                className={`transition-colors ${isGranted ? "border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5" : ""}`}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                      {isGranted ? (
                        <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  {isGranted ? (
                    <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">
                      Granted
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRequest(item.origin)}
                      disabled={loading}
                    >
                      Grant
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        You can change permissions anytime in your browser's extension settings.
      </p>
    </div>
  );
}

function ReadyStep() {
  return (
    <div className="text-center space-y-6">
      <div className="anim-spin-in anim-delay-1 mx-auto h-20 w-20 rounded-2xl bg-[hsl(var(--success))]/10 flex items-center justify-center">
        <Check className="h-10 w-10 text-[hsl(var(--success))]" />
      </div>

      <div className="space-y-3 anim-fade-in-up anim-delay-3">
        <h2
          id="onboarding-active-heading"
          className="text-2xl font-bold tracking-tight"
          data-testid="onboarding-ready-heading"
        >
          You're All Set
        </h2>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Marco is ready. Visit a matching URL and your scripts will
          auto-inject.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 max-w-sm mx-auto">
        {[
          { icon: <FolderCode className="h-4 w-4" />, label: "Add Scripts", hint: "Options → Projects" },
          { icon: <ExternalLink className="h-4 w-4" />, label: "Import Bundle", hint: "marco-project.json" },
        ].map((action, i) => (
          <div
            key={action.label}
            className="anim-fade-in-up"
            style={{ animationDelay: `${0.5 + i * 0.1}s` }}
          >
            <QuickAction {...action} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared Sub-Components                                              */
/* ------------------------------------------------------------------ */

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="text-center">
      <CardContent className="pt-5 pb-4 px-3 space-y-2">
        <div className="mx-auto h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        <div className="text-xs font-medium">{title}</div>
        <div className="text-[10px] text-muted-foreground leading-tight">
          {description}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Card className="cursor-default hover:border-primary/30 transition-colors">
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className="text-primary">{icon}</div>
        <div>
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Error Boundary                                                */
/* ------------------------------------------------------------------ */

interface OnboardingStepBoundaryProps {
  stepId: Step;
  children: ReactNode;
}

interface OnboardingStepBoundaryState {
  errorMessage: string | null;
}

/**
 * Catches render-time errors thrown by an onboarding step and surfaces a
 * stable, testable failure UI. E2E tests assert against
 * `data-testid="onboarding-step-error"` so a failed step renders an
 * actionable error message instead of timing out on a missing locator.
 */
class OnboardingStepBoundary extends Component<
  OnboardingStepBoundaryProps,
  OnboardingStepBoundaryState
> {
  state: OnboardingStepBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: Error): OnboardingStepBoundaryState {
    const message = error?.message ?? String(error);
    return { errorMessage: message || "Unknown error rendering onboarding step" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(
      "OnboardingStepBoundary",
      `Onboarding step "${this.props.stepId}" failed to render\n  Path: <OnboardingStepBoundary stepId="${this.props.stepId}"> — componentDidCatch\n  Missing: Successful render of step children\n  Reason: ${error?.message ?? String(error)} — componentStack: ${info?.componentStack ?? "<unavailable>"}`,
      error,
    );
  }

  render(): ReactNode {
    const { errorMessage } = this.state;
    const { stepId, children } = this.props;

    if (errorMessage !== null) {
      return (
        <div
          className="text-center space-y-4"
          data-testid="onboarding-step-error"
          data-onboarding-error-step={stepId}
        >
          <div className="mx-auto h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight">
              Onboarding step failed to load
            </h2>
            <p
              className="text-sm text-destructive font-mono break-words max-w-md mx-auto"
              data-testid="onboarding-step-error-message"
            >
              {errorMessage}
            </p>
            <p className="text-xs text-muted-foreground">
              Step: <code className="bg-muted px-1 rounded">{stepId}</code>
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}
