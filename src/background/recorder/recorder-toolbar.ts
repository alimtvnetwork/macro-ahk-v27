/**
 * Marco Extension — Shadow-Root Recorder Toolbar
 *
 * Self-contained floating toolbar mounted into a closed Shadow DOM so that
 * host-page CSS cannot leak in. Wraps the pure {@link recorderReducer} and
 * exposes three controls — Start, Pause/Resume, Stop — that drive the
 * RecordingPhase state machine.
 *
 * No chrome.* APIs, no React — pure DOM so it can be injected by the content
 * script during macro recording. State changes are emitted via the
 * {@link RecorderToolbarOptions.onPhaseChange} callback so the caller can
 * persist sessions, broadcast messages, or wire shortcuts on top.
 *
 * @see ./recorder-store.ts          — Pure reducer this toolbar drives.
 * @see ./recorder-session-types.ts  — RecordingPhase / RecordingSession types.
 * @see spec/26-chrome-extension-generic/06-ui-and-design-system/10-toolbar-recording-ux.md
 */

import {
    IDLE_SESSION,
    type RecorderAction,
    recorderReducer,
} from "./recorder-store";
import type { RecordingPhase, RecordingSession } from "./recorder-session-types";

/* ------------------------------------------------------------------ */
/*  Public contract                                                    */
/* ------------------------------------------------------------------ */

export const RECORDER_TOOLBAR_HOST_ID = "marco-recorder-toolbar-host";

export interface RecorderToolbarOptions {
    readonly ProjectSlug: string;
    /** Factory for SessionId — injected so tests are deterministic. */
    readonly NewSessionId: () => string;
    /** Wall-clock provider — injected so tests are deterministic. */
    readonly Now: () => string;
    /** Notified after each successful phase transition. */
    readonly OnPhaseChange?: (phase: RecordingPhase, session: RecordingSession) => void;
}

export interface RecorderToolbarHandle {
    /** The DOM host element appended to <body>. */
    readonly Host: HTMLElement;
    /** The closed Shadow Root containing the toolbar UI. */
    readonly Root: ShadowRoot;
    /** Current immutable session snapshot. */
    GetSession(): RecordingSession;
    /** Programmatic equivalents of the three buttons. */
    Start(): void;
    Pause(): void;
    Resume(): void;
    Stop(): void;
    /** Removes the toolbar from the DOM. Idempotent. */
    Destroy(): void;
}

/* ------------------------------------------------------------------ */
/*  Styling — scoped inside the shadow root                            */
/* ------------------------------------------------------------------ */

const TOOLBAR_CSS = `
:host { all: initial; }
.toolbar {
    position: fixed; top: 16px; right: 16px; z-index: 2147483647;
    display: inline-flex; gap: 6px; padding: 8px 10px;
    background: #111; color: #fff; border-radius: 8px;
    font: 500 12px/1 system-ui, -apple-system, sans-serif;
    box-shadow: 0 6px 20px rgba(0,0,0,.35);
}
.btn {
    appearance: none; border: 0; cursor: pointer;
    padding: 6px 10px; border-radius: 6px;
    background: #2a2a2a; color: #fff; font: inherit;
}
.btn:disabled { opacity: .4; cursor: not-allowed; }
.btn[data-action="start"]  { background: #16a34a; }
.btn[data-action="pause"]  { background: #f59e0b; color: #111; }
.btn[data-action="resume"] { background: #16a34a; }
.btn[data-action="stop"]   { background: #dc2626; }
.phase {
    align-self: center; padding: 0 8px;
    text-transform: uppercase; letter-spacing: .08em; font-size: 10px;
}
`;

/* ------------------------------------------------------------------ */
/*  Mount                                                              */
/* ------------------------------------------------------------------ */

export function mountRecorderToolbar(
    options: RecorderToolbarOptions,
    container: ParentNode = (typeof document !== "undefined" ? document.body : (null as unknown as ParentNode)),
): RecorderToolbarHandle {
    if (container === null || container === undefined) {
        throw new Error("mountRecorderToolbar: no container available (document.body missing)");
    }

    let session: RecordingSession = IDLE_SESSION;

    const host = document.createElement("div");
    host.id = RECORDER_TOOLBAR_HOST_ID;
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = TOOLBAR_CSS;
    root.appendChild(style);

    const bar = document.createElement("div");
    bar.className = "toolbar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Marco Recorder");

    const phaseLabel = document.createElement("span");
    phaseLabel.className = "phase";

    const startBtn = makeButton("start", "Start");
    const pauseBtn = makeButton("pause", "Pause");
    const stopBtn  = makeButton("stop", "Stop");

    bar.append(phaseLabel, startBtn, pauseBtn, stopBtn);
    root.appendChild(bar);
    container.appendChild(host);

    function dispatch(action: RecorderAction): void {
        const next = recorderReducer(session, action);
        session = next;
        render();
        options.OnPhaseChange?.(next.Phase, next);
    }

    function start(): void {
        dispatch({
            Kind: "Start",
            ProjectSlug: options.ProjectSlug,
            SessionId: options.NewSessionId(),
            StartedAt: options.Now(),
        });
    }
    function pause(): void  { dispatch({ Kind: "Pause"  }); }
    function resume(): void { dispatch({ Kind: "Resume" }); }
    function stop(): void   { dispatch({ Kind: "Stop"   }); }

    startBtn.addEventListener("click", () => { start(); });
    stopBtn.addEventListener("click",  () => { stop();  });
    pauseBtn.addEventListener("click", () => {
        if (session.Phase === "Recording") { pause(); return; }
        if (session.Phase === "Paused")    { resume(); return; }
    });

    function render(): void {
        const phase = session.Phase;
        phaseLabel.textContent = phase;

        startBtn.disabled = phase !== "Idle";
        stopBtn.disabled  = phase === "Idle";

        if (phase === "Paused") {
            pauseBtn.textContent = "Resume";
            pauseBtn.dataset.action = "resume";
            pauseBtn.disabled = false;
        } else {
            pauseBtn.textContent = "Pause";
            pauseBtn.dataset.action = "pause";
            pauseBtn.disabled = phase !== "Recording";
        }
    }

    render();

    let destroyed = false;
    return {
        Host: host,
        Root: root,
        GetSession: () => session,
        Start: start,
        Pause: pause,
        Resume: resume,
        Stop: stop,
        Destroy: () => {
            if (destroyed) { return; }
            destroyed = true;
            host.remove();
        },
    };
}

function makeButton(action: "start" | "pause" | "stop", label: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.dataset.action = action;
    btn.textContent = label;
    return btn;
}
