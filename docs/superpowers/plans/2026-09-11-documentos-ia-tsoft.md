# Documentos "IA en TSOFT" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Documentos" section to the Tablero where the user can upload, organize, and version PPT/PDF/Word/Excel files by "nombre lógico", browse/download them from the web, and search/download the latest version from chat via MCP.

**Architecture:** A new Supabase Storage bucket (`documentos`, private) plus a lightweight Postgres table (`documentos`) that tracks metadata per uploaded file, grouped by `nombre_logico` (same name = same document family, newest `subido_en` wins as "latest"). A new `packages/db/src/documentos.ts` module exposes list/resolve/upload/signed-URL functions, consumed by a new `/documentos` page (Next.js Server Actions for upload + on-demand signed URL) and two new MCP tools (`buscar_documento`, `descargar_documento`). Everything reuses the existing design system, auth (`requireUser`), and security posture (RLS enabled, no public policies, `service_role` only).

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres + Storage, `@supabase/supabase-js`, Zod, existing `mcp-handler`-based MCP endpoint.

**Spec:** `docs/superpowers/specs/2026-09-11-documentos-ia-tsoft-design.md`

## Global Constraints

- File types allowed: `.pptx`, `.ppt`, `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls` — validated both client (`accept` attribute) and server (extension check).
- Max file size: 25MB (`25 * 1024 * 1024` bytes), enforced server-side.
- Storage bucket `documentos` is **private** — every download goes through a signed URL generated on-demand (~60s validity), never a public/static URL.
- Versioning is purely by matching `nombre_logico` string (exact match, case-sensitive as stored) — no separate "documento" parent table, no explicit version numbers.
- Upload only happens from the web (no MCP upload tool) per the approved spec.
- **Testing convention:** this codebase only unit-tests pure domain logic in `packages/core` (Vitest, see `packages/core/test/index.test.ts`). `packages/db`, `apps/web` pages/components, and the MCP route have no test harness — they're verified via `pnpm typecheck && pnpm lint && pnpm build` plus manual end-to-end verification against the real deployment (this is how every prior feature in this session shipped). Do not introduce a new test framework for those layers; do not skip the packages/core test convention where it already applies.
- Migrations that use `uuid_generate_v4()` or `gin_trgm_ops` must start with `set search_path = public, extensions;` (see `supabase/migrations/0001_init.sql`) — Supabase Cloud installs extensions into a separate `extensions` schema, unlike local Docker which uses `public`.
- Apply migrations with: `cd` to repo root, `export SUPABASE_DB_PASSWORD='bYlNuDRORsgpUklt'`, then `pnpm dlx supabase@2.117.0 db push --yes --project-ref flahcpkdkimhslamhntx`.
- After any Vercel env var change, a redeploy is required for it to take effect (env vars are not live-reloaded into running functions) — not needed for this plan since no new env vars are introduced, but keep in mind if one comes up during implementation.

---

### Task 1: Domain constants for allowed file types and size limit

**Files:**
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `TIPOS_DOCUMENTO_PERMITIDOS: readonly string[]`, `TAMANO_MAXIMO_DOCUMENTO_BYTES: number` — consumed by Task 6 (server action validation) and Task 7 (form `accept` attribute).

- [ ] **Step 1: Add the constants**

Add this block right after the `PRIORIDADES` export (near the top of the file, in the "Dominio" section):

```ts
export const TIPOS_DOCUMENTO_PERMITIDOS = [
  ".pptx",
  ".ppt",
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
] as const;

export const TAMANO_MAXIMO_DOCUMENTO_BYTES = 25 * 1024 * 1024; // 25MB
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @tablero/core typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat: add allowed file types and size limit constants for documentos"
```

---

### Task 2: Migration — `documentos` table, indexes, RLS, storage bucket

**Files:**
- Create: `supabase/migrations/0004_documentos.sql`

**Interfaces:**
- Produces: Postgres table `documentos` (columns: `id`, `carpeta`, `nombre_logico`, `nombre_archivo`, `storage_path`, `tipo`, `tamano_bytes`, `subido_en`) and Storage bucket `documentos` — consumed by Task 3.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Documentos: biblioteca de archivos "IA en TSOFT", versionados
-- por nombre lógico (mismo nombre = misma familia de versiones).
-- ============================================================

set search_path = public, extensions;

create table documentos (
  id             uuid primary key default uuid_generate_v4(),
  carpeta        text,                    -- null = sin carpeta / raíz
  nombre_logico  text not null,           -- "Journey de IA" (agrupa versiones)
  nombre_archivo text not null,           -- nombre real del archivo subido
  storage_path   text not null unique,    -- ruta dentro del bucket privado
  tipo           text not null,           -- mime type / extensión
  tamano_bytes   bigint not null,
  subido_en      timestamptz not null default now()
);

