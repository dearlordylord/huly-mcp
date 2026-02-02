# Tech Talk: Parallel Development with Effect-TS and Git Worktrees

## Core Thesis

> "We always model the outside world - whether explicitly or implicitly. The only question is whether we use this model for our benefit."

In untyped/imperative code, the model is implicit: URL strings, network calls, runtime property access. In Effect-TS, the model is explicit: typed services, schemas, layers. **Explicit models can be swapped. Implicit models cannot.**

---

## Talk Structure

### Part 1: The Problem

**Slide: "The Integration Testing Trap"**

```
Developer A: "I need to test my feature"
Developer B: "Me too, but the staging server is busy"
Developer C: "I'm waiting for the webhook endpoint to be deployed"
Developer D: "My tests are flaky because of network timeouts"
```

**Slide: "Serial Development"**

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│ Feature │ → │ Feature │ → │ Feature │ → │ Feature │
│    A    │   │    B    │   │    C    │   │    D    │
└─────────┘   └─────────┘   └─────────┘   └─────────┘
     │             │             │             │
     └─────────────┴─────────────┴─────────────┘
                        │
                   Shared Test
                   Environment
                   (bottleneck)
```

**Key points:**
- External dependencies create bottlenecks
- Tests become flaky (network, state pollution)
- CI/CD slows down
- Developers wait on each other

---

### Part 2: The Insight

**Slide: "You Already Have a Model"**

Show progression from implicit to explicit:

```python
# Python - Implicit Model
response = requests.get(f"{base_url}/issues/{id}")
data = response.json()
title = data["title"]  # Runtime: "hope this exists"
```

```typescript
// TypeScript - Slightly Explicit
interface Issue { title: string }
const data: Issue = await fetch(url).then(r => r.json())
```

```typescript
// Effect-TS - Fully Explicit Model
const IssueSchema = Schema.Struct({
  title: Schema.NonEmptyString,
  // ...
})

class IssueService extends Context.Tag("IssueService")<...>() {
  static layer = // real implementation
  static testLayer = // mock implementation
}
```

**Slide: "The Model IS The Contract"**

```
┌─────────────────────────────────────────────────────────┐
│                    Your Code                            │
│                                                         │
│   const issue = yield* IssueService.getById(id)        │
│   //            ↑                                       │
│   //    Depends on SERVICE, not implementation          │
└─────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │Production│    │  Test    │    │ Staging  │
    │  Layer   │    │  Layer   │    │  Layer   │
    │          │    │          │    │          │
    │ HTTP →   │    │ In-mem   │    │ HTTP →   │
    │ Huly API │    │ Map      │    │ Staging  │
    └──────────┘    └──────────┘    └──────────┘
```

**Key insight:** The service interface IS your model of the outside world. You need this model anyway to write code. Effect just makes it swappable.

---

### Part 3: The Architecture

**Slide: "Effect Layer System"**

```typescript
// 1. Define the contract (what you need from the world)
class HulyClient extends Context.Tag("HulyClient")<
  HulyClient,
  {
    readonly findAll: <T>(class_: Ref<Class<T>>) => Effect<T[], HulyError>
    readonly findOne: <T>(class_: Ref<Class<T>>, query: Q) => Effect<T | undefined, HulyError>
  }
>() {}

// 2. Production implementation (real world)
HulyClient.layer = Layer.scoped(HulyClient,
  Effect.gen(function* () {
    const client = yield* connectToHuly(config)
    return {
      findAll: (c) => Effect.tryPromise(() => client.findAll(c)),
      findOne: (c, q) => Effect.tryPromise(() => client.findOne(c, q)),
    }
  })
)

// 3. Test implementation (model of the world)
HulyClient.testLayer = (data: { issues: Issue[] }) =>
  Layer.succeed(HulyClient, {
    findAll: () => Effect.succeed(data.issues),
    findOne: (_, q) => Effect.succeed(data.issues.find(matchesQuery(q))),
  })
```

**Slide: "Composition"**

```typescript
// Business logic - doesn't know or care about implementation
const listIssues = (project: string) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const issues = yield* client.findAll(Issue, { project })
    return issues.map(toSummary)
  })

