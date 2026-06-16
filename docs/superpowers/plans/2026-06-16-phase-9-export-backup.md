# Phase 9 Export and Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encrypted household export/backup creation and listing using Netlify Blobs.

**Architecture:** The client creates a portable backup package from the currently loaded household workspace and encrypts the complete package with the active master-key session before upload. A Netlify Function authenticates the household and stores only ciphertext plus non-sensitive metadata in a site-scoped Blob store. The server never receives the master key or plaintext sensitive values.

**Tech Stack:** Next.js client components, Web Crypto AES-GCM, Netlify Functions modern default-export syntax, Netlify Blobs, Vitest, Testing Library.

---

## File Structure

- Create `src/shared/export-backup.ts` for backup package, encrypted payload, metadata, and API contracts.
- Create `src/client/backup/export-backup-crypto.ts` for client-side package building and AES-GCM encryption.
- Create `src/server/export-backup-service.ts` for metadata validation, key creation, and repository orchestration.
- Create `src/server/export-backup-repository.ts` for Netlify Blobs persistence and in-memory test repository support.
- Create `netlify/functions/export-backup.mts` for authenticated `GET` list and `POST` upload endpoints at `/api/export-backup`.
- Create `src/client/backup/ExportBackupPanel.tsx` for backup creation and listing UI.
- Modify `src/client/DashboardShell.tsx` to render the backup panel when the workspace is unlocked.
- Modify `src/client/CommandCenterApp.tsx` to load backup metadata, upload encrypted backups, and maintain demo backups in memory.
- Modify `src/client/demo-workspace.ts` so demo mode starts with no backups.
- Modify `app/globals.css` for backup rows.
- Modify `package.json` to add direct `@netlify/blobs` dependency.
- Add tests:
  - `tests/export-backup-crypto.test.ts`
  - `tests/export-backup-service.test.ts`
  - `tests/export-backup-repository.test.ts`
  - `tests/export-backup-panel.test.tsx`
  - update `tests/dashboard-shell.test.tsx`
  - update `tests/demo-login.test.tsx`

## Scope Decisions

- Restore/import is deferred. Phase 9 creates downloadable encrypted backup blobs and metadata.
- Backups include the currently loaded workspace: household, member, owners, holdings with existing encrypted values, decisions summaries, price dashboard, notifications, AI analysis run summaries, and a created timestamp.
- The whole package is encrypted again client-side before upload. This protects non-sensitive metadata inside Blob storage and preserves the rule that Blob contents are encrypted backups.
- The server stores only metadata fields needed for listing: backup id, household id, created timestamp, format version, ciphertext byte count, and checksum.
- Blob keys are deterministic by household and generated backup id: `households/<householdId>/backups/<backupId>.json`.

## Task 1: Shared Contracts and Client Encryption

**Files:**
- Create: `src/shared/export-backup.ts`
- Create: `src/client/backup/export-backup-crypto.ts`
- Test: `tests/export-backup-crypto.test.ts`

- [ ] **Step 1: Write the failing crypto test**

Create `tests/export-backup-crypto.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildExportBackupPackage,
  decryptExportBackupPayload,
  encryptExportBackupPackage,
} from "../src/client/backup/export-backup-crypto";
import type { HouseholdBootstrap } from "../src/server/household-service";

const bootstrap: HouseholdBootstrap = {
  household: {
    id: "household_1",
    name: "Tem Household",
    baseCurrency: "THB",
    secondaryCurrency: "USD",
  },
  member: {
    identityUserId: "user_1",
    email: "tem@example.com",
    role: "owner",
  },
  ownerEntities: [{ id: "owner_1", displayName: "Tem", kind: "person" }],
};

describe("export backup crypto", () => {
  it("builds and encrypts a portable household backup package", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(7),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
    const backupPackage = buildExportBackupPackage({
      bootstrap,
      holdings: [],
      decisions: [],
      priceDashboard: { prices: [], staleWarnings: [], lastSync: null },
      notifications: [],
      aiAnalysisRuns: [],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const encrypted = await encryptExportBackupPackage(backupPackage, key);
    const decrypted = await decryptExportBackupPayload(encrypted, key);

    expect(encrypted).toMatchObject({
      version: 1,
      algorithm: "AES-GCM",
      format: "tem-investment-backup",
      householdId: "household_1",
    });
    expect(encrypted.ciphertext).not.toContain("Tem Household");
    expect(decrypted).toEqual(backupPackage);
  });
});
```

- [ ] **Step 2: Run crypto test to verify RED**

Run: `npm test -- tests/export-backup-crypto.test.ts`

Expected: FAIL because `export-backup-crypto.ts` does not exist.

