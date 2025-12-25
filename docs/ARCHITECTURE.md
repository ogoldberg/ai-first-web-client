# Unbrowser Architecture

This document provides visual architecture diagrams for understanding the Unbrowser system.

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Deployment Modes](#deployment-modes)
3. [Tiered Rendering Pipeline](#tiered-rendering-pipeline)
4. [Learning System](#learning-system)
5. [Component Relationships](#component-relationships)
6. [Request Flow](#request-flow)
7. [Data Flow](#data-flow)

---

## High-Level Overview

Unbrowser is an intelligent web browsing API that progressively learns to bypass browser rendering.

```mermaid
graph TB
    subgraph "Client Layer"
        LLM[LLM/AI Agent]
        SDK[SDK Client]
        API[REST API Client]
    end

    subgraph "Interface Layer"
        MCP[MCP Server<br/>smart_browse, api_auth, etc.]
        REST[REST API<br/>/v1/browse, /v1/batch]
    end

    subgraph "Core Engine"
        SB[SmartBrowser<br/>Orchestrator]
        TF[TieredFetcher<br/>Tier Selection]
        CI[ContentIntelligence<br/>Extraction]
    end

    subgraph "Rendering Tiers"
        T1[Intelligence Tier<br/>~50-200ms]
        T2[Lightweight Tier<br/>~200-500ms]
        T3[Playwright Tier<br/>~2-5s]
    end

    subgraph "Learning Layer"
        LE[LearningEngine<br/>Pattern Discovery]
        PM[ProceduralMemory<br/>Skills & Workflows]
        FL[FailureLearning<br/>Anti-patterns]
    end

    subgraph "Storage Layer"
        PS[PersistentStore<br/>JSON/SQLite]
        VS[VectorStore<br/>Semantic Search]
        TS[TenantStore<br/>Multi-tenant]
    end

    LLM --> MCP
    SDK --> REST
    API --> REST
    MCP --> SB
    REST --> SB
    SB --> TF
    TF --> T1 & T2 & T3
    T1 & T2 & T3 --> CI
    CI --> LE
    SB --> PM
    LE --> FL
    LE --> PS
    PM --> PS
    LE --> VS
```

---

## Deployment Modes

Unbrowser supports two deployment architectures:

### Local MCP Server (Production)

```mermaid
graph LR
    subgraph "User Machine"
        CD[Claude Desktop]
        MCP[llm-browser<br/>MCP Server]
        PW[Playwright<br/>Browser]
        FS[(Local Storage<br/>JSON/SQLite)]
    end

    CD <-->|MCP Protocol| MCP
    MCP --> PW
    MCP --> FS
```

### Cloud API (Alpha)

```mermaid
graph TB
    subgraph "Clients"
        C1[Claude Desktop<br/>via MCP]
        C2[Node.js SDK<br/>@unbrowser/core]
        C3[curl/fetch<br/>Direct API]
    end

    subgraph "Cloud Infrastructure"
        subgraph "API Gateway"
            AUTH[Authentication<br/>API Keys]
            RL[Rate Limiting]
            UT[Usage Tracking]
        end

        subgraph "Core Services"
            SB[SmartBrowser]
            LE[LearningEngine]
            PM[ProceduralMemory]
        end

        subgraph "Storage"
            PG[(PostgreSQL<br/>Supabase)]
            SP[SharedPatternPool<br/>Collective Learning]
        end
    end

    C1 & C2 & C3 --> AUTH
    AUTH --> RL --> UT
    UT --> SB
    SB --> LE & PM
    LE --> PG
    PM --> PG
    LE --> SP
```

---

## Tiered Rendering Pipeline

The system uses a cascade of rendering tiers, trying the fastest first:

```mermaid
flowchart TD
    START([Browse Request]) --> TF{TieredFetcher}

    TF -->|Try First| T1[Intelligence Tier]
    T1 -->|Success?| T1C{Validate}
    T1C -->|Valid| DONE([Return Result])
    T1C -->|Invalid/Failed| T2[Lightweight Tier]

    T2 -->|Success?| T2C{Validate}
    T2C -->|Valid| DONE
    T2C -->|Invalid/Failed| T3[Playwright Tier]

    T3 -->|Success?| T3C{Validate}
    T3C -->|Valid| DONE
    T3C -->|Failed| ERR([Return Error])

    subgraph "Intelligence Tier (~50-200ms)"
        T1A[Framework Extraction<br/>Next.js, Nuxt, etc.]
        T1B[Structured Data<br/>JSON-LD, Schema.org]
        T1C2[API Pattern Match<br/>Learned endpoints]
    end

    subgraph "Lightweight Tier (~200-500ms)"
        T2A[linkedom<br/>DOM Parsing]
        T2B[Node.js VM<br/>Simple JS]
        T2C2[Content Extraction]
    end

    subgraph "Playwright Tier (~2-5s)"
        T3A[Full Browser<br/>Chrome/Firefox]
        T3B[JavaScript Execution]
        T3C2[Network Capture]
    end

    T1 --> T1A & T1B & T1C2
    T2 --> T2A & T2B & T2C2
    T3 --> T3A & T3B & T3C2
```

### Tier Selection Logic

```mermaid
flowchart TD
    REQ([Request]) --> CHECK{Check Domain<br/>Preferences}

    CHECK -->|Known API| API[Direct API Call<br/>Skip rendering]
    CHECK -->|Static Content| T1[Intelligence Tier]
    CHECK -->|Needs JS| T2[Lightweight Tier]
    CHECK -->|Complex SPA| T3[Playwright Tier]
    CHECK -->|Unknown| CASCADE[Start Cascade]

    CASCADE --> T1
    T1 -->|Failed| T2
    T2 -->|Failed| T3

    API & T1 & T2 & T3 --> LEARN[Learn Outcome]
    LEARN --> PERSIST[Update Preferences]
```

---

## Learning System

### Pattern Learning Flow

```mermaid
flowchart LR
    subgraph "Discovery"
        BR[Browse Request]
        API[API Discovered]
        OA[OpenAPI Spec]
        GQL[GraphQL Schema]
    end

    subgraph "Learning"
        LE[LearningEngine]
        APL[ApiPatternLearner]
        PAT[Pattern Registry]
    end

    subgraph "Application"
        CI[ContentIntelligence]
        TRY[Try Pattern]
        MATCH[Pattern Match]
    end

    subgraph "Feedback"
        SUC[Success]
        FAIL[Failure]
        FL[FailureLearning]
        AP[Anti-patterns]
    end

    BR --> API --> APL
    OA --> APL
    GQL --> APL
    APL --> PAT
    PAT --> LE

    CI --> TRY
    TRY --> PAT
    PAT --> MATCH
    MATCH -->|Works| SUC --> LE
    MATCH -->|Fails| FAIL --> FL --> AP
```

### Skill Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Learning: First encounter
    Learning --> Active: Success verified
    Active --> Versioned: Updated
    Versioned --> Active: Rollback
    Active --> Degraded: Confidence decay
    Degraded --> Active: Re-verified
    Degraded --> AntiPattern: Repeated failures
    AntiPattern --> [*]: Pruned

    note right of Active
        Skill is actively used
        for pattern matching
    end note

    note right of AntiPattern
        Skill marked as
        "what NOT to do"
    end note
```

---

## Component Relationships

### Core Components

```mermaid
classDiagram
    class SmartBrowser {
        +browse(url, options)
        +batchBrowse(urls, options)
        +executeApiCall(config)
        +captureScreenshot(url)
        +exportHar(url)
    }

    class TieredFetcher {
        +fetch(url, options)
        +selectTier(domain)
        +recordOutcome(tier, success)
    }

    class ContentIntelligence {
        +extract(html, url)
        +detectFramework(html)
        +tryLearnedPatterns(url)
    }

    class LearningEngine {
        +learnFromExtraction(result)
        +findPattern(url)
        +recordPatternFailure(pattern)
    }

    class ProceduralMemory {
        +addSkill(skill)
        +findSkills(query)
        +recordExecution(outcome)
    }

    class SessionManager {
        +save(domain, data)
        +load(domain)
        +checkHealth(domain)
    }

    SmartBrowser --> TieredFetcher
    SmartBrowser --> SessionManager
    SmartBrowser --> ProceduralMemory
    TieredFetcher --> ContentIntelligence
    ContentIntelligence --> LearningEngine
    LearningEngine --> ProceduralMemory
```

### Storage Architecture

```mermaid
classDiagram
    class PersistentStore {
        <<abstract>>
        +get(key)
        +set(key, value)
        +delete(key)
    }

    class JsonPersistentStore {
        +debounceMs: number
        +atomicWrite: boolean
    }

    class SqlitePersistentStore {
        +database: BetterSqlite3
    }

    class EmbeddedStore {
        +namespace: string
        +patterns: Map
        +skills: Map
    }

    class VectorStore {
        +embeddings: LanceDB
        +search(query, topK)
    }

    class TenantStore {
        +tenantId: string
        +isolation: boolean
        +sharePatterns: boolean
    }

    PersistentStore <|-- JsonPersistentStore
    PersistentStore <|-- SqlitePersistentStore
    EmbeddedStore --> PersistentStore
    TenantStore --> EmbeddedStore
    TenantStore --> VectorStore
```

---

## Request Flow

### smart_browse Request

```mermaid
sequenceDiagram
    participant LLM as LLM/Client
    participant MCP as MCP Server
    participant SB as SmartBrowser
    participant TF as TieredFetcher
    participant CI as ContentIntelligence
    participant LE as LearningEngine

    LLM->>MCP: smart_browse(url, options)
    MCP->>SB: browse(url, options)

    SB->>LE: findPattern(url)
    alt Pattern Found
        LE-->>SB: pattern
        SB->>SB: executeApiCall(pattern)
        SB-->>MCP: result (from API)
    else No Pattern
        SB->>TF: fetch(url)
        TF->>TF: selectTier(domain)

        alt Intelligence Tier
            TF->>CI: extract(html)
            CI-->>TF: content
        else Lightweight Tier
            TF->>TF: linkedom parse
            TF->>CI: extract(html)
        else Playwright Tier
            TF->>TF: browser.newPage()
            TF->>CI: extract(html)
        end

        TF-->>SB: result
        SB->>LE: learnFromExtraction(result)
    end

    MCP-->>LLM: BrowseResult
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant LLM as LLM/Client
    participant MCP as MCP Server
    participant AW as AuthWorkflow
    participant SM as SessionManager

    LLM->>MCP: api_auth(configure, domain, creds)
    MCP->>AW: configure(domain, authType, creds)

    alt API Key / Bearer
        AW->>AW: validate(creds)
        AW->>SM: save(domain, authData)
    else OAuth2
        AW-->>LLM: authorizationUrl
        LLM-->>AW: callback(code, state)
        AW->>AW: exchangeToken(code)
        AW->>SM: save(domain, tokens)
    end

    SM-->>MCP: success
    MCP-->>LLM: configured

    Note over LLM,SM: Subsequent requests use stored auth

    LLM->>MCP: smart_browse(protected_url)
    MCP->>SM: load(domain)
    SM-->>MCP: authData
    MCP->>MCP: addAuthHeaders(request)
```

---

## Data Flow

### Learning Data Flow

```mermaid
flowchart TB
    subgraph "Input Sources"
        BR[Browse Results]
        OA[OpenAPI Specs]
        GQL[GraphQL Schemas]
        LINK[Link Headers]
        FRAME[Framework Data]
    end

    subgraph "Pattern Processing"
        APL[ApiPatternLearner]
        REG[Pattern Registry]
        VAL[Validation Engine]
    end

    subgraph "Storage"
        PS[(Patterns<br/>learned-patterns.json)]
        SK[(Skills<br/>procedural-memory.json)]
        VS[(Vectors<br/>LanceDB)]
    end

    subgraph "Retrieval"
        EXACT[Exact Match]
        SEM[Semantic Search]
        XFER[Cross-domain Transfer]
    end

    BR --> APL
    OA --> APL
    GQL --> APL
    LINK --> APL
    FRAME --> APL

    APL --> REG
    REG --> VAL
    VAL -->|Valid| PS
    VAL -->|Valid| SK
    VAL -->|Embed| VS

    PS --> EXACT
    VS --> SEM
    EXACT --> XFER
    SEM --> XFER
```

### Multi-tenant Data Isolation

```mermaid
flowchart TB
    subgraph "Tenant A"
        A_REQ[Requests]
        A_PAT[(Private Patterns)]
        A_SK[(Private Skills)]
    end

    subgraph "Tenant B"
        B_REQ[Requests]
        B_PAT[(Private Patterns)]
        B_SK[(Private Skills)]
    end

    subgraph "Shared Pool"
        SP[(Shared Patterns<br/>opt-in)]
    end

    A_REQ --> A_PAT
    A_REQ --> A_SK
    A_PAT -->|contribute| SP
    SP -->|consume| A_REQ

    B_REQ --> B_PAT
    B_REQ --> B_SK
    B_PAT -->|contribute| SP
    SP -->|consume| B_REQ

    A_PAT -.-|isolated| B_PAT
    A_SK -.-|isolated| B_SK
```

---

## File Structure Reference

```
src/
+-- core/                     # Core components
|   +-- smart-browser.ts      # Main orchestrator (116K)
|   +-- tiered-fetcher.ts     # Tier cascade logic
|   +-- content-intelligence.ts # Content extraction (71K)
|   +-- learning-engine.ts    # Pattern learning (82K)
|   +-- procedural-memory.ts  # Skills & workflows (118K)
|   +-- session-manager.ts    # Session handling
|   +-- failure-learning.ts   # Anti-pattern tracking
|   +-- api-pattern-learner.ts # API discovery
|   +-- stealth-browser.ts    # Bot evasion
|   +-- framework-extractors/ # Next.js, Angular, Vue, etc.
|   +-- site-handlers/        # Reddit, GitHub, npm, etc.
|
+-- utils/                    # Utilities
|   +-- persistent-store.ts   # JSON persistence
|   +-- embedded-store.ts     # SQLite persistence
|   +-- vector-store.ts       # LanceDB vectors
|   +-- tenant-store.ts       # Multi-tenant isolation
|   +-- content-extractor.ts  # HTML to markdown
|   +-- url-safety.ts         # SSRF protection
|
+-- mcp/                      # MCP interface
|   +-- tool-schemas.ts       # Tool definitions
|   +-- index.ts              # Schema exports
|
+-- tools/                    # Tool handlers
|   +-- browse-tool.ts        # smart_browse handler
|   +-- api-call-tool.ts      # execute_api_call
|   +-- auth-helpers.ts       # api_auth handler
|
+-- types/                    # TypeScript types
    +-- index.ts              # Main type exports
    +-- field-confidence.ts   # Confidence scores
    +-- provenance.ts         # Learning metadata
    +-- decision-trace.ts     # Tier decisions
```

---

## See Also

- [MCP Tools API Reference](MCP_TOOLS_API.md) - Complete tool documentation
- [LLM Onboarding Spec](LLM_ONBOARDING_SPEC.md) - Client integration guide
- [PROJECT_STATUS.md](PROJECT_STATUS.md) - Current implementation status
- [BACKLOG.md](BACKLOG.md) - Task backlog