// Test - provide mock layer
const result = await Effect.runPromise(
  listIssues("TEST").pipe(
    Effect.provide(HulyClient.testLayer({ issues: mockIssues }))
  )
)

// Production - provide real layer
const result = await Effect.runPromise(
  listIssues("PROD").pipe(
    Effect.provide(HulyClient.layer)
  )
)
```

---

### Part 4: Parallel Worktree Development

**Slide: "Git Worktrees"**

```bash
# Main repo
/project (master)

# Create parallel workspaces instantly
git worktree add ../project-feature-a -b feature/a
git worktree add ../project-feature-b -b feature/b
git worktree add ../project-feature-c -b feature/c

# Each is a full working copy, sharing .git
```

**Slide: "Why Worktrees + Effect = Parallel Development"**

```
┌──────────────────────────────────────────────────────────────┐
│                     6 Parallel Agents                        │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────┤
│ Agent 1  │ Agent 2  │ Agent 3  │ Agent 4  │ Agent 5  │ ... │
│ worktree │ worktree │ worktree │ worktree │ worktree │     │
│ feature/a│ feature/b│ feature/c│ feature/d│ feature/e│     │
├──────────┴──────────┴──────────┴──────────┴──────────┴──────┤
│                    All running tests                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              HulyClient.testLayer()                 │    │
│  │                                                     │    │
│  │   - No network calls                                │    │
│  │   - No shared state                                 │    │
│  │   - No port conflicts                               │    │
│  │   - Instant setup                                   │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**Slide: "Real Example - What We Did"**

| Time | Without Effect/Worktrees | With Effect/Worktrees |
|------|-------------------------|----------------------|
| Setup | Spin up test DB, mock server, configure ports | `git worktree add` |
| Isolation | Careful port management, cleanup between tests | Automatic (in-memory) |
| Parallelism | Limited by external resources | Unlimited |
| Speed | Network latency, connection overhead | Microseconds |

**Live Demo Script:**

```bash
# 1. Show the codebase
cat src/huly/client.ts  # Show testLayer

# 2. Create 6 worktrees in parallel
for i in {1..6}; do
  git worktree add ../demo-$i -b demo/fix-$i &
done
wait

# 3. Launch 6 agents (simulated or real Claude Code)
# Each agent:
#   - Works in its own worktree
#   - Runs tests with testLayer (no external deps)
#   - Makes changes
#   - All run simultaneously

# 4. Merge all back
for i in {1..6}; do
  git merge demo/fix-$i
done

# 5. Run final test suite
npm test  # All 264 tests pass
```

---

### Part 5: No Mocks Required

**Slide: "Traditional Mocking is Ugly"**

TODO: Add uglier, more realistic mock example showing:
- jest.mock with module path strings
- mockImplementation chains
- mockResolvedValueOnce sequences
- jest.spyOn gymnastics
- beforeEach/afterEach reset boilerplate
- Type casting to satisfy TS

```typescript
// Traditional mocking - brittle, verbose, stringly-typed
jest.mock('./hulyClient', () => ({
  getIssue: jest.fn().mockResolvedValue({ title: 'test' })
}))

// TODO: expand with realistic ugly example
```

**Slide: "With Effect: No Mocks, Just Implementations"**

```typescript
// This is not a mock. This is a valid implementation.
// It happens to store data in memory instead of over HTTP.
// The type system guarantees it satisfies the contract.
HulyClient.testLayer = (data: { issues: Issue[] }) =>
  Layer.succeed(HulyClient, {
    findAll: () => Effect.succeed(data.issues),
    findOne: (_, q) => Effect.succeed(data.issues.find(matchesQuery(q))),
  })
```

Key differences:
- No magic strings (module paths)
- No mock reset/restore lifecycle
- No `jest.fn()` - just functions
- Type-checked at compile time
- The "mock" is a first-class implementation

**Slide: "It's Not Mocking, It's Modeling"**

Effect modeling:
```typescript
// Define what you need from the world
// The test layer IS a valid implementation
// It just happens to not use the network
```

