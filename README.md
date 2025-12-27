# @frogfish/k2error

**Strict, RFC 7807–compliant error contracts for Node.js & TypeScript.**  
Explicit, grep‑friendly traces and a stable error taxonomy for consistent APIs and services.

`@frogfish/k2error` is a **small, dependency‑free error library** for building consistent back‑end APIs.  
It favors *explicitness over magic* and *human‑placed traces over auto‑generated IDs*.



## Why This Exists

When an error flows through multiple layers (HTTP handler → service → repository → SDK), stack traces alone are noisy and ephemeral.

This library introduces a **deliberate, static trace string** that you place directly in source code at the origin of an error.

Because the trace is **hard‑coded**, you can:

-  Grep your entire codebase and satellite services for the trace
-  Use it in logs, dashboards, alerts, and support tickets
-  Keep stack traces private while still getting precise breadcrumbs

Auto‑generated IDs defeat this purpose — they are random, ephemeral, and not searchable in code.  
This library **intentionally forbids auto‑generation**.



## Core Ideas

1. **Stable service error taxonomy**  
   A well‑defined `ServiceError` enum mapped to canonical HTTP status codes.

2. **Explicit trace strings**  
   You supply a trace string at the throw site and reuse it as the error propagates.

3. **No magic**  
   No auto IDs, no logging, no framework coupling, no dependencies.



## Features

- `ServiceError` enum mapped to HTTP status codes
- `K2Error` with RFC 7807 *Problem Details* shape  
  `{ type, title, status, detail, trace, chain }`
- Explicit, caller‑provided trace string (never auto‑generated)
- Semantic error chaining across layers
- Assertion helpers with TypeScript narrowing
- ESM‑only, strict TypeScript, ships `.d.ts`
- Zero runtime dependencies



## Installation

```sh
npm install @frogfish/k2error
```



## Quick Start

###  Create a trace at the origin

Use a short, human‑meaningful, grep‑friendly literal:

```ts
import { assert } from "@frogfish/k2error";

export function createUser(input: { username?: string }) {
  assert(
    input.username,
    "Username required",
    "t-user-create-username-required-001"
  );
}
```



###  Propagate the same trace through layers

```ts
import { wrap, ServiceError } from "@frogfish/k2error";

try {
  await db.insert(user);
} catch (err) {
  throw wrap(
    err,
    ServiceError.SERVICE_ERROR,
    "t-user-create-dbinsert-002",
    "Failed to persist user"
  );
}
```

One trace → many layers → one searchable breadcrumb.



## Error Semantics & HTTP Mapping

| ServiceError                                                     | HTTP |
|------------------------------------------------------------------|------|
| BAD_REQUEST, VALIDATION_ERROR, INVALID_REQUEST                   | 400  |
| PAYMENT_REQUIRED                                                 | 402  |
| UNAUTHORIZED, INVALID_TOKEN, TOKEN_EXPIRED, AUTH_ERROR           | 401  |
| FORBIDDEN, INSUFFICIENT_SCOPE                                    | 403  |
| NOT_FOUND                                                        | 404  |
| UNSUPPORTED_METHOD                                               | 405  |
| CONFLICT, ALREADY_EXISTS                                         | 409  |
| TOO_MANY_REQUESTS                                                | 429  |
| SYSTEM_ERROR, CONFIGURATION_ERROR, SERVICE_ERROR                 | 500  |
| NOT_IMPLEMENTED                                                  | 501  |
| BAD_GATEWAY                                                      | 502  |
| SERVICE_UNAVAILABLE                                              | 503  |
| GATEWAY_TIMEOUT                                                  | 504  |

**Notes**
- Use `UNAUTHORIZED` (401) for authentication failures
- Use `FORBIDDEN` (403) for authorization failures
- Use `BAD_GATEWAY` (502) for upstream dependencies
- `ALREADY_EXISTS` maps to `409` (conflict)



## API

### Imports

```ts
import {
  K2Error,
  ServiceError,
  assert,
  assertNotNull,
  invariant,
  wrap,
  withSensitive,
  chain,
  rethrow,
  attempt,
  attemptSync,
  attemptResult,
  httpStatus,
  isK2Error,
  serialize,
  PROBLEM_JSON,
} from "@frogfish/k2error";
```



### Interfaces

```ts
interface ErrorChainItem {
  error: ServiceError;
  error_description: string;
  stage?: string;
  at: number;
}

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  trace?: string;
  chain: ReadonlyArray<ErrorChainItem>;
}

interface ProblemDetailsDebug extends ProblemDetails {
  cause?: unknown;
  stack?: string;
}
```



### `class K2Error`

