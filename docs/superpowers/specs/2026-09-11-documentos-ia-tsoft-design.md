# Documentos "IA en TSOFT" — diseño

Fecha: 2026-09-11
Estado: aprobado por el usuario, pendiente de plan de implementación

## Qué resuelve

El usuario acumula documentación de IA (PPTs, PDFs, Word/Excel) en distintas
versiones a lo largo del tiempo (ej: "Journey de IA" v1, v2, v3) y hoy no
tiene un lugar centralizado para guardarla, organizarla por carpetas, y
recuperar "la última versión" — ni desde la web del Tablero ni pidiéndoselo
al chat.

## Alcance

Una sección nueva del Tablero (`/documentos`) para subir/organizar/descargar
archivos, más dos tools de MCP para buscar y descargar por nombre desde el
chat. Vive en el mismo proyecto Next.js + Supabase Cloud, con la misma
autenticación que el resto (un solo usuario admin).

Fuera de alcance (decidido explícitamente): búsqueda por contenido del
archivo (OCR/texto), subida vía MCP/chat (solo por la web), borrado
automático de versiones viejas, carpetas anidadas (un solo nivel).

## Decisiones de diseño

- **Versión = mismo nombre lógico.** Subís un archivo con el mismo "nombre
  lógico" (ej. siempre "Journey de IA") y el sistema lo agrupa
  automáticamente con las versiones anteriores, ordenadas por fecha de
  subida. "La última versión" es la más reciente subida bajo ese nombre.
  Las versiones anteriores nunca se borran solas.
- **Carpetas libres**, un solo nivel, creadas por el usuario al subir (texto
  libre, no atadas a las áreas/verticales del tablero de tareas).
- El **nombre lógico agrupa versiones globalmente**, independiente de la
  carpeta: dos archivos con el mismo nombre lógico son versiones del mismo
  documento aunque terminen en carpetas distintas. Es responsabilidad del
  usuario mantener el mismo nombre lógico en la misma carpeta a lo largo
  del tiempo; el sistema no lo fuerza.
- **Solo se sube desde la web.** El chat/MCP puede buscar y descargar, no
  subir.
- **Tipos permitidos:** `.pptx`, `.ppt`, `.pdf`, `.docx`, `.doc`, `.xlsx`,
  `.xls`, validados en cliente y servidor. Tope de 25MB por archivo.

## Modelo de datos

Migración nueva `supabase/migrations/0004_documentos.sql`:

```sql
create table documentos (
  id            uuid primary key default uuid_generate_v4(),
  carpeta       text,                    -- null = sin carpeta / raíz
  nombre_logico text not null,           -- "Journey de IA" (agrupa versiones)
  nombre_archivo text not null,          -- nombre real del archivo subido
  storage_path  text not null unique,    -- ruta dentro del bucket privado
  tipo          text not null,           -- extensión / mime type
  tamano_bytes  bigint not null,
  subido_en     timestamptz not null default now()
);

create index documentos_nombre_trgm_idx on documentos using gin (nombre_logico gin_trgm_ops);

alter table documentos enable row level security;
revoke all on table documentos from anon, authenticated;
```

Mismo modelo de seguridad que `tareas`: RLS habilitado sin policies
públicas, todo el acceso pasa por el servidor con `service_role`.

## Storage

- Bucket **privado** `documentos` en Supabase Storage (mismo proyecto ya
  provisionado, `supabase-violet-pillar`).
- Cada archivo se guarda como `<id>-<nombre-original>` para evitar
  colisiones.
- Descargas vía **signed URL** de corta duración (~60s), generadas
  server-side bajo demanda — nunca hay una URL pública fija.

## Backend (`packages/db/src/documentos.ts`)

Archivo nuevo, separado de `repo.ts` (dominio distinto al de tareas):

- `listarCarpetas()`
- `resolverDocumento(nombreLogico)` — reutiliza `resolverNombre`/`normalizar`
  de `packages/core`, mismo mecanismo de resolución difusa que áreas y
  personas.
- `ultimaVersion(nombreLogico)` / `historialVersiones(nombreLogico)`
- `registrarDocumento(...)` — inserta la fila después de subir el archivo a
  Storage.
- `generarLinkDescarga(documentoId)` — pide a Supabase Storage el signed URL
  para esa versión puntual.

Flujo de subida (web): el archivo se sube al bucket desde una Server
Action que valida tipo/tamaño, y luego llama a `registrarDocumento`.

Flujo de descarga (web y MCP): se llama a `generarLinkDescarga` y se
entrega/redirige al link temporal.

## Web (`/documentos`)

- Página nueva, protegida con `requireUser()` como el resto.
- Nav: se agrega "Documentos" junto a Hoy / Tareas / Métricas.
- Pills de carpetas (mismo patrón visual que las de área en `/tareas`),
  "Todas" por defecto.
- Documentos agrupados por nombre lógico: se muestra la versión más
  reciente (nombre, fecha, tamaño, botón "Descargar") con un desplegable
  para ver versiones anteriores.
- Formulario de subida arriba: carpeta (texto con sugerencias), nombre
  lógico, selector de archivo. Reutiliza los estilos existentes
  (inputs/botón navy del sistema de diseño ya aplicado).

## MCP (mismo endpoint `/api/mcp`, mismo `MCP_TOKEN`)

- **`buscar_documento({ nombre, carpeta? })`** — resuelve por nombre
  aproximado, devuelve coincidencias con su versión más reciente.
- **`descargar_documento({ nombre })`** — resuelve el nombre (pide
  desambiguación si hay varias coincidencias, igual que con tareas),
  devuelve un signed URL + nombre de archivo de la versión más reciente.
  Desde Claude Code, el asistente baja ese link directo al disco del
  usuario (por defecto a su carpeta de Descargas).

## Verificación antes de producción

La tabla y el bucket son aditivos (no tocan nada existente), así que se
prueba directo en producción con datos descartables — mismo patrón usado
para `/tareas` y las verticales:

1. Aplicar la migración a producción (tabla vacía, sin impacto en lo
   demás).
2. Subir un archivo de prueba real, verificar listado/búsqueda/descarga
   por web y por MCP.
3. Borrar el dato de prueba al terminar.

No se activa Docker local ni se usa un Preview de Vercel para esto: ambos
apuntarían igual a la misma base de Supabase Cloud, así que no aíslan el
riesgo (que de todos modos es bajo por ser una tabla nueva).