**Slide: "The Spectrum of Reality"**

```
Pure Model ◄──────────────────────────────► Pure Reality
    │                                            │
    │  testLayer      stagingLayer    prodLayer  │
    │  (in-memory)    (test env)      (real)     │
    │                                            │
    └────────────────────────────────────────────┘

All are valid implementations of the same interface.
Your code doesn't know the difference.
Your code doesn't NEED to know the difference.
```

**Slide: "When You Need 'Real' External Systems"**

You don't need them as often as you think:

| Scenario | Do You Need Real System? |
|----------|-------------------------|
| Unit tests | No - use testLayer |
| Integration tests | Maybe - use stagingLayer |
| E2E tests | Yes - but only in CI, not dev |
| Development | No - use testLayer + manual prod testing |

---

## Code Examples Needed

### Example 1: Simple Service Pattern
```typescript
// services/weather.ts
class WeatherService extends Context.Tag("WeatherService")<
  WeatherService,
  { getTemp: (city: string) => Effect<number, WeatherError> }
>() {
  static layer = // HTTP to weather API
  static testLayer = (temps: Record<string, number>) =>
    Layer.succeed(WeatherService, {
      getTemp: (city) => temps[city]
        ? Effect.succeed(temps[city])
        : Effect.fail(new WeatherError({ city }))
    })
}
```

### Example 2: Webhook Capture Pattern
```typescript
// services/webhook.ts
class WebhookSender extends Context.Tag("WebhookSender")<...>() {
  static testLayer = () =>
    Effect.gen(function* () {
      const captured = yield* Ref.make<WebhookCall[]>([])
      return {
        layer: Layer.succeed(WebhookSender, {
          send: (url, payload) =>
            Ref.update(captured, calls => [...calls, { url, payload }])
        }),
        getCaptured: () => Ref.get(captured)
      }
    })
}

// In test:
const { layer, getCaptured } = yield* WebhookSender.testLayer()
yield* myOperation.pipe(Effect.provide(layer))
const calls = yield* getCaptured()
expect(calls).toHaveLength(1)
```

### Example 3: Parallel Agent Simulation
```typescript
// demo/parallel-agents.ts
const agents = ["schemas", "client", "server", "n1", "entry", "tests"]

const runAgent = (name: string) =>
  Effect.gen(function* () {
    // Each agent gets isolated testLayer
    const testData = yield* loadFixtures(name)
    const layer = HulyClient.testLayer(testData)

    yield* runFixes(name).pipe(Effect.provide(layer))
    yield* runTests.pipe(Effect.provide(layer))
  })

// Run all in parallel - no conflicts possible
yield* Effect.all(agents.map(runAgent), { concurrency: "unbounded" })
```

---

## Slides Summary

1. **Title**: "Parallel Development with Effect-TS and Git Worktrees"
2. **The Problem**: External dependencies create bottlenecks
3. **The Insight**: You already model the world - make it explicit
4. **Python → TS → Effect**: Progression of explicitness
5. **The Model IS The Contract**: Service interfaces
6. **Layer System**: Production vs Test implementations
7. **Composition**: Same code, different layers
8. **Git Worktrees**: Instant parallel workspaces
9. **Why It Works**: No network, no state, no conflicts
10. **Real Example**: 6 agents, 6 fixes, all parallel
11. **No Mocks Required**: testLayer is a real implementation
12. **The Spectrum**: testLayer → stagingLayer → prodLayer
13. **When You Need Real Systems**: Rarely
14. **Takeaways**: Make your models explicit and swappable

---

## Demo Checklist

- [ ] Clean repo state (master branch)
- [ ] Prepare 6 simple fixes that can be done in parallel
- [ ] Script to create worktrees
- [ ] Script to simulate parallel agents (or use real Claude Code)
- [ ] Script to merge and verify
- [ ] Timer to show speed comparison

---

## Takeaway Quote

> "The best test environment is no environment at all. When your external dependencies are explicit services with swappable implementations, 'test environment' becomes 'test data' - and test data is just code."
