# Estado del proyecto

Última actualización: 2026-09-09  
Repositorio: [MiguelMaidana/portal-seguimiento](https://github.com/MiguelMaidana/portal-seguimiento)  
Rama principal: `main`

## Resumen

Tablero es un portal personal para capturar y seguir tareas desde una web y desde un cliente MCP. Ambas entradas usan la misma lógica de dominio y el mismo acceso server-only a Supabase.

La versión 0 está implementada y publicada. El entorno local está probado con Supabase sobre Docker. El pendiente principal es crear/configurar el proyecto remoto y desplegar la aplicación.

## Lo que construimos

### Aplicación web

- Next.js App Router en `apps/web`.
- `/`: tablero diario con captura rápida, inbox, áreas y tiras de tareas.
- `/login`: acceso por email y contraseña mediante Supabase Auth.
- `/metricas`: métricas y desglose operativo.
- `/api/mcp`: endpoint MCP por Streamable HTTP.
- Proxy de sesión que protege las rutas web y permite solo `ADMIN_EMAIL`.

### Dominio y datos

- `packages/core`: tipos, esquemas Zod, estados, prioridades, fechas relativas y resolución aproximada de áreas/personas.
- `packages/db`: repositorio server-only con operaciones de tareas, brief, métricas, eventos y catálogos.
- `supabase/migrations/0001_init.sql`: tablas, índices, RLS, trigger y vista `v_brief`.
- `supabase/migrations/0002_seed.sql`: seis áreas y datos iniciales.
- Estados: `inbox`, `pendiente`, `en_curso`, `esperando`, `hecha` y `archivada`.
- Fechas separadas: `fecha_foco` (cuándo trabajar) y `fecha_limite` (compromiso real).

### Herramientas MCP

El endpoint publica `brief_del_dia`, `buscar_tareas`, `contexto_tablero`, `metricas`, `agregar_tarea`, `actualizar_tarea`, `completar_tarea` y `clasificar_inbox`.

El endpoint exige `Authorization: Bearer <MCP_TOKEN>`. Sin token responde `401`; sin la variable configurada responde `500`.

## Estado técnico verificado

- 13 tests de dominio pasando.
- TypeScript pasando en los tres paquetes/proyectos.
- ESLint pasando.
- Build de producción de Next.js pasando.
- Supabase local iniciado con Docker y las dos migraciones aplicadas.
- Seis áreas iniciales visibles vía REST.
- Usuario local creado y login por contraseña validado.
- `/login` responde `200` y `/` redirige a `/login` sin sesión.
- MCP sin token responde `401`; con token válido inicializa y responde `200`.

El workflow `.github/workflows/ci.yml` repite test, typecheck, lint y build en GitHub Actions para `main` y pull requests.

## Entorno local actual

Requisitos: Node.js 20+, pnpm 11 y Docker Desktop.

```bash
pnpm install
pnpm supabase:start
pnpm supabase:status
pnpm dev
```

Copiá `.env.example` a `apps/web/.env.local` y completá las claves que informa `pnpm supabase:status`.

Puertos configurados para evitar el rango reservado de Windows:

| Servicio | URL/puerto |
|---|---|
| Web | `http://localhost:3000` |
| Supabase API | `http://127.0.0.1:55321` |
| Postgres | `127.0.0.1:55322` |
| Supabase Studio | `http://127.0.0.1:55323` |
| Mailpit | `http://127.0.0.1:55324` |

`apps/web/.env.local` es local y está excluido de Git. Nunca subas sus claves.

## Versionado

| Versión | Commit | Descripción |
|---|---|---|
| 0 | `0dbbb9b` | Implementación inicial del portal |
| 0.1 | `24372dd` | Setup local reproducible y documentación operativa |

## Pendiente

- Crear o seleccionar el proyecto Supabase Cloud.
- Ejecutar las migraciones remotas con la CLI fijada en `2.117.0`.
- Crear el usuario administrador real y configurar `ADMIN_EMAIL`.
- Generar un `MCP_TOKEN` de producción y cargar las cinco variables en Vercel.
- Desplegar con `apps/web` como Root Directory.
- Configurar la URL de producción en Supabase Auth.
- Conectar el cliente MCP y probar el brief diario en producción.

Fuera de alcance deliberado por ahora: subtareas, recurrencias, adjuntos y jerarquías de proyectos. Se evaluarán después de usar el tablero durante un tiempo real.