- [ ] **Step 3: Add shared contracts**

Create `src/shared/export-backup.ts`:

```ts
import type { HouseholdBootstrap } from "../server/household-service";
import type { AIAnalysisRunSummary } from "./ai-analysis";
import type { DecisionLogSummary } from "./discipline";
import type { HoldingSummary } from "./holdings";
import type { NotificationSummary } from "./notifications";
import type { PriceDashboardPayload } from "./pricing";

export type ExportBackupFormat = "tem-investment-backup";

export type ExportBackupPackage = {
  format: ExportBackupFormat;
  version: 1;
  createdAt: string;
  bootstrap: HouseholdBootstrap;
  holdings: HoldingSummary[];
  decisions: DecisionLogSummary[];
  priceDashboard: PriceDashboardPayload;
  notifications: NotificationSummary[];
  aiAnalysisRuns: AIAnalysisRunSummary[];
};

export type EncryptedExportBackupPayload = {
  format: ExportBackupFormat;
  version: 1;
  householdId: string;
  createdAt: string;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
  checksumSha256: string;
};

export type ExportBackupMetadata = {
  id: string;
  householdId: string;
  createdAt: string;
  format: ExportBackupFormat;
  version: 1;
  byteLength: number;
  checksumSha256: string;
};
```

- [ ] **Step 4: Add client encryption implementation**

Create `src/client/backup/export-backup-crypto.ts`:

```ts
import type {
  EncryptedExportBackupPayload,
  ExportBackupPackage,
} from "../../shared/export-backup";
import {
  base64ToBytes,
  bytesToArrayBuffer,
  bytesToBase64,
  bytesToHex,
  bytesToUtf8,
  secureRandomBytes,
  utf8ToBytes,
} from "../crypto/encoding";

type BuildExportBackupPackageInput = Omit<ExportBackupPackage, "format" | "version">;

const AES_GCM_IV_BYTES = 12;

export function buildExportBackupPackage(input: BuildExportBackupPackageInput): ExportBackupPackage {
  return {
    format: "tem-investment-backup",
    version: 1,
    ...input,
  };
}

export async function encryptExportBackupPackage(
  backupPackage: ExportBackupPackage,
  key: CryptoKey,
): Promise<EncryptedExportBackupPayload> {
  const plaintext = utf8ToBytes(JSON.stringify(backupPackage));
  const iv = secureRandomBytes(AES_GCM_IV_BYTES);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(iv) },
    key,
    bytesToArrayBuffer(plaintext),
  );
  const ciphertext = new Uint8Array(encrypted);

  return {
    format: backupPackage.format,
    version: backupPackage.version,
    householdId: backupPackage.bootstrap.household.id,
    createdAt: backupPackage.createdAt,
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    checksumSha256: await sha256Hex(ciphertext),
  };
}

export async function decryptExportBackupPayload(
  payload: EncryptedExportBackupPayload,
  key: CryptoKey,
): Promise<ExportBackupPackage> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(base64ToBytes(payload.iv)) },
    key,
    bytesToArrayBuffer(base64ToBytes(payload.ciphertext)),
  );
  return JSON.parse(bytesToUtf8(new Uint8Array(decrypted))) as ExportBackupPackage;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytesToArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}
```

- [ ] **Step 5: Run crypto test to verify GREEN**

Run: `npm test -- tests/export-backup-crypto.test.ts`

Expected: PASS.

## Task 2: Server Service and Blob Repository

**Files:**
- Create: `src/server/export-backup-service.ts`
- Create: `src/server/export-backup-repository.ts`
- Test: `tests/export-backup-service.test.ts`
- Test: `tests/export-backup-repository.test.ts`

- [ ] **Step 1: Write failing service and repository tests**

Create `tests/export-backup-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  createExportBackup,
  createExportBackupId,
  createExportBackupKey,
  type ExportBackupRepository,
} from "../src/server/export-backup-service";
import type { EncryptedExportBackupPayload } from "../src/shared/export-backup";

const payload: EncryptedExportBackupPayload = {
  format: "tem-investment-backup",
  version: 1,
  householdId: "household_1",
  createdAt: "2026-06-16T00:00:00.000Z",
  algorithm: "AES-GCM",
  iv: "iv",
  ciphertext: "ciphertext",
  checksumSha256: "abc123",
};

describe("export backup service", () => {
  it("creates stable ids and household blob keys", () => {
    const id = createExportBackupId("2026-06-16T00:00:00.000Z");

    expect(id).toBe("backup_2026-06-16T00-00-00-000Z");
    expect(createExportBackupKey("household_1", id)).toBe(
      "households/household_1/backups/backup_2026-06-16T00-00-00-000Z.json",
    );
  });

  it("stores encrypted payloads and returns metadata", async () => {
    const repository: ExportBackupRepository = {
      putBackup: vi.fn(async (_key, storedPayload, metadata) => ({
        ...metadata,
        byteLength: JSON.stringify(storedPayload).length,
      })),
      listBackups: vi.fn(),
    };

    const metadata = await createExportBackup({
      repository,
      householdId: "household_1",
      payload,
    });

    expect(repository.putBackup).toHaveBeenCalledOnce();
    expect(metadata).toMatchObject({
      householdId: "household_1",
      format: "tem-investment-backup",
      checksumSha256: "abc123",
    });
  });
});
```

