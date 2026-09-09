# Tablero

Portal personal de seguimiento con una interfaz web y un servidor MCP que
operan sobre la misma base de datos Supabase.

## Arquitectura

```text
tablero/
├── apps/web/                Next.js: tablero, métricas, login y MCP
├── packages/core/           Tipos, validaciones y fechas en lenguaje natural
├── packages/db/             Consultas server-only a Supabase
└── supabase/migrations/     Esquema y datos iniciales
```

La web requiere una sesión de Supabase Auth y además limita el acceso al email
configurado en `ADMIN_EMAIL`. El MCP usa un bearer token independiente. La
clave `service_role` se utiliza únicamente en el servidor y nunca debe llevar
el prefijo `NEXT_PUBLIC_`.

## Requisitos

- Node.js 20 o superior; se recomienda Node.js 22.
- pnpm 11.
- Un proyecto en Supabase.
- Un proyecto en Vercel para publicar la aplicación.

## Configuración local

Instalá dependencias y creá el archivo de variables:

```bash
pnpm install
cp .env.example apps/web/.env.local
```

Completá `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL=tu-email@dominio.com
MCP_TOKEN=un_secreto_aleatorio_largo
```

Podés generar el token con:

```bash
openssl rand -hex 32
```

## Preparar Supabase

Autenticá y vinculá Supabase CLI al proyecto remoto:

```bash
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref TU_PROJECT_REF
pnpm dlx supabase@latest db push
```

Las migraciones crean las tablas, índices, trigger, vista del brief y los datos
iniciales. RLS queda habilitado sin policies, por lo que la clave pública no
puede consultar las tablas directamente.

En el dashboard de Supabase:

1. Abrí **Authentication → Users → Add user**.
2. Creá el usuario con el mismo email de `ADMIN_EMAIL` y una contraseña segura.
3. En **Authentication → Providers → Email**, deshabilitá el registro público.

Iniciá la aplicación:

```bash
pnpm dev
```

Abrí `http://localhost:3000` e ingresá con el usuario creado.

### Supabase local con Docker

Para trabajar sin conectarte al proyecto remoto, iniciá Docker Desktop y
levantá el stack local:

```bash
pnpm supabase:start
pnpm supabase:status
```

La primera ejecución descarga las imágenes y aplica automáticamente las
migraciones. En `apps/web/.env.local`, usá los valores informados por
`supabase:status`: `API URL`, `Publishable key` y `Service role key`. Configurá
además un `ADMIN_EMAIL` y un `MCP_TOKEN` exclusivamente locales.

El panel de Supabase Studio queda en `http://127.0.0.1:55323`. Desde
**Authentication → Users** creá el usuario que declaraste en `ADMIN_EMAIL`.
La aplicación sigue disponible en `http://localhost:3000`.

Cuando termines:

```bash
pnpm supabase:stop
```

## Verificación

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Despliegue en Vercel

1. Subí el monorepo a un repositorio Git privado.
2. Importá el repositorio desde Vercel.
3. Configurá **Root Directory** como `apps/web`.
4. Agregá las cinco variables del `.env.example` en Production y Preview.
5. Desplegá y verificá el login, el tablero y `/metricas`.
6. Configurá la URL de producción en **Supabase → Authentication → URL Configuration**.

Vercel detecta Next.js y el workspace pnpm automáticamente. No se requieren
comandos personalizados de instalación o build.

## Conexión MCP

El endpoint remoto es:

```text
https://TU_DOMINIO/api/mcp
```

Configurá el cliente MCP para usar Streamable HTTP y enviar:

```text
Authorization: Bearer TU_MCP_TOKEN
```

El servidor publica estas herramientas:

- `brief_del_dia`
- `buscar_tareas`
- `contexto_tablero`
- `metricas`
- `agregar_tarea`
- `actualizar_tarea`
- `completar_tarea`
- `clasificar_inbox`

Una petición sin token o con un token incorrecto devuelve `401`. Si
`MCP_TOKEN` no está configurado, devuelve `500` sin habilitar el acceso.

## Operación

- Los errores de la aplicación y del MCP se revisan en **Vercel → Logs**.
- Las consultas y errores de base se revisan en **Supabase → Logs**.
- Para cambiar áreas o personas iniciales, agregá una nueva migración; no
  modifiques una migración ya aplicada en producción.
- Rotá `MCP_TOKEN` actualizando Vercel y luego la configuración del cliente.
