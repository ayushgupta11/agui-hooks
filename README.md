# agui-hooks

[![npm version](https://img.shields.io/npm/v/agui-hooks.svg)](https://www.npmjs.com/package/agui-hooks)
[![license](https://img.shields.io/npm/l/agui-hooks.svg)](https://github.com/ayushgupta11/agui-hooks/blob/main/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/agui-hooks)](https://bundlephobia.com/package/agui-hooks)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

> Production-ready React wrapper for the [AG-UI (Agent-GUI) protocol](https://github.com/ag-ui-protocol/ag-ui) — streaming AI agent state to frontends via SSE.

---

## What is AG-UI?

**AG-UI** is an open, event-based standard for real-time communication between AI agents and frontend applications. Agents publish a stream of typed events over SSE — run lifecycle events, streaming text tokens, tool calls, and arbitrary state patches — and clients react to them in real time.

## What is `agui-hooks`?

`agui-hooks` is a React context + hooks library that handles:

- Opening and managing an SSE connection to any AG-UI compatible endpoint
- Assembling streaming text messages from token events
- Applying RFC 6902 JSON Patch deltas to agent state
- Input sanitization, CSRF tokens, rate limiting, and origin validation
- Automatic reconnection with exponential back-off
- A middleware pipeline for intercepting and transforming events
- Full TypeScript support with exhaustive discriminated-union event types

---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph ReactApp["Your React App"]
        Provider["&lt;AGUIProvider&gt;\nisConnected · isRunning · messages[] · agentState{}"]
        Provider -- "useAGUI()" --> Components

        subgraph Components["Consumer Components"]
            direction LR
            ChatUI["ChatUI"]
            StatusBar["StatusBar"]
            ToolCallLog["ToolCallLog"]
            AgentDebug["AgentDebug"]
        end
    end

    subgraph Endpoint["AG-UI Endpoint (LangGraph / CrewAI / custom Python·Node)"]
        direction TB
        E1["data: {type:'RUN_STARTED', threadId, runId}"]
        E2["data: {type:'TEXT_MESSAGE_START', messageId, ...}"]
        E3["data: {type:'TEXT_MESSAGE_CONTENT', messageId, delta}"]
        E4["data: {type:'TOOL_CALL_START', toolCallId, ...}"]
        E5["data: {type:'STATE_DELTA', delta:[{op:'add',...}]}"]
        E6["data: {type:'RUN_FINISHED', threadId, runId}"]
    end

    ReactApp -- "HTTP POST (message + metadata)" --> Endpoint
    Endpoint -- "SSE response stream" --> ReactApp
```

---

## Installation

```bash
npm install agui-hooks
# peer deps
npm install react react-dom
```

---

## Quick Start

```tsx
import { AGUIProvider, useAGUI } from "agui-hooks";

function App() {
  return (
    <AGUIProvider endpoint="https://my-agent.example.com/stream">
      <Chat />
    </AGUIProvider>
  );
}

function Chat() {
  const { messages, sendMessage, isRunning } = useAGUI();
  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>{m.content}</p>
      ))}
      <button onClick={() => sendMessage("Hello!")} disabled={isRunning}>
        Send
      </button>
    </div>
  );
}
```

---

## Full TypeScript Example

```tsx
import React, { useState } from "react";
import {
  AGUIProvider,
  useAGUIMessages,
  useAGUIRunState,
  useAGUISendMessage,
  type Message,
} from "agui-hooks";

// ─── Provider setup ────────────────────────────────────────────────────────────

export function AgentApp() {
  return (
    <AGUIProvider
      endpoint="/api/agent/stream"
      security={{
        sanitizeInput: true,
        maxMessageLength: 4000,
        csrfToken: () => document.cookie.match(/csrf=([^;]+)/)?.[1] ?? "",
        rateLimit: { maxRequests: 10, windowMs: 60_000 },
      }}
      retryConfig={{ maxAttempts: 3, baseDelayMs: 500 }}
      onRunStarted={(e) => console.log("Run started:", e.runId)}
      onRunError={(e) => console.error("Agent error:", e.message)}
    >
      <ChatUI />
    </AGUIProvider>
  );
}

// ─── Chat UI ───────────────────────────────────────────────────────────────────

function ChatUI() {
  const messages = useAGUIMessages();
  const { isRunning, error } = useAGUIRunState();
  const sendMessage = useAGUISendMessage();
  const [input, setInput] = useState("");

  const submit = async () => {
    if (!input.trim()) return;
    await sendMessage(input);
    setInput("");
  };

  return (
    <div className="chat">
      {error && <div className="error">{error.message}</div>}
      <div className="messages">
        {messages.map((m: Message) => (
          <div key={m.id} className={`message ${m.role}`}>
            {m.content}
            {m.isStreaming && <span className="cursor">▌</span>}
          </div>
        ))}
      </div>
      <div className="input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Type a message…"
        />
        <button onClick={submit} disabled={isRunning}>
          {isRunning ? "Thinking…" : "Send"}
        </button>
      </div>
    </div>
  );
}
```

---

## `<AGUIProvider>` Props

| Prop                   | Type                                    | Default      | Description                                    |
| ---------------------- | --------------------------------------- | ------------ | ---------------------------------------------- |
| `endpoint`             | `string`                                | **required** | AG-UI SSE endpoint URL                         |
| `headers`              | `Record<string, string>`                | `{}`         | Extra HTTP request headers                     |
| `children`             | `ReactNode`                             | **required** | Child components                               |
| `debounceMs`           | `number`                                | `16`         | Debounce for `TEXT_MESSAGE_CONTENT` re-renders |
| `maxEventHistory`      | `number`                                | `500`        | Max events retained in `events[]`              |
| `security`             | `SecurityConfig`                        | `{}`         | Security configuration                         |
| `retryConfig`          | `Partial<RetryConfig>`                  | see below    | Connection retry configuration                 |
| `middleware`           | `EventMiddleware[]`                     | `[]`         | Event middleware pipeline                      |
| `customEventHandlers`  | `Record<string, EventHandler>`          | `{}`         | Handlers keyed by custom event name            |
| `onRunStarted`         | `EventHandler<RunStartedEvent>`         | —            | Called on `RUN_STARTED`                        |
| `onRunFinished`        | `EventHandler<RunFinishedEvent>`        | —            | Called on `RUN_FINISHED`                       |
| `onRunError`           | `EventHandler<RunErrorEvent>`           | —            | Called on `RUN_ERROR`                          |
| `onStepStarted`        | `EventHandler<StepStartedEvent>`        | —            | Called on `STEP_STARTED`                       |
| `onStepFinished`       | `EventHandler<StepFinishedEvent>`       | —            | Called on `STEP_FINISHED`                      |
| `onTextMessageStart`   | `EventHandler<TextMessageStartEvent>`   | —            | Called on `TEXT_MESSAGE_START`                 |
| `onTextMessageContent` | `EventHandler<TextMessageContentEvent>` | —            | Called on `TEXT_MESSAGE_CONTENT`               |
| `onTextMessageEnd`     | `EventHandler<TextMessageEndEvent>`     | —            | Called on `TEXT_MESSAGE_END`                   |
| `onToolCallStart`      | `EventHandler<ToolCallStartEvent>`      | —            | Called on `TOOL_CALL_START`                    |
| `onToolCallArgs`       | `EventHandler<ToolCallArgsEvent>`       | —            | Called on `TOOL_CALL_ARGS`                     |
| `onToolCallEnd`        | `EventHandler<ToolCallEndEvent>`        | —            | Called on `TOOL_CALL_END`                      |
| `onToolCallResult`     | `EventHandler<ToolCallResultEvent>`     | —            | Called on `TOOL_CALL_RESULT`                   |
| `onStateSnapshot`      | `EventHandler<StateSnapshotEvent>`      | —            | Called on `STATE_SNAPSHOT`                     |
| `onStateDelta`         | `EventHandler<StateDeltaEvent>`         | —            | Called on `STATE_DELTA`                        |
| `onMessagesSnapshot`   | `EventHandler<MessagesSnapshotEvent>`   | —            | Called on `MESSAGES_SNAPSHOT`                  |
| `onRaw`                | `EventHandler<RawEvent>`                | —            | Called on `RAW`                                |
| `onCustom`             | `EventHandler<CustomEvent>`             | —            | Called on any `CUSTOM` event                   |

---

## `useAGUI()` Return Value

```typescript
interface AGUIContextValue {
  // State
  isConnected: boolean; // SSE connection is open
  isRunning: boolean; // Agent run in progress
  error: Error | null; // Last error
  messages: Message[]; // Assembled message history
  events: AGUIEvent[]; // Raw event history
  currentRun: RunState | null; // Active run metadata
  agentState: Record<string, unknown>; // Agent's key-value state

  // Actions
  sendMessage(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  stopRun(): void;
  clearHistory(): void;

  // Event bus
  on<T extends AGUIEvent>(
    eventType: T["type"] | "*",
    handler: EventHandler<T>,
  ): () => void;
  emit(name: string, value: unknown): void;
}
```

---

## Granular Hooks

Import only what you need — all are tree-shakeable:

```typescript
// Just messages
const messages = useAGUIMessages();

// Run status
const { isRunning, currentRun, error } = useAGUIRunState();

// Agent state (STATE_SNAPSHOT / STATE_DELTA)
const agentState = useAGUIAgentState();

// Raw event history
const events = useAGUIEventHistory();

// Stable sendMessage reference
const sendMessage = useAGUISendMessage();
```

---

## Event Handler Reference

All 17 AG-UI events with their payloads:

```typescript
// Run lifecycle
onRunStarted(e: { type: 'RUN_STARTED'; threadId: string; runId: string })
onRunFinished(e: { type: 'RUN_FINISHED'; threadId: string; runId: string })
onRunError(e: { type: 'RUN_ERROR'; message: string; code?: string })

// Step lifecycle
onStepStarted(e: { type: 'STEP_STARTED'; stepName: string; stepId?: string })
onStepFinished(e: { type: 'STEP_FINISHED'; stepName: string; stepId?: string })

// Text streaming
onTextMessageStart(e: { type: 'TEXT_MESSAGE_START'; messageId: string; role: MessageRole })
onTextMessageContent(e: { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string })
onTextMessageEnd(e: { type: 'TEXT_MESSAGE_END'; messageId: string })

// Tool calls
onToolCallStart(e: { type: 'TOOL_CALL_START'; toolCallId: string; toolName: string })
onToolCallArgs(e: { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string })
onToolCallEnd(e: { type: 'TOOL_CALL_END'; toolCallId: string })
onToolCallResult(e: { type: 'TOOL_CALL_RESULT'; toolCallId: string; result: string; isError?: boolean })

// State
onStateSnapshot(e: { type: 'STATE_SNAPSHOT'; snapshot: Record<string, unknown> })
onStateDelta(e: { type: 'STATE_DELTA'; delta: Operation[] })  // RFC 6902
onMessagesSnapshot(e: { type: 'MESSAGES_SNAPSHOT'; messages: Message[] })

// Generic
onRaw(e: { type: 'RAW'; event: string; data: unknown })
onCustom(e: { type: 'CUSTOM'; name: string; value: unknown })
```

---

## Custom Events

Emit and subscribe to your own events across the component tree:

```tsx
// In any component inside <AGUIProvider>
function Counter() {
  const { emit, on } = useAGUI();

  useEffect(() => {
    const off = on("CUSTOM", (e) => {
      if (e.name === "increment") console.log("count:", e.value);
    });
    return off; // cleanup
  }, [on]);

  return <button onClick={() => emit("increment", 1)}>+1</button>;
}
```

---

## Middleware

Intercept, transform, or cancel events in a pipeline:

```tsx
<AGUIProvider
  endpoint="/api/agent"
  middleware={[
    {
      eventType: '*',
      before: (event) => {
        console.log('[middleware] incoming:', event.type);
        // Return false to cancel the event
      },
      after: (event) => {
        analytics.track('agent_event', { type: event.type });
      },
    },
    {
      eventType: 'TEXT_MESSAGE_CONTENT',
      before: (event) => {
        // Example: block profanity
        if (event.delta.includes('badword')) return false;
      },
    },
  ]}
>
```

---

## Security Configuration

```tsx
<AGUIProvider
  endpoint="/api/agent"
  security={{
    // Strip HTML tags, javascript: URIs, inline event attrs (default: true)
    sanitizeInput: true,

    // CSRF token (string or factory function)
    csrfToken: () => getCsrfToken(),

    // Reject messages longer than N chars (default: 8000)
    maxMessageLength: 2000,

    // Only allow connections from these origins
    allowedOrigins: ['https://myapp.com'],

    // Sliding-window rate limiting
    rateLimit: {
      maxRequests: 10,
      windowMs: 60_000, // 10 requests per minute
    },
  }}
>
```

---

## Retry / Connection Configuration

```tsx
<AGUIProvider
  endpoint="/api/agent"
  retryConfig={{
    maxAttempts: 5,        // Give up after 5 consecutive failures
    baseDelayMs: 1000,     // Wait 1 s before first retry
    backoffMultiplier: 2,  // Double each time: 1s → 2s → 4s → 8s → 16s
    maxDelayMs: 30_000,    // Cap at 30 seconds
    jitter: 0.2,           // ±20% random jitter to avoid thundering herd
  }}
>
```

---

## Future Roadmap

1. **WebSocket transport** — `transport: 'sse' | 'websocket'` bidirectional events
2. **Optimistic UI** — show user messages immediately before server confirms
3. **Persistence adapter** — pluggable localStorage / IndexedDB message history
4. **React Native support** — `ReadableStream` polyfill for RN
5. **`useAGUITool(toolName)`** — subscribe to a specific tool's lifecycle
6. **Devtools** — Chrome panel showing live event stream
7. **Schema validation** — optional Zod integration for runtime event validation
8. **Multi-agent** — `endpoint={[url1, url2]}` fan-out to multiple agents
9. **Interrupts** — `sendInterrupt()` to pause/resume agent mid-run
10. **Abort/cancel** — `cancelRun()` that sends a cancel signal to the endpoint

---

## Examples

### sample-app

![agui-hooks sample-app demo](./examples/sample-app/demo.png)

An interactive demo built with **Vite + React 18 + TypeScript + Tailwind CSS v3**.

The app is a split-pane UI — chat interface on the left, live event timeline on the right — covering all 17 AG-UI event types across five hand-crafted scenarios. The backend is fully mocked with [MSW v2](https://mswjs.io/) so **no real server is needed**.

**Source:** [`examples/sample-app/`](./examples/sample-app/)

#### Running locally

```bash
# 1. Install dependencies
cd examples/sample-app
npm install

# 2. Generate the MSW service-worker file (one-time)
npx msw init public/ --save

# 3. Start the dev server
npm run dev
# → http://localhost:5173
```

#### What you'll see

The UI has two panels:

- **Left — Chat panel** renders streaming text bubbles, collapsible tool-call cards, an agent-state key/value grid, and interactive custom components (e.g. a live poll). An input bar at the bottom lets you send messages and switch scenarios mid-conversation.
- **Right — Event timeline** logs every AG-UI event as it arrives, colour-coded by category. Click any row to expand the full JSON payload.

#### Scenarios

Pick a scenario from the header bar before sending a message:

| Scenario | Header label | What it demonstrates |
|---|---|---|
| Simple chat | **Simple Chat** | `TEXT_MESSAGE_START/CONTENT/END` — token-by-token text streaming |
| Tool call | **Tool Use** | `STEP_*` + `TOOL_CALL_START/ARGS/END/RESULT` + post-tool streamed reply |
| Multi-step agent | **Multi-Step** | `STATE_SNAPSHOT`, multiple `STATE_DELTA` patches, two named `STEP_*` pairs |
| Error recovery | **Error** | Partial text stream cut short by a `RUN_ERROR` event |
| Interactive component | **Component Demo** | `CUSTOM` events (`COMPONENT_DATA_START/DATA/END`) streaming a JSON payload that renders as a live, voteable poll widget |

#### Architecture of the mock

```
src/mocks/
├── scenarios.ts   # 5 pure functions — return [{delay, event}] arrays, no agui-hooks deps
├── handlers.ts    # MSW POST /api/chat → ReadableStream SSE, delta-timed via setTimeout
└── browser.ts     # setupWorker export, started in main.tsx before React mounts
```

Each scenario builder returns a flat list of `{ delay, event }` pairs where `delay` is **absolute milliseconds from stream start**. The handler converts this to a delta-based `setTimeout` loop so events fire at wall-clock intervals that match the scenario's intended cadence.

#### Custom component events

The **Component Demo** scenario introduces three `CUSTOM` events that stream component data from the agent:

| Event name | `value` shape | Purpose |
|---|---|---|
| `COMPONENT_DATA_START` | `{ componentId, componentType }` | Opens a new component stream |
| `COMPONENT_DATA` | `{ componentId, delta }` | Appends a JSON chunk to the buffer |
| `COMPONENT_DATA_END` | `{ componentId }` | Marks the stream complete; triggers render |

The `useComponentStream()` hook (in `src/hooks/useComponentStream.ts`) subscribes to `CUSTOM` events via `useAGUI().on('CUSTOM', …)`, accumulates the raw string, and exposes `ComponentStreamData[]`. `ComponentRenderer` shows a skeleton while streaming and hands the parsed payload to a type-specific component (`PollComponent` for `componentType: "poll"`) once `done` is true.

---

## License

MIT © [Ayush Gupta](https://github.com/ayushgupta11)