Create `tests/export-backup-repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { InMemoryExportBackupRepository } from "../src/server/export-backup-repository";
import type { EncryptedExportBackupPayload, ExportBackupMetadata } from "../src/shared/export-backup";

const payload: EncryptedExportBackupPayload = {
  format: "tem-investment-backup",
  version: 1,
  householdId: "household_1",
  createdAt: "2026-06-16T00:00:00.000Z",
  algorithm: "AES-GCM",
  iv: "iv",
  ciphertext: "ciphertext",
  checksumSha256: "abc123",
};

const metadata: ExportBackupMetadata = {
  id: "backup_1",
  householdId: "household_1",
  createdAt: "2026-06-16T00:00:00.000Z",
  format: "tem-investment-backup",
  version: 1,
  byteLength: 0,
  checksumSha256: "abc123",
};

describe("InMemoryExportBackupRepository", () => {
  it("stores and lists backup metadata by household prefix", async () => {
    const repository = new InMemoryExportBackupRepository();

    await repository.putBackup("households/household_1/backups/backup_1.json", payload, metadata);
    await repository.putBackup("households/household_2/backups/backup_2.json", payload, {
      ...metadata,
      id: "backup_2",
      householdId: "household_2",
    });

    expect(await repository.listBackups("household_1")).toEqual([
      expect.objectContaining({ id: "backup_1", householdId: "household_1" }),
    ]);
  });
});
```

- [ ] **Step 2: Run service/repository tests to verify RED**

Run: `npm test -- tests/export-backup-service.test.ts tests/export-backup-repository.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Add server service**

Create `src/server/export-backup-service.ts` with:

```ts
import type {
  EncryptedExportBackupPayload,
  ExportBackupMetadata,
} from "../shared/export-backup";

export type ExportBackupRepository = {
  putBackup(
    key: string,
    payload: EncryptedExportBackupPayload,
    metadata: ExportBackupMetadata,
  ): Promise<ExportBackupMetadata>;
  listBackups(householdId: string): Promise<ExportBackupMetadata[]>;
};

export function createExportBackupId(createdAt: string): string {
  return `backup_${createdAt.replace(/[:.]/g, "-")}`;
}

export function createExportBackupKey(householdId: string, backupId: string): string {
  return `households/${householdId}/backups/${backupId}.json`;
}

export async function createExportBackup({
  repository,
  householdId,
  payload,
}: {
  repository: ExportBackupRepository;
  householdId: string;
  payload: EncryptedExportBackupPayload;
}): Promise<ExportBackupMetadata> {
  if (payload.householdId !== householdId) {
    throw new Error("Backup household does not match authenticated household.");
  }
  if (payload.format !== "tem-investment-backup" || payload.version !== 1) {
    throw new Error("Unsupported backup format.");
  }
  if (payload.algorithm !== "AES-GCM") {
    throw new Error("Unsupported backup encryption algorithm.");
  }

  const id = createExportBackupId(payload.createdAt);
  const key = createExportBackupKey(householdId, id);
  const metadata: ExportBackupMetadata = {
    id,
    householdId,
    createdAt: payload.createdAt,
    format: payload.format,
    version: payload.version,
    byteLength: JSON.stringify(payload).length,
    checksumSha256: payload.checksumSha256,
  };

  return repository.putBackup(key, payload, metadata);
}
```

- [ ] **Step 4: Add Blob repository**

Create `src/server/export-backup-repository.ts` with:

```ts
import { getStore } from "@netlify/blobs";

import type {
  EncryptedExportBackupPayload,
  ExportBackupMetadata,
} from "../shared/export-backup";
import type { ExportBackupRepository } from "./export-backup-service";

type BlobStore = ReturnType<typeof getStore>;

export class NetlifyBlobExportBackupRepository implements ExportBackupRepository {
  constructor(private readonly store: BlobStore = getStore({ name: "portfolio-backups", consistency: "strong" })) {}