```ts
new K2Error(
  error: ServiceError,
  errorDescription?: string,
  trace?: string,
  originalError?: unknown
)
```

#### Properties

- `error` – semantic error type
- `code` – HTTP status code
- `error_description` – detailed error description
- `trace?` – explicit trace token
- `chain` – semantic propagation hops
- `cause?` – original error
- `sensitive?` – internal-only payload (non-enumerable when set via `setSensitive()` / `withSensitive()`) for rich debugging data that must not be sent to clients
- `name` – error name ("K2Error")
- `kind` – stable discriminator ("K2Error")

#### Methods

- `toJSON()` → RFC 7807 payload (safe for clients)
- `toPublicJSON()` → same as toJSON()
- `toDebugJSON()` → includes stack & cause (logs only)



### Assertions

```ts
assert(condition, errorDescription?, trace?, error?)
assertNotNull(value, errorDescription?, trace?, error?)
invariant(condition, errorDescription?, trace?, error?)
```

All throw `K2Error` and narrow types in TS.



### Wrapping & Chaining

```ts
wrap(err, error?, trace?, errorDescription?)
withSensitive(err, value)
chain(err, trace?, errorDescription?, error?, stage?)
rethrow(err, trace?, errorDescription?, error?, stage?)
```

`chain()` **mutates the error intentionally** to preserve a single causal identity.


## Sensitive Payload (Internal-Only)

Sometimes you need to attach rich context (such as upstream error codes, request payload fragments, or a DB pipeline) for logging and diagnostics, but must never leak this information to clients. The RFC7807 response remains stable and sanitized.

**Why:** Stacks and causes can be private; traces are static and searchable; `sensitive` lets you attach structured diagnostics at the origin without accidentally serializing them.

**How:** The `sensitive` property is intentionally **non-enumerable** when set through `err.setSensitive(value)` or `withSensitive(err, value)`. It will not appear in `JSON.stringify(err)` or in `toPublicJSON()` / `toJSON()`.

**Boundary pattern:** Log `toDebugJSON()` plus `err.sensitive`, but respond using `toPublicJSON()`.

Example (HTTP boundary):
```ts
import { isK2Error, PROBLEM_JSON, wrap } from "@frogfish/k2error";

app.use((err, req, res, next) => {
  const k2 = isK2Error(err) ? err : wrap(err);

  // Internal logs: include debug + sensitive payload if present
  req.log?.error?.({ ...k2.toDebugJSON(), sensitive: (k2 as any).sensitive }, "request failed");

  // Public response: RFC 7807 only (no stack, no cause, no sensitive)
  res.status(k2.code).type(PROBLEM_JSON).send(k2.toPublicJSON());
});
```

Example (MongoDB aggregation):
```ts
import { chain, ServiceError } from "@frogfish/k2error";

try {
  const rows = await collection.aggregate(pipeline).toArray();
  return rows;
} catch (err) {
  // Attach rich diagnostics for logs only
  throw chain(err, "sys_mdb_ag", "Aggregation failed", ServiceError.SYSTEM_ERROR, "repo.aggregate")
    .setSensitive({
      op: "aggregate",
      collection: collection.collectionName,
      pipeline,
      mongo: {
        name: (err as any)?.name,
        message: (err as any)?.message,
        code: (err as any)?.code,
        codeName: (err as any)?.codeName,
      },
    });
}
```

> Keep `error_description` / `chain` free of secrets because they are public.  
> `sensitive` is for structured diagnostics and may contain request fragments; treat it like secrets.



### Attempt Helpers

```ts
await attempt(fn, trace?, errorDescription?, error?, stage?)
attemptSync(fn, trace?, errorDescription?, error?, stage?)
await attemptResult(fn, trace?, errorDescription?, error?, stage?)
```

`attemptResult` never throws and returns `{ ok, value | error }`.



### Utility Functions

```ts
httpStatus(error: ServiceError) → number
serialize(err, opts?) → ProblemDetails | ProblemDetailsDebug
```

Where `opts`: `{ debug?: boolean; trace?: string }`



## HTTP Integration Pattern

Always return RFC 7807 payloads:

```ts
if (isK2Error(err)) {
  res
    .status(err.code)
    .type(PROBLEM_JSON)
    .json(err.toJSON());
}
```



## Trace Design Guidelines

###  Do

- Hard‑code the trace literal at the throw site
- Reuse the same trace as the error propagates
- Keep traces short and lowercase
- Optionally prefix with a mnemonic (`t-user-create-…`)

###  Don’t

- Auto‑generate traces
- Store traces in variables
- Leak stack traces to clients
- Reuse the same trace for unrelated failures



## License

GPL‑3.0‑only. See `LICENSE`.


