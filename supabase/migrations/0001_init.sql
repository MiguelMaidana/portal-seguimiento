-- ============================================================
-- Tablero personal de seguimiento — esquema inicial
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "unaccent";
create extension if not exists "pg_trgm";

-- En Supabase Cloud las extensiones quedan en el schema "extensions"
-- (en local caen en "public"). Buscamos en los dos para que la migración
-- sea idéntica en ambos entornos.
set search_path = public, extensions;

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------

-- inbox      : capturado sin clasificar todavia
-- pendiente  : clasificado, esperando su turno
-- en_curso   : trabajando ahora
-- esperando  : bloqueado por un tercero (ver persona_id)
-- hecha      : completada
-- archivada  : ya no aplica, se guarda para historico
create type estado_tarea as enum (
  'inbox', 'pendiente', 'en_curso', 'esperando', 'hecha', 'archivada'
);

create type prioridad_tarea as enum ('baja', 'media', 'alta');

-- ------------------------------------------------------------
-- Areas: los "campos" del tablero (Implementacion, HUB IA, Claro, etc.)
-- ------------------------------------------------------------
create table areas (
  id         uuid primary key default uuid_generate_v4(),
  nombre     text not null unique,
  slug       text not null unique,
  color      text not null default 'slate',
  descripcion text,
  orden      int  not null default 100,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Personas: para "hablarle a Roger" y para tareas bloqueadas
-- alias permite que el MCP resuelva "Rogelio", "Roger F.", etc.
-- ------------------------------------------------------------
create table personas (
  id         uuid primary key default uuid_generate_v4(),
  nombre     text not null unique,
  alias      text[] not null default '{}',
  rol        text,
  notas      text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Tareas
-- ------------------------------------------------------------
create table tareas (
  id           uuid primary key default uuid_generate_v4(),
  titulo       text not null,
  detalle      text,
  area_id      uuid references areas(id) on delete set null,
  persona_id   uuid references personas(id) on delete set null,
  estado       estado_tarea    not null default 'inbox',
  prioridad    prioridad_tarea not null default 'media',
  -- fecha_foco: el dia en que decidis trabajarla. Es lo que maneja el brief.
  fecha_foco   date,
  -- fecha_limite: compromiso real con un tercero. Genera vencimiento.
  fecha_limite date,
  -- de donde vino: 'chat' (via MCP), 'web', 'reunion'
  origen       text not null default 'web',
  etiquetas    text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  constraint titulo_no_vacio check (length(trim(titulo)) > 0)
);

create index tareas_estado_idx       on tareas (estado);
create index tareas_fecha_foco_idx   on tareas (fecha_foco);
create index tareas_fecha_limite_idx on tareas (fecha_limite);
create index tareas_area_idx         on tareas (area_id);
create index tareas_persona_idx      on tareas (persona_id);
-- busqueda difusa por titulo, para que el MCP encuentre "la de Veracode"
create index tareas_titulo_trgm_idx  on tareas using gin (titulo gin_trgm_ops);

-- ------------------------------------------------------------
-- Eventos: log append-only. Alimenta las metricas y da trazabilidad
-- de lo que se cambio desde el chat.
-- ------------------------------------------------------------
create table eventos (
  id         uuid primary key default uuid_generate_v4(),
  tarea_id   uuid references tareas(id) on delete cascade,
  tipo       text not null,          -- creada | actualizada | completada | reabierta
  payload    jsonb not null default '{}',
  actor      text not null default 'web',  -- web | chat
  created_at timestamptz not null default now()
);

create index eventos_tarea_idx on eventos (tarea_id);
create index eventos_fecha_idx on eventos (created_at desc);

-- ------------------------------------------------------------
-- updated_at automatico + completed_at coherente con el estado
-- ------------------------------------------------------------
create or replace function tocar_tarea()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  -- OLD no existe en INSERT, hay que ramificar por TG_OP antes de tocarlo.
  if new.estado = 'hecha' then
    if tg_op = 'INSERT' or old.estado <> 'hecha' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create trigger tareas_tocar
  before insert or update on tareas
  for each row execute function tocar_tarea();

-- ------------------------------------------------------------
-- Vista del brief: lo que importa hoy, ya ordenado.
-- Se expone tal cual al MCP para que "que tengo pendiente hoy?"
-- sea una sola consulta.
-- ------------------------------------------------------------
create or replace view v_brief
with (security_invoker = true)
as
select
  t.id,
  t.titulo,
  t.detalle,
  t.estado,
  t.prioridad,
  t.fecha_foco,
  t.fecha_limite,
  a.nombre as area,
  a.color  as area_color,
  p.nombre as persona,
  case
    when t.fecha_limite is not null and t.fecha_limite < (now() at time zone 'America/Argentina/Buenos_Aires')::date then 'vencida'
    when t.fecha_limite = (now() at time zone 'America/Argentina/Buenos_Aires')::date                                then 'vence_hoy'
    when t.estado = 'en_curso'                                        then 'en_curso'
    when t.fecha_foco = (now() at time zone 'America/Argentina/Buenos_Aires')::date                                  then 'foco_hoy'
    when t.fecha_foco < (now() at time zone 'America/Argentina/Buenos_Aires')::date                                  then 'arrastrada'
    when t.estado = 'esperando'                                       then 'esperando'
    when t.estado = 'inbox'                                           then 'sin_clasificar'
    else 'proxima'
  end as motivo,
  -- orden de atencion: primero lo vencido, despues lo del dia
  case
    when t.fecha_limite is not null and t.fecha_limite < (now() at time zone 'America/Argentina/Buenos_Aires')::date then 0
    when t.fecha_limite = (now() at time zone 'America/Argentina/Buenos_Aires')::date                                then 1
    when t.estado = 'en_curso'                                        then 2
    when t.fecha_foco <= (now() at time zone 'America/Argentina/Buenos_Aires')::date                                 then 3
    when t.estado = 'inbox'                                           then 4
    when t.estado = 'esperando'                                       then 5
    else 6
  end as rango
from tareas t
left join areas    a on a.id = t.area_id
left join personas p on p.id = t.persona_id
where t.estado not in ('hecha', 'archivada')
  and (
       t.fecha_foco   <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
    or t.fecha_limite <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
    or t.estado in ('inbox', 'en_curso', 'esperando')
  );

-- ------------------------------------------------------------
-- RLS: el portal es de un solo usuario y el acceso va siempre
-- por service_role (server-side). Habilitamos RLS sin policies
-- para que la anon key no pueda leer nada si se filtra.
-- ------------------------------------------------------------
alter table areas    enable row level security;
alter table personas enable row level security;
alter table tareas   enable row level security;
alter table eventos  enable row level security;

revoke all on table areas, personas, tareas, eventos, v_brief
  from anon, authenticated;
revoke execute on function tocar_tarea()
  from public, anon, authenticated;