  async putBackup(
    key: string,
    payload: EncryptedExportBackupPayload,
    metadata: ExportBackupMetadata,
  ): Promise<ExportBackupMetadata> {
    await this.store.setJSON(key, payload, { metadata });
    return metadata;
  }

  async listBackups(householdId: string): Promise<ExportBackupMetadata[]> {
    const prefix = `households/${householdId}/backups/`;
    const { blobs } = await this.store.list({ prefix });
    const entries = await Promise.all(
      blobs.map(async (blob) => {
        const result = await this.store.getMetadata(blob.key);
        return result?.metadata as ExportBackupMetadata | undefined;
      }),
    );

    return entries
      .filter((entry): entry is ExportBackupMetadata => Boolean(entry))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryExportBackupRepository implements ExportBackupRepository {
  private readonly backups = new Map<string, { payload: EncryptedExportBackupPayload; metadata: ExportBackupMetadata }>();

  async putBackup(
    key: string,
    payload: EncryptedExportBackupPayload,
    metadata: ExportBackupMetadata,
  ): Promise<ExportBackupMetadata> {
    this.backups.set(key, { payload, metadata: { ...metadata, byteLength: JSON.stringify(payload).length } });
    return this.backups.get(key)?.metadata ?? metadata;
  }

  async listBackups(householdId: string): Promise<ExportBackupMetadata[]> {
    const prefix = `households/${householdId}/backups/`;
    return Array.from(this.backups.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value.metadata)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
```

- [ ] **Step 5: Run service/repository tests to verify GREEN**

Run: `npm test -- tests/export-backup-service.test.ts tests/export-backup-repository.test.ts`

Expected: PASS.

## Task 3: API and Dashboard UI

**Files:**
- Create: `netlify/functions/export-backup.mts`
- Create: `src/client/backup/ExportBackupPanel.tsx`
- Modify: `src/client/DashboardShell.tsx`
- Modify: `src/client/CommandCenterApp.tsx`
- Modify: `src/client/demo-workspace.ts`
- Modify: `app/globals.css`
- Modify: `package.json`
- Test: `tests/export-backup-panel.test.tsx`
- Update: `tests/dashboard-shell.test.tsx`
- Update: `tests/demo-login.test.tsx`

- [ ] **Step 1: Write failing UI test**

Create `tests/export-backup-panel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExportBackupPanel } from "../src/client/backup/ExportBackupPanel";
import type { ExportBackupMetadata } from "../src/shared/export-backup";

const backup: ExportBackupMetadata = {
  id: "backup_1",
  householdId: "household_1",
  createdAt: "2026-06-16T00:00:00.000Z",
  format: "tem-investment-backup",
  version: 1,
  byteLength: 2048,
  checksumSha256: "abc123",
};

describe("ExportBackupPanel", () => {
  it("renders backup metadata and starts encrypted backup creation", () => {
    const onCreateBackup = vi.fn();

    render(
      <ExportBackupPanel
        backups={[backup]}
        disabled={false}
        onCreateBackup={onCreateBackup}
      />,
    );

    expect(screen.getByText("Export and backup")).toBeInTheDocument();
    expect(screen.getByText("backup_1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create encrypted backup" }));

    expect(onCreateBackup).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run UI test to verify RED**

Run: `npm test -- tests/export-backup-panel.test.tsx`

Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Add API function**

Create `netlify/functions/export-backup.mts`:

```ts
import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import { createExportBackup } from "../../src/server/export-backup-service";
import { NetlifyBlobExportBackupRepository } from "../../src/server/export-backup-repository";
import { NetlifyHouseholdRepository } from "../../src/server/households-repository";
import type { EncryptedExportBackupPayload } from "../../src/shared/export-backup";

export default async function exportBackup(request: Request, _context: Context) {
  const identityUser = await getUser();
  if (!identityUser) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const identityUserId = normalizeIdentityUser(identityUser).identityUserId;
  if (!identityUserId) {
    return Response.json({ error: "Identity profile is missing an id." }, { status: 400 });
  }

  try {
    const householdRepository = new NetlifyHouseholdRepository();
    const bootstrap = await householdRepository.findByIdentityUserId(identityUserId);
    if (!bootstrap) return Response.json({ error: "Household not found." }, { status: 404 });

    const backupRepository = new NetlifyBlobExportBackupRepository();

    if (request.method === "GET") {
      const backups = await backupRepository.listBackups(bootstrap.household.id);
      return Response.json({ backups });
    }

    if (request.method === "POST") {
      const payload = (await request.json()) as EncryptedExportBackupPayload;
      const backup = await createExportBackup({
        repository: backupRepository,
        householdId: bootstrap.household.id,
        payload,
      });
      return Response.json({ backup });
    }

    return Response.json({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    console.error("Unable to handle export backup request", error);
    const message = error instanceof Error ? error.message : "Unable to handle export backup request.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/export-backup",
};

function normalizeIdentityUser(identityUser: unknown) {
  const user = identityUser as { id?: string; sub?: string };
  return { identityUserId: user.id ?? user.sub ?? "" };
}
```

- [ ] **Step 4: Add backup panel and app wiring**

Create `src/client/backup/ExportBackupPanel.tsx`:

```tsx
"use client";

import { Archive, Download } from "lucide-react";

import type { ExportBackupMetadata } from "../../shared/export-backup";

type ExportBackupPanelProps = {
  backups: ExportBackupMetadata[];
  disabled: boolean;
  onCreateBackup: () => Promise<void> | void;
};

export function ExportBackupPanel({ backups, disabled, onCreateBackup }: ExportBackupPanelProps) {
  return (
    <section className="panel span-12 backup-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Archive aria-hidden="true" size={18} />
          Export and backup
        </div>
        <span className="pill">{backups.length} backups</span>
      </div>
      <div className="panel-body backup-list">
        <button className="primary-button" disabled={disabled} onClick={onCreateBackup} type="button">
          <Download aria-hidden="true" size={16} />
          Create encrypted backup
        </button>
        {disabled ? <div className="error-strip">Unlock sensitive data before creating an encrypted backup</div> : null}
        {backups.length === 0 ? (
          <div className="empty-state compact">No encrypted backups yet</div>
        ) : (
          backups.map((backup) => (
            <article className="backup-row" key={backup.id}>
              <strong>{backup.id}</strong>
              <small>{new Date(backup.createdAt).toLocaleString()}</small>
              <span className="action-label">{formatBytes(backup.byteLength)}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
```

Modify app wiring to:

- Add `exportBackups` state in `CommandCenterApp`.
- Fetch `/api/export-backup` alongside other dashboard data.
- In demo mode, start with `[]`.
- Add `handleCreateExportBackup` that calls `buildExportBackupPackage`, `encryptExportBackupPackage`, then POSTs to `/api/export-backup`, or updates in-memory demo metadata.
- Pass `exportBackups`, `onCreateExportBackup`, and session unlock state through `DashboardShell`.
- Render `ExportBackupPanel` after `AIReviewPanel`.

Modify `app/globals.css`:

```css
.backup-list {
  display: grid;
  gap: 10px;
}

.backup-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 10px 12px;
}

.backup-row small {
  color: var(--muted-ink);
  font-size: 12px;
  font-weight: 800;
}
```

Modify `package.json` dependencies:

```json
"@netlify/blobs": "^10.7.9"
```

- [ ] **Step 5: Run UI tests to verify GREEN**

Run: `npm test -- tests/export-backup-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx`

Expected: PASS.

## Task 4: Full Verification and Branch Completion

**Files:**
- All Phase 9 files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/export-backup-crypto.test.ts tests/export-backup-service.test.ts tests/export-backup-repository.test.ts tests/export-backup-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Browser smoke demo backup flow**

Run: `npm run next:dev -- -H 127.0.0.1 -p 3000`

Open `http://127.0.0.1:3000`, click `Use demo`, verify:

- `Export and backup` panel is visible.
- Backup creation is disabled while locked.
- Unlock with `demo`, click `Create encrypted backup`, and verify backup count increments.
- Mobile width around 390px has no horizontal overflow.

Stop the dev server after smoke testing.

- [ ] **Step 5: Commit and push**

Run:

```bash
git status --short --branch
git add docs/superpowers/plans/2026-06-16-phase-9-export-backup.md src/shared/export-backup.ts src/client/backup/export-backup-crypto.ts src/server/export-backup-service.ts src/server/export-backup-repository.ts netlify/functions/export-backup.mts src/client/backup/ExportBackupPanel.tsx src/client/CommandCenterApp.tsx src/client/DashboardShell.tsx src/client/demo-workspace.ts app/globals.css package.json tests/export-backup-crypto.test.ts tests/export-backup-service.test.ts tests/export-backup-repository.test.ts tests/export-backup-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx
git commit -m "Add phase 9 encrypted export backups"
git push -u origin phase-9-export-backup
```

Expected: branch pushed for PR creation.

## Self-Review

- Spec coverage: Phase 9 encrypted export/backup is covered with client-side encryption and Netlify Blobs persistence. Restore/import is explicitly deferred because the phase outcome only requires data portability and backup.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: package, encrypted payload, metadata, repository, API, and UI use the same shared backup contracts.