create index documentos_nombre_trgm_idx on documentos using gin (nombre_logico gin_trgm_ops);
create index documentos_carpeta_idx on documentos (carpeta);

alter table documentos enable row level security;
revoke all on table documentos from anon, authenticated;

-- Bucket privado: el acceso siempre pasa por el servidor con
-- service_role, igual que el resto del dominio (tareas, áreas).
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply to production**

```bash
export SUPABASE_DB_PASSWORD='bYlNuDRORsgpUklt'
pnpm dlx supabase@2.117.0 db push --yes --project-ref flahcpkdkimhslamhntx
```

Expected output includes `"migrations":["0004_documentos.sql"]` and `"message":"Finished supabase db push."`. This will likely prompt a permission confirmation from the Claude Code auto-mode classifier (it did for every previous `db push` in this project) — that's expected, not an error.

- [ ] **Step 3: Verify the table and bucket exist**

```bash
SR="<the SUPABASE_SERVICE_ROLE_KEY from apps/web/.env.local>"
curl -s "https://flahcpkdkimhslamhntx.supabase.co/rest/v1/documentos?select=id&limit=1" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR"
```

Expected: `[]` (empty array, not an error) — confirms the table exists and RLS/service_role access works.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_documentos.sql
git commit -m "feat: add documentos table, indexes, RLS and storage bucket"
git push origin main
```

---

### Task 3: `packages/db/src/documentos.ts` — data access module

**Files:**
- Create: `packages/db/src/documentos.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Consumes: `db()` from `./client` (existing), `normalizar`/`resolverNombre` from `@tablero/core` (existing).
- Produces (all consumed by Task 6 and Task 9):
  - `interface Documento { id: string; carpeta: string | null; nombre_logico: string; nombre_archivo: string; storage_path: string; tipo: string; tamano_bytes: number; subido_en: string }`
  - `interface DocumentoAgrupado { nombre_logico: string; carpeta: string | null; ultima: Documento; anteriores: Documento[] }`
  - `interface NuevoDocumento { carpeta: string | null; nombre_logico: string; nombre_archivo: string; storage_path: string; tipo: string; tamano_bytes: number; contenido: ArrayBuffer }`
  - `listarCarpetas(): Promise<string[]>`
  - `listarDocumentos(carpeta?: string): Promise<DocumentoAgrupado[]>`
  - `resolverDocumento(nombre: string): Promise<string | null>`
  - `ultimaVersion(nombreLogico: string): Promise<Documento | null>`
  - `historialVersiones(nombreLogico: string): Promise<Documento[]>`
  - `registrarDocumento(entrada: NuevoDocumento): Promise<Documento>`
  - `generarLinkDescarga(documentoId: string): Promise<{ url: string; nombreArchivo: string } | null>`

- [ ] **Step 1: Write `packages/db/src/documentos.ts`**

```ts
import "server-only";

import { resolverNombre } from "@tablero/core";
import { db } from "./client";

const BUCKET = "documentos";

export interface Documento {
  id: string;
  carpeta: string | null;
  nombre_logico: string;
  nombre_archivo: string;
  storage_path: string;
  tipo: string;
  tamano_bytes: number;
  subido_en: string;
}

export interface DocumentoAgrupado {
  nombre_logico: string;
  carpeta: string | null;
  ultima: Documento;
  anteriores: Documento[];
}

export interface NuevoDocumento {
  carpeta: string | null;
  nombre_logico: string;
  nombre_archivo: string;
  storage_path: string;
  tipo: string;
  tamano_bytes: number;
  contenido: ArrayBuffer;
}

export async function listarCarpetas(): Promise<string[]> {
  const { data, error } = await db()
    .from("documentos")
    .select("carpeta")
    .not("carpeta", "is", null);

  if (error) {
    throw new Error(`No se pudieron leer las carpetas: ${error.message}`);
  }

  const unicas = new Set(
    (data ?? []).map((f) => f.carpeta as string).filter(Boolean),
  );
  return [...unicas].sort((a, b) => a.localeCompare(b, "es"));
}

export async function listarDocumentos(
  carpeta?: string,
): Promise<DocumentoAgrupado[]> {
  let q = db()
    .from("documentos")
    .select("*")
    .order("subido_en", { ascending: false });

  if (carpeta) q = q.eq("carpeta", carpeta);

  const { data, error } = await q;
  if (error) {
    throw new Error(`No se pudieron leer los documentos: ${error.message}`);
  }

  const filas = (data ?? []) as Documento[];
  const grupos = new Map<string, Documento[]>();
  for (const fila of filas) {
    const lista = grupos.get(fila.nombre_logico) ?? [];
    lista.push(fila);
    grupos.set(fila.nombre_logico, lista);
  }

  return [...grupos.entries()]
    .map(([nombre_logico, versiones]) => ({
      nombre_logico,
      carpeta: versiones[0].carpeta,
      ultima: versiones[0],
      anteriores: versiones.slice(1),
    }))
    .sort((a, b) => b.ultima.subido_en.localeCompare(a.ultima.subido_en));
}

/**
 * Resuelve un nombre lógico por aproximación contra los que ya existen.
 * Igual mecanismo que resolverArea/resolverPersona en repo.ts.
 */
export async function resolverDocumento(
  nombre: string,
): Promise<string | null> {
  const { data, error } = await db().from("documentos").select("nombre_logico");
  if (error) {
    throw new Error(`No se pudo resolver el documento: ${error.message}`);
  }

  const nombres = [
    ...new Set((data ?? []).map((f) => f.nombre_logico as string)),
  ];
  if (nombres.length === 0) return null;

  const candidatos = nombres.map((n) => ({ nombre_logico: n }));
  const resuelto = resolverNombre(nombre, candidatos, (c) => [c.nombre_logico]);
  return resuelto?.nombre_logico ?? null;
}

export async function ultimaVersion(
  nombreLogico: string,
): Promise<Documento | null> {
  const { data, error } = await db()
    .from("documentos")
    .select("*")
    .eq("nombre_logico", nombreLogico)
    .order("subido_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo leer la última versión: ${error.message}`);
  }
  return (data as Documento) ?? null;
}

