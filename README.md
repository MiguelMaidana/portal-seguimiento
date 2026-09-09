# Tablero

Portal personal de seguimiento con una interfaz web y un servidor MCP que operan sobre la misma base de datos Supabase.

**Estado actual:** versión 0 publicada en GitHub y entorno local funcional. La aplicación todavía no está conectada a Supabase Cloud ni desplegada en Vercel. El detalle completo está en [`docs/ESTADO.md`](docs/ESTADO.md).

## Arquitectura

```text
tablero/
├── apps/web/                Next.js App Router: tablero, login, métricas y MCP
├── packages/core/           Tipos, validaciones y fechas en lenguaje natural
├── packages/db/             Consultas server-only a Supabase
└── supabase/migrations/     Esquema y datos iniciales
```

La web requiere una sesión de Supabase Auth y limita el acceso al email configurado en `ADMIN_EMAIL`. El MCP usa un bearer token independiente. La clave `service_role` se utiliza únicamente en el servidor y nunca debe llevar el prefijo `NEXT_PUBLIC_`.

## Qué está construido

- Tablero diario con inbox, áreas, estados, prioridades, foco y vencimientos.
- Captura rápida y acciones para completar tareas desde la web.
- Métricas en `/metricas`.
- Login con Supabase Auth y autorización por `ADMIN_EMAIL`.
- Servidor MCP en `/api/mcp`, protegido con bearer token.
- Ocho herramientas MCP para brief diario, búsqueda, contexto, métricas, altas, actualizaciones, cierres y clasificación del inbox.
- Dominio compartido entre web y MCP en `packages/core` y `packages/db`.
- Migraciones SQL con RLS, auditoría de eventos, vista del brief y datos iniciales.

## Requisitos

- Node.js 20 o superior; se recomienda Node.js 22.
- pnpm 11.
- Docker Desktop para el entorno local.
- Un proyecto Supabase y un proyecto Vercel para producción.

## Configuración local

```bash
pnpm install
pnpm supabase:start
pnpm supabase:status
cp .env.example apps/web/.env.local
```

La primera ejecución descarga las imágenes y aplica automáticamente las migraciones. Copiá `.env.example` como `apps/web/.env.local` y completá los valores informados por `supabase:status`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL=tu-email-local@ejemplo.test
MCP_TOKEN=un_secreto_aleatorio_largo
```

El panel local de Supabase Studio queda en `http://127.0.0.1:55323`. Desde **Authentication → Users** creá el usuario que declaraste en `ADMIN_EMAIL`. Luego iniciá la web:

```bash
pnpm dev
```

Abrí `http://localhost:3000`. Los comandos de Supabase están fijados a la versión estable `2.117.0`:

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:stop
```

`apps/web/.env.local` es local y está excluido de Git.

## Preparar Supabase Cloud

Autenticá y vinculá la CLI al proyecto remoto:

```bash
pnpm dlx supabase@2.117.0 login
pnpm dlx supabase@2.117.0 link --project-ref TU_PROJECT_REF
pnpm dlx supabase@2.117.0 db push
```

Las migraciones crean tablas, índices, trigger, vista del brief y datos iniciales. RLS queda habilitado sin policies públicas; el acceso a datos ocurre desde el servidor con `SUPABASE_SERVICE_ROLE_KEY`.

En Supabase Auth creá el usuario con el mismo email de `ADMIN_EMAIL` y deshabilitá el registro público.

## Verificación

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Estado verificado en local: 13 tests pasando, TypeScript, ESLint y build de producción correctos; migraciones aplicadas; login, REST y MCP probados.

El workflow de GitHub Actions en `.github/workflows/ci.yml` ejecuta estas mismas comprobaciones en cada push a `main` y en cada pull request.

## Despliegue en Vercel

El repositorio es [`MiguelMaidana/portal-seguimiento`](https://github.com/MiguelMaidana/portal-seguimiento).

1. Importá el repositorio en Vercel.
2. Configurá **Root Directory** como `apps/web`.
3. Agregá las cinco variables de `.env.example` en Production y Preview.
4. Desplegá y verificá login, tablero y `/metricas`.
5. Configurá la URL de producción en **Supabase → Authentication → URL Configuration**.

Vercel detecta Next.js y el workspace pnpm automáticamente.

## Conexión MCP

El endpoint remoto es `https://TU_DOMINIO/api/mcp`. Configurá el cliente MCP para usar Streamable HTTP y enviar `Authorization: Bearer TU_MCP_TOKEN`.

Herramientas publicadas: `brief_del_dia`, `buscar_tareas`, `contexto_tablero`, `metricas`, `agregar_tarea`, `actualizar_tarea`, `completar_tarea` y `clasificar_inbox`.

Una petición sin token o con token incorrecto devuelve `401`. Si `MCP_TOKEN` no está configurado, devuelve `500`.

## Historial y próximos pasos

| Versión | Commit | Estado |
|---|---|---|
| 0 | `0dbbb9b` — `chore: initial version 0` | Primera implementación completa |
| 0.1 | `24372dd` — `chore: add reproducible local Supabase setup` | Puertos, comandos y documentación local |

El próximo hito es configurar Supabase Cloud, desplegar `apps/web` en Vercel y probar el MCP en producción. Después se evaluarán nuevas funcionalidades; subtareas, recurrencias, adjuntos y jerarquías de proyectos quedan deliberadamente fuera del alcance actual.

## Operación

- Revisá errores web y MCP en Vercel Logs.
- Revisá consultas y errores de base en Supabase Logs.
- Para cambiar áreas o personas iniciales, agregá una nueva migración.
- Rotá `MCP_TOKEN` actualizando Vercel y la configuración del cliente.
