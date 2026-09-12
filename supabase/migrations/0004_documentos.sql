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