export async function historialVersiones(
  nombreLogico: string,
): Promise<Documento[]> {
  const { data, error } = await db()
    .from("documentos")
    .select("*")
    .eq("nombre_logico", nombreLogico)
    .order("subido_en", { ascending: false });

  if (error) {
    throw new Error(`No se pudo leer el historial: ${error.message}`);
  }
  return (data ?? []) as Documento[];
}

export async function registrarDocumento(
  entrada: NuevoDocumento,
): Promise<Documento> {
  const { error: errorSubida } = await db()
    .storage.from(BUCKET)
    .upload(entrada.storage_path, entrada.contenido, {
      contentType: entrada.tipo,
      upsert: false,
    });

  if (errorSubida) {
    throw new Error(`No se pudo subir el archivo: ${errorSubida.message}`);
  }

  const { data, error } = await db()
    .from("documentos")
    .insert({
      carpeta: entrada.carpeta,
      nombre_logico: entrada.nombre_logico,
      nombre_archivo: entrada.nombre_archivo,
      storage_path: entrada.storage_path,
      tipo: entrada.tipo,
      tamano_bytes: entrada.tamano_bytes,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`No se pudo registrar el documento: ${error.message}`);
  }
  return data as Documento;
}

export async function generarLinkDescarga(
  documentoId: string,
): Promise<{ url: string; nombreArchivo: string } | null> {
  const { data: fila, error: errorFila } = await db()
    .from("documentos")
    .select("*")
    .eq("id", documentoId)
    .maybeSingle();

  if (errorFila) {
    throw new Error(`No se pudo leer el documento: ${errorFila.message}`);
  }
  if (!fila) return null;

  const doc = fila as Documento;
  const { data, error } = await db()
    .storage.from(BUCKET)
    .createSignedUrl(doc.storage_path, 60);

  if (error) {
    throw new Error(`No se pudo generar el link: ${error.message}`);
  }
  return { url: data.signedUrl, nombreArchivo: doc.nombre_archivo };
}
```

- [ ] **Step 2: Add the package export**

In `packages/db/package.json`, add a new entry to `"exports"` (keep `.` and `./client` as they are):

```json
{
  "exports": {
    ".": "./src/repo.ts",
    "./client": "./src/client.ts",
    "./documentos": "./src/documentos.ts"
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @tablero/db typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/documentos.ts packages/db/package.json
git commit -m "feat: add documentos data access module (packages/db)"
```

---

### Task 4: Extract shared `Nav` component and add "Documentos" link

**Files:**
- Create: `apps/web/components/Nav.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/metricas/page.tsx`
- Modify: `apps/web/app/tareas/page.tsx`

**Interfaces:**
- Produces: `Nav({ activa }: { activa: "hoy" | "tareas" | "documentos" | "metricas" })` — a Server Component (no `"use client"`) — consumed by Task 8 and the three existing pages.

- [ ] **Step 1: Create `apps/web/components/Nav.tsx`**

```tsx
import Link from "next/link";
import { logout } from "../app/auth-actions";

type Pagina = "hoy" | "tareas" | "documentos" | "metricas";

export function Nav({ activa }: { activa: Pagina }) {
  return (
    <nav className="board-nav narrow">
      <Link href="/" aria-current={activa === "hoy" ? "page" : undefined}>
        Hoy
      </Link>
      <Link
        href="/tareas"
        aria-current={activa === "tareas" ? "page" : undefined}
      >
        Tareas
      </Link>
      <Link
        href="/documentos"
        aria-current={activa === "documentos" ? "page" : undefined}
      >
        Documentos
      </Link>
      <Link
        href="/metricas"
        aria-current={activa === "metricas" ? "page" : undefined}
      >
        Métricas
      </Link>
      <form action={logout}>
        <button type="submit">Salir</button>
      </form>
    </nav>
  );
}
```

- [ ] **Step 2: Wire it into `apps/web/app/page.tsx`**

Replace the `import { logout } from "./auth-actions";` line and the inline `<nav className="board-nav narrow">...</nav>` block.

Add near the top imports:
```tsx
import { Nav } from "../components/Nav";
```

Remove the `import { logout } from "./auth-actions";` line (no longer used directly in this file).

Replace the entire `<nav className="board-nav narrow">...</nav>` block (currently right after `<div className="tallies narrow">...</div>`) with:
```tsx
        <Nav activa="hoy" />
```

- [ ] **Step 3: Wire it into `apps/web/app/metricas/page.tsx`**

Add import: `import { Nav } from "../../components/Nav";`
Remove: `import { logout } from "../auth-actions";`
Replace the `<nav className="board-nav narrow">...</nav>` block with:
```tsx
        <Nav activa="metricas" />
```

- [ ] **Step 4: Wire it into `apps/web/app/tareas/page.tsx`**

This file has its own local `function Nav({ activa }: { activa: "hoy" | "tareas" | "metricas" }) { ... }` — delete that whole local function definition, delete the `import { logout } from "../auth-actions";` line, and add:
```tsx
import { Nav } from "../../components/Nav";
```

Every call site in this file currently does `<Nav activa="tareas" />` — that stays as-is (the shared component has a superset of the type, `"documentos"` is just an additional allowed value now).

- [ ] **Step 5: Typecheck, lint, build**

```bash
pnpm typecheck
pnpm --filter @tablero/web lint
pnpm --filter @tablero/web build
```

Expected: all pass, no errors. The route list in the build output should still show the same routes as before (this task adds no new routes).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/Nav.tsx apps/web/app/page.tsx apps/web/app/metricas/page.tsx apps/web/app/tareas/page.tsx
git commit -m "refactor: extract shared Nav component, prep for Documentos link"
```

---

### Task 5: Visual styles for the Documentos section

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces CSS classes consumed by Task 7 and Task 8: `.documento-form`, `.documentos-grid`, `.documento-card`, `.documento-card-header`, `.documento-card-info`, `.documento-nombre`, `.documento-meta`, `.documento-descargar`, `.documento-historial-toggle`, `.documento-historial`.

- [ ] **Step 1: Append this block to the end of `globals.css`** (before the final `@media (max-width: 34rem)` block, so it's covered by the existing reduced-motion rules if needed later)

```css
/* ---------- Documentos ---------- */

.documento-form {
  display: grid;
  gap: var(--sp-3);
  margin-bottom: var(--sp-6);
  padding: var(--sp-4);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}

.documento-form label {
  display: grid;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  color: var(--navy);
}

.documento-form input {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
  font: inherit;
  background: var(--white);
  color: var(--navy);
  transition: border-color var(--t-fast) var(--ease);
}

.documento-form input:focus-visible {
  border-color: var(--navy);
  outline: none;
}

.documento-form button {
  border: 0;
  border-radius: var(--r-md);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red);
  color: var(--white);
  font: inherit;
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease);
  justify-self: start;
}

.documento-form button:hover:not(:disabled) {
  background: var(--red-dark);
}

.documento-form button:disabled {
  opacity: 0.5;
  cursor: default;
}

.documentos-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.documento-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
}

.documento-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.documento-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.documento-nombre {
  font-size: var(--fs-body);
  font-weight: var(--fw-semibold);
  color: var(--navy);
}

.documento-meta {
  font-size: var(--fs-sm);
  color: var(--slate);
}

.documento-descargar {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-4);
  background: var(--white);
  color: var(--navy);
  font: inherit;
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition:
    border-color var(--t-fast) var(--ease),
    color var(--t-fast) var(--ease);
}

.documento-descargar:hover:not(:disabled) {
  border-color: var(--navy);
}

.documento-descargar:disabled {
  opacity: 0.6;
  cursor: wait;
}

.documento-historial-toggle {
  margin-top: var(--sp-3);
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--slate);
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.documento-historial {
  margin: var(--sp-2) 0 0;
  padding: var(--sp-3) 0 0;
  border-top: 1px solid var(--border);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.documento-historial li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--slate);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat: add styles for the Documentos section"
```

---

### Task 6: Server Actions — upload and on-demand download link

**Files:**
- Create: `apps/web/app/documentos/actions.ts`

**Interfaces:**
- Consumes: `TIPOS_DOCUMENTO_PERMITIDOS`, `TAMANO_MAXIMO_DOCUMENTO_BYTES` from `@tablero/core` (Task 1); `registrarDocumento`, `generarLinkDescarga` from `@tablero/db/documentos` (Task 3); `requireUser` from `../../lib/auth` (existing).
- Produces: `interface SubirDocumentoState { error: string | null }`, `subirDocumento(prevState: SubirDocumentoState, formData: FormData): Promise<SubirDocumentoState>`, `pedirLinkDescarga(documentoId: string): Promise<{ ok: true; url: string; nombreArchivo: string } | { ok: false; error: string }>` — consumed by Task 7.

- [ ] **Step 1: Write `apps/web/app/documentos/actions.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  TAMANO_MAXIMO_DOCUMENTO_BYTES,
  TIPOS_DOCUMENTO_PERMITIDOS,
} from "@tablero/core";
import {
  generarLinkDescarga,
  registrarDocumento,
} from "@tablero/db/documentos";
import { requireUser } from "../../lib/auth";

export interface SubirDocumentoState {
  error: string | null;
}

function extension(nombreArchivo: string): string {
  const punto = nombreArchivo.lastIndexOf(".");
  return punto === -1 ? "" : nombreArchivo.slice(punto).toLowerCase();
}

export async function subirDocumento(
  _estado: SubirDocumentoState,
  formData: FormData,
): Promise<SubirDocumentoState> {
  await requireUser();

  const archivo = formData.get("archivo");
  const nombreLogico = String(formData.get("nombre_logico") ?? "").trim();
  const carpetaCruda = String(formData.get("carpeta") ?? "").trim();
  const carpeta = carpetaCruda || null;

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Elegí un archivo para subir." };
  }
  if (!nombreLogico) {
    return { error: "Ponele un nombre al documento." };
  }

  const ext = extension(archivo.name);
  if (
    !(TIPOS_DOCUMENTO_PERMITIDOS as readonly string[]).includes(ext)
  ) {
    return {
      error: `Tipo de archivo no permitido (${ext || "sin extensión"}). Permitidos: ${TIPOS_DOCUMENTO_PERMITIDOS.join(", ")}.`,
    };
  }
  if (archivo.size > TAMANO_MAXIMO_DOCUMENTO_BYTES) {
    return { error: "El archivo supera el tamaño máximo permitido (25MB)." };
  }

  const storagePath = `${randomUUID()}-${archivo.name}`;
  const contenido = await archivo.arrayBuffer();

  try {
    await registrarDocumento({
      carpeta,
      nombre_logico: nombreLogico,
      nombre_archivo: archivo.name,
      storage_path: storagePath,
      tipo: archivo.type || "application/octet-stream",
      tamano_bytes: archivo.size,
      contenido,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }

  revalidatePath("/documentos");
  return { error: null };
}

export async function pedirLinkDescarga(
  documentoId: string,
): Promise<
  { ok: true; url: string; nombreArchivo: string } | { ok: false; error: string }
> {
  await requireUser();
  try {
    const resultado = await generarLinkDescarga(documentoId);
    if (!resultado) return { ok: false, error: "No se encontró el documento." };
    return { ok: true, url: resultado.url, nombreArchivo: resultado.nombreArchivo };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @tablero/web typecheck`
Expected: fails at this point only if Task 7/8 files that import from here don't exist yet — that's fine, this task's own file has no errors in isolation. If run after Task 3 is committed, this should typecheck cleanly on its own (nothing imports this file yet, so no consumer errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/documentos/actions.ts
git commit -m "feat: add upload and download-link server actions for documentos"
```

---

### Task 7: `DocumentoCard` and `SubirDocumentoForm` components

**Files:**
- Create: `apps/web/components/DocumentoCard.tsx`
- Create: `apps/web/components/SubirDocumentoForm.tsx`

**Interfaces:**
- Consumes: `type Documento` from `@tablero/db/documentos` (Task 3); `pedirLinkDescarga`, `subirDocumento`, `type SubirDocumentoState` from `../app/documentos/actions` (Task 6); `TIPOS_DOCUMENTO_PERMITIDOS` from `@tablero/core` (Task 1).
- Produces: `DocumentoCard({ nombreLogico, ultima, anteriores }: { nombreLogico: string; ultima: Documento; anteriores: Documento[] })`, `SubirDocumentoForm({ carpetas }: { carpetas: string[] })` — both consumed by Task 8.

- [ ] **Step 1: Write `apps/web/components/DocumentoCard.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import type { Documento } from "@tablero/db/documentos";
import { pedirLinkDescarga } from "../app/documentos/actions";

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function BotonDescargar({ documento }: { documento: Documento }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function descargar() {
    setError(null);
    iniciar(async () => {
      const r = await pedirLinkDescarga(documento.id);
      if (r.ok) {
        window.location.href = r.url;
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        className="documento-descargar"
        onClick={descargar}
        disabled={pendiente}
      >
        {pendiente ? "Generando link…" : "Descargar"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export function DocumentoCard({
  nombreLogico,
  ultima,
  anteriores,
}: {
  nombreLogico: string;
  ultima: Documento;
  anteriores: Documento[];
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="documento-card">
      <div className="documento-card-header">
        <div className="documento-card-info">
          <span className="documento-nombre">{nombreLogico}</span>
          <span className="documento-meta">
            {formatearFecha(ultima.subido_en)} · {formatearTamano(ultima.tamano_bytes)}
          </span>
        </div>
        <BotonDescargar documento={ultima} />
      </div>

      {anteriores.length > 0 && (
        <>
          <button
            type="button"
            className="documento-historial-toggle"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? "Ocultar" : "Ver"} versiones anteriores ({anteriores.length})
          </button>
          {abierto && (
            <ul className="documento-historial">
              {anteriores.map((v) => (
                <li key={v.id}>
                  <span>
                    {formatearFecha(v.subido_en)} · {formatearTamano(v.tamano_bytes)}
                  </span>
                  <BotonDescargar documento={v} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `apps/web/components/SubirDocumentoForm.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { TIPOS_DOCUMENTO_PERMITIDOS } from "@tablero/core";
import {
  subirDocumento,
  type SubirDocumentoState,
} from "../app/documentos/actions";

const initialState: SubirDocumentoState = { error: null };

export function SubirDocumentoForm({ carpetas }: { carpetas: string[] }) {
  const [state, action, pending] = useActionState(subirDocumento, initialState);

  return (
    <form action={action} className="documento-form">
      <label>
        Carpeta (opcional)
        <input
          name="carpeta"
          list="carpetas-existentes"
          placeholder="ej: Casos de uso"
        />
        <datalist id="carpetas-existentes">
          {carpetas.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label>
        Nombre del documento
        <input name="nombre_logico" required placeholder="ej: Journey de IA" />
      </label>
      <label>
        Archivo
        <input
          name="archivo"
          type="file"
          required
          accept={TIPOS_DOCUMENTO_PERMITIDOS.join(",")}
        />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Subiendo…" : "Subir"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @tablero/web typecheck`
Expected: passes (both files are self-contained; nothing else imports them yet, so no dangling-reference errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/DocumentoCard.tsx apps/web/components/SubirDocumentoForm.tsx
git commit -m "feat: add DocumentoCard and SubirDocumentoForm components"
```

---

### Task 8: `/documentos` page

**Files:**
- Create: `apps/web/app/documentos/page.tsx`

**Interfaces:**
- Consumes: `listarCarpetas`, `listarDocumentos` from `@tablero/db/documentos` (Task 3); `Nav` from `../../components/Nav` (Task 4); `DocumentoCard`, `SubirDocumentoForm` from `../../components/*` (Task 7); `AutoRefresh` from `../../components/AutoRefresh` (existing); `requireUser` from `../../lib/auth` (existing).

- [ ] **Step 1: Write `apps/web/app/documentos/page.tsx`**

```tsx
import Link from "next/link";
import { listarCarpetas, listarDocumentos } from "@tablero/db/documentos";
import { AutoRefresh } from "../../components/AutoRefresh";
import { DocumentoCard } from "../../components/DocumentoCard";
import { Nav } from "../../components/Nav";
import { SubirDocumentoForm } from "../../components/SubirDocumentoForm";
import { requireUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function Documentos({
  searchParams,
}: {
  searchParams: Promise<{ carpeta?: string }>;
}) {
  await requireUser();
  const { carpeta } = await searchParams;

  const [carpetas, documentos] = await Promise.all([
    listarCarpetas(),
    listarDocumentos(carpeta),
  ]);

  return (
    <>
      <AutoRefresh />
      <header className="board-head">
        <h1 className="board-title">Documentos</h1>
        <p className="board-date narrow">IA en TSOFT</p>
        <Nav activa="documentos" />
      </header>

      <SubirDocumentoForm carpetas={carpetas} />

      {carpetas.length > 0 && (
        <div className="tabs" role="tablist">
          <Link
            href="/documentos"
            className={`tab${!carpeta ? " tab-activa" : ""}`}
            aria-current={!carpeta ? "page" : undefined}
          >
            Todas
          </Link>
          {carpetas.map((c) => (
            <Link
              key={c}
              href={`/documentos?carpeta=${encodeURIComponent(c)}`}
              className={`tab${carpeta === c ? " tab-activa" : ""}`}
              aria-current={carpeta === c ? "page" : undefined}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {documentos.length === 0 ? (
        <div className="empty">
          <p>Todavía no subiste ningún documento.</p>
        </div>
      ) : (
        <div className="documentos-grid">
          {documentos.map((d) => (
            <DocumentoCard
              key={d.nombre_logico}
              nombreLogico={d.nombre_logico}
              ultima={d.ultima}
              anteriores={d.anteriores}
            />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck, lint, build**

```bash
pnpm typecheck
pnpm --filter @tablero/web lint
pnpm --filter @tablero/web build
```

Expected: all pass. The build output's route list should now include `/documentos` (as `ƒ /documentos`, dynamic — same pattern as `/tareas` and `/metricas`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/documentos/page.tsx
git commit -m "feat: add /documentos page"
```

---

### Task 9: MCP tools — `buscar_documento` and `descargar_documento`

**Files:**
- Modify: `apps/web/app/api/mcp/route.ts`

**Interfaces:**
- Consumes: `listarDocumentos`, `resolverDocumento`, `ultimaVersion`, `generarLinkDescarga` from `@tablero/db/documentos` (Task 3).

- [ ] **Step 1: Add the import**

At the top of `apps/web/app/api/mcp/route.ts`, add a new import line (alongside the existing `@tablero/db` import):

```ts
import {
  generarLinkDescarga,
  listarDocumentos,
  resolverDocumento,
  ultimaVersion,
} from "@tablero/db/documentos";
```

- [ ] **Step 2: Register the two tools**

Add this block right after the closing of the `clasificar_inbox` tool registration (still inside the `(server) => { ... }` callback passed to `createMcpHandler`, before its closing `}`):

```ts
    server.registerTool(
      "buscar_documento",
      {
        title: "Buscar documento",
        description:
          "Busca documentos guardados en 'IA en TSOFT' por nombre aproximado (ej. 'Journey de IA') y, opcionalmente, por carpeta. Devuelve la versión más reciente de cada coincidencia y cuántas versiones anteriores tiene.",
        inputSchema: z.object({
          nombre: z.string().optional().describe("Nombre del documento a buscar."),
          carpeta: z.string().optional(),
        }),
      },
      async ({ nombre, carpeta }) => {
        const documentos = await listarDocumentos(carpeta);
        const filtrados = nombre
          ? documentos.filter((d) =>
              d.nombre_logico.toLowerCase().includes(nombre.toLowerCase()),
            )
          : documentos;

        if (filtrados.length === 0) {
          return texto("No encontré documentos que coincidan.");
        }

        return texto(
          filtrados
            .map((d) => {
              const fecha = new Date(d.ultima.subido_en).toLocaleDateString(
                "es-AR",
              );
              const carpetaTxt = d.carpeta ? ` (${d.carpeta})` : "";
              const historial = d.anteriores.length
                ? `, ${d.anteriores.length} versión(es) anterior(es)`
                : "";
              return `- ${d.nombre_logico}${carpetaTxt} — última: ${d.ultima.nombre_archivo}, ${fecha}${historial}`;
            })
            .join("\n"),
        );
      },
    );

    server.registerTool(
      "descargar_documento",
      {
        title: "Descargar documento",
        description:
          "Genera un link temporal (válido ~60 segundos) para descargar la última versión de un documento de 'IA en TSOFT', identificado por nombre aproximado.",
        inputSchema: z.object({
          nombre: z.string().describe("Nombre del documento, ej: 'Journey de IA'."),
        }),
      },
      async ({ nombre }) => {
        const resuelto = await resolverDocumento(nombre);
        if (!resuelto) {
          return texto(
            `No encontré ningún documento parecido a "${nombre}". Probá con buscar_documento para ver los nombres disponibles.`,
          );
        }

        const version = await ultimaVersion(resuelto);
        if (!version) return texto("No encontré versiones para ese documento.");

        const link = await generarLinkDescarga(version.id);
        if (!link) return texto("No se pudo generar el link de descarga.");

        return texto(
          `Última versión de "${resuelto}": ${link.nombreArchivo}\nLink temporal (válido ~60s): ${link.url}`,
        );
      },
    );
```

- [ ] **Step 3: Typecheck, lint, build**

```bash
pnpm typecheck
pnpm --filter @tablero/web lint
pnpm --filter @tablero/web build
```

Expected: all pass. `/api/mcp` should still appear in the build output route list (unchanged route, new tools registered inside the same handler).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/mcp/route.ts
git commit -m "feat: add buscar_documento and descargar_documento MCP tools"
```

---

### Task 10: Deploy and verify end-to-end in production

**Files:** none (verification only).

- [ ] **Step 1: Push everything to `main`**

```bash
git push origin main
```

This triggers a Vercel production deployment (same as every prior feature this session).

- [ ] **Step 2: Wait for the deployment to be `Ready`**

Use `mcp__plugin_vercel_vercel__list_deployments` (projectId `prj_nrk7MgNEto4zyQYOLMwbNNZJMnNP`, teamId `team_WMkur3pe5jFX9CaX9Aoc8i26`) to find the newest deployment's id, then poll `pnpm dlx vercel inspect <id> --scope miguel-maidanas-projects` until `status` is `Ready`.

- [ ] **Step 3: Verify the page loads**

With Playwright (already logged in from prior verification in this session, or log in again with the admin credentials), navigate to `https://portal-seguimiento.vercel.app/documentos` and confirm: the page renders with the upload form, no carpetas/documentos yet ("Todavía no subiste ningún documento."), and "Documentos" appears as a nav link on Hoy/Tareas/Métricas too.

- [ ] **Step 4: Upload a real test file**

Use Playwright to fill the upload form with a small real PDF (or any allowed file already on disk) — carpeta: leave empty or use "Prueba", nombre_logico: "Prueba de verificación", pick the file, submit. Confirm the card appears with the correct name, date, and size.

- [ ] **Step 5: Verify download from the web**

Click "Descargar" on the test card, confirm the browser receives the file (check the network response is a 200 from a Supabase signed URL, not an error).

- [ ] **Step 6: Verify the MCP tools**

```bash
curl -s -X POST "https://portal-seguimiento.vercel.app/api/mcp" \
  -H "Authorization: Bearer <MCP_TOKEN>" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"buscar_documento","arguments":{"nombre":"Prueba"}}}'
```

Expected: a text result mentioning "Prueba de verificación" and its upload date.

```bash
curl -s -X POST "https://portal-seguimiento.vercel.app/api/mcp" \
  -H "Authorization: Bearer <MCP_TOKEN>" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"descargar_documento","arguments":{"nombre":"Prueba de verificación"}}}'
```

Expected: a text result with a `https://...supabase.co/storage/v1/object/sign/documentos/...` URL. Fetch that URL with `curl -s -o test-download.<ext> "<url>"` and confirm the downloaded file matches the original (same size/content) — this proves the full MCP → signed URL → local-disk-download path the user asked about.

- [ ] **Step 7: Clean up the test data**

Delete the test row and its storage object so production stays clean:

```bash
SR="<SUPABASE_SERVICE_ROLE_KEY>"
# Get the test document's id and storage_path first:
curl -s "https://flahcpkdkimhslamhntx.supabase.co/rest/v1/documentos?nombre_logico=eq.Prueba%20de%20verificaci%C3%B3n&select=id,storage_path" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR"

# Delete the row:
curl -s -X DELETE "https://flahcpkdkimhslamhntx.supabase.co/rest/v1/documentos?id=eq.<id>" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR"

# Delete the storage object (Storage REST API):
curl -s -X DELETE "https://flahcpkdkimhslamhntx.supabase.co/storage/v1/object/documentos/<storage_path>" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR"
```

Delete the locally downloaded `test-download.<ext>` file too.

- [ ] **Step 8: Report to the user**

Summarize: migration applied, `/documentos` live, upload/download verified on web and via MCP, test data cleaned up. Delete this checklist item's local scratch files if any remain.

---

## Self-Review Notes (for whoever executes this)

- Every task after Task 1 depends on the previous ones' exact exported names (`Documento`, `DocumentoAgrupado`, `subirDocumento`, `pedirLinkDescarga`, `Nav`, `DocumentoCard`, `SubirDocumentoForm`) — if you rename anything, update every consumer listed in that task's "Interfaces" block.
- Do not add a `buscar_documento`/`descargar_documento` upload capability — uploads are web-only per the spec.
- Do not create a separate `carpetas` table — `carpeta` is a free-text column, grouping is derived with `DISTINCT`-style logic in `listarCarpetas`.
