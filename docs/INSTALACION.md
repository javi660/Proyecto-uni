# Instalación, configuración de Supabase y despliegue

> Verificación actual: los dos dominios de Render responden; `/api/health`, `/api/health/db` y el preflight CORS desde el frontend respondieron correctamente. Esto no sustituye una prueba de inicio de sesión o de subida de adjuntos. La configuración de cookies modificada aquí requiere volver a desplegar el backend.

## 1. Requisitos

- Node.js 20 o superior (probado con 22) y npm.
- Una base PostgreSQL: la de un proyecto Supabase o una local (PostgreSQL 16 en las pruebas).
- Para el despliegue: un servicio Node.js para el backend y un hosting estático para el frontend. Pueden tener dominios distintos si CORS y las cookies entre sitios están configurados como en la sección 5.

## 2. Instalación local

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2.1 Variables de entorno del backend

```bash
cd backend
cp .env.example .env          # Windows: copy .env.example .env
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NODE_ENV` | sí | `development`, `test` o `production`. |
| `PORT` | no | Puerto del API (4000 por defecto). |
| `CORS_ORIGINS` | sí | Orígenes permitidos separados por comas. Incluye `http://localhost:5173` para desarrollo y `https://proyecto-uni-1.onrender.com` para producción. |
| `DATABASE_URL` | sí | Cadena de conexión PostgreSQL. No agregues `?sslmode=`; el SSL se controla con `DB_SSL`. Si la contraseña tiene `@ : / # ?`, codifícala (URL-encode). |
| `TEST_DATABASE_URL` | solo pruebas | Base **distinta** de la real para las pruebas de integración (se reinicia en cada ejecución). |
| `DB_SSL` | no | `require` (por defecto; para Supabase), `verify` (con `DB_SSL_CA`) o `disable` (PostgreSQL local). |
| `DB_POOL_MAX` | no | Tamaño del pool (10 por defecto). |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | sí | Mínimo 32 caracteres cada uno y distintos entre sí. Genera uno con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `COOKIE_SECURE` | sí en producción | `true` en producción (el servidor se niega a iniciar en producción si es `false`). En local, `false`. |
| `BCRYPT_COST` | no | Costo de bcrypt (12 recomendado). |
| `TRUST_PROXY` | no | Número de proxies de confianza delante del backend (0 = ninguno). Ver sección 5. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET` | para adjuntos en Supabase | Si faltan las dos primeras, los adjuntos se guardan en `backend/.storage` (solo desarrollo). `STORAGE_BUCKET` por defecto: `sgssu-adjuntos`. |
| `NEW_USER_PASSWORD` | no | Contraseña para `npm run user:create` sin teclado. |

> La clave `SUPABASE_SERVICE_ROLE_KEY` da acceso total a tu proyecto: solo va en el backend, nunca en el frontend ni en Git.

En desarrollo, el frontend usa `VITE_API_PROXY_TARGET` (por defecto `http://localhost:4000`) para el proxy de Vite. En producción, el API por defecto es `https://proyecto-uni-2eqo.onrender.com/api`; se puede sustituir con `VITE_API_URL` en el entorno de compilación del frontend. Las variables `VITE_*` son visibles en el navegador: no pongas secretos.

### 2.2 Base de datos

```bash
npm run check:db                     # debe terminar con "la base de datos está lista"
npm run db:apply                     # crea las tablas y carga los 4 roles
npm run db:apply -- --demo-catalog   # (opcional) catálogo de ejemplo: dependencias, categorías y servicios
npm run db:migrate                   # aplica migraciones pendientes
npm run db:verify                    # 112 comprobaciones de integridad; no deja datos
```

- `db:apply` se niega si el esquema ya existe. Para recargar solo los datos iniciales: `npm run db:apply -- --seed-only`.
- `db:migrate` solo es necesario si tu esquema se creó antes de la Fase 8 (migración 001, columna `observacion_publica`). Las bases nuevas ya la traen.
- `db:reset` borra todas las tablas de SGSSU; pide escribir el nombre de la base y no corre con `NODE_ENV=production`.
- Alternativa sin scripts: pega `database/schema.sql` y luego `database/seed.sql` en el **SQL Editor** de Supabase.

### 2.3 Primer administrador

```bash
npm run user:create -- --correo admin@universidad.edu --nombres "Ana" --apellidos "Pérez" --rol ADMINISTRADOR
```

La contraseña (mínimo 10 caracteres, con minúscula, mayúscula y número) se pide por teclado y se cambia en el primer ingreso. Para funcionarios añade `--dependencia "Nombre exacto"`. La opción `--sin-cambio-obligatorio` omite el cambio inicial. Los demás usuarios se crean desde **Administración → Usuarios**.

### 2.4 Ejecutar

```bash
cd backend && npm run dev        # http://localhost:4000
cd frontend && npm run dev       # http://localhost:5173
```

El navegador llama a `/api` en su propio origen y Vite reenvía al backend; por eso las cookies de sesión funcionan sin configuración extra. Comprueba el estado en <http://localhost:5173/estado> (muestra el frontend, el backend y la base de datos).

## 3. Configurar Supabase (sin verificar contra tu proyecto)

1. **Crear el proyecto** en Supabase y guardar la contraseña de la base.
2. **Cadena de conexión:** *Project Settings → Database → Connection string → URI*. Si tu red no tiene IPv6 (error `ENOTFOUND` o `ENETUNREACH`), usa la del **Session pooler**. Ponla en `DATABASE_URL` con `DB_SSL=require`.
3. **Crear las tablas:** desde tu equipo, con esa `DATABASE_URL`, ejecuta `npm run check:db`, `npm run db:apply` y `npm run db:verify` (o usa el SQL Editor, sección 2.2).
4. **Bucket de adjuntos:** *Storage → New bucket*, nombre `sgssu-adjuntos` (o el que pongas en `STORAGE_BUCKET`), **privado** (sin acceso público).
5. **Claves:** en *Project Settings → API* copia la *Project URL* a `SUPABASE_URL` y la clave `service_role` a `SUPABASE_SERVICE_ROLE_KEY`.
6. **Primer administrador:** `npm run user:create` (sección 2.3).
7. **Acceso por la API de Supabase:** el sistema solo usa Supabase como PostgreSQL y Storage, y el navegador nunca lo contacta. Revisa en tu proyecto que las tablas no queden expuestas por la *Data API* (por ejemplo, activando RLS en las tablas sin crear políticas, o desactivando la Data API). Esto **no se pudo comprobar**; el backend se conecta con un rol de base de datos y no depende de esa API.

Verificación sugerida tras configurar: subir un adjunto en una solicitud y descargarlo; si funciona, el bucket y las claves son correctos.

## 4. Compilar el frontend

```bash
cd frontend
npm run build        # genera frontend/dist
npm run preview      # vista previa local (no es un servidor de producción)
```

## 5. Despliegue en Render

### 5.1 Dominios de producción

El frontend publicado es `https://proyecto-uni-1.onrender.com` y el backend es `https://proyecto-uni-2eqo.onrender.com`. En producción, las llamadas API van directamente a `https://proyecto-uni-2eqo.onrender.com/api`; en desarrollo, Vite conserva el proxy local `/api`. Como los dominios de Render son distintos, el backend debe permitir el origen del frontend en `CORS_ORIGINS` y las cookies de sesión se envían con `SameSite=None; Secure`.

Ejemplo con Nginx (adáptalo a tu servidor):

```nginx
server {
  listen 443 ssl;
  server_name sgssu.ejemplo.edu;

  root /var/www/sgssu/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 6m;          # el límite por archivo es 5 MB
  }

  location / {
    try_files $uri /index.html;       # SPA: rutas del navegador
  }
}
```

Los servicios de hosting estático que permiten *rewrites/proxy* hacia otro servidor pueden cumplir el mismo papel; consulta su documentación.

### 5.2 Variables del backend en Render

```
NODE_ENV=production
PORT=4000
CORS_ORIGINS=https://proyecto-uni-1.onrender.com
DATABASE_URL=<cadena de Supabase>
DB_SSL=require
JWT_ACCESS_SECRET=<48+ bytes aleatorios, exclusivo de producción>
JWT_REFRESH_SECRET=<otro distinto>
COOKIE_SECURE=true
TRUST_PROXY=1            # ajusta al número de proxies configurado en el hosting
BCRYPT_COST=12
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
STORAGE_BUCKET=sgssu-adjuntos
```

- `TRUST_PROXY` debe reflejar la cantidad real de proxies: si es menor, el límite de intentos de login y la auditoría verían la IP del proxy; si es mayor, un cliente podría falsificar su IP.
- Los secretos JWT de producción deben ser distintos de los de desarrollo. Cambiarlos cierra todas las sesiones.
- Configura las variables secretas y la conexión a la base de datos en el panel de Render; nunca las guardes en el repositorio. `COOKIE_SECURE=true` es obligatorio en producción.
- En el Static Site del frontend, compila desde `frontend` con `npm install && npm run build`. Si defines `VITE_API_URL`, pon `https://proyecto-uni-2eqo.onrender.com/api`; si no, el frontend usa esa dirección por defecto.
- El backend debe arrancar con `npm start` desde `backend` y tener `CORS_ORIGINS=https://proyecto-uni-1.onrender.com`.
- Antes del primer arranque en producción: `npm run db:apply`, `npm run db:migrate`, `npm run db:verify` y `npm run user:create`.

### 5.3 Cabeceras del frontend

El backend envía cabeceras de seguridad (helmet) en `/api`, pero los archivos estáticos los sirve tu servidor web. Configura allí al menos `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (o `frame-ancestors` en CSP) y `Referrer-Policy`, y valora una `Content-Security-Policy` propia. No se ha definido ni probado una CSP para el frontend.

### 5.4 Lista de comprobación posterior al despliegue

- [ ] `https://tu-dominio/api/health` y `/api/health/db` responden 200.
- [ ] Iniciar sesión funciona y las cookies tienen `Secure` y `HttpOnly`.
- [ ] Un intento fallido de login aparece en **Administración → Auditoría** con la IP del cliente (no la del proxy).
- [ ] Subir y descargar un adjunto.
- [ ] Las tablas no son accesibles desde la Data API de Supabase (sección 3, punto 7).
- [ ] `.env` no está en el repositorio ni en la imagen publicada.

## 6. Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| `ENOTFOUND` / `ENETUNREACH` al conectar | Tu red no tiene IPv6: usa el Session pooler de Supabase. |
| `password authentication failed` | Contraseña mal copiada o sin URL-encode. |
| El backend no inicia en producción | `COOKIE_SECURE` no es `true`, o los secretos JWT son cortos o iguales. |
| 403 `CSRF_INVALID` en peticiones que cambian datos | Falta la cabecera `X-CSRF-Token` (el frontend la envía solo; al probar con `curl` pídela en `GET /api/auth/csrf`). |
| Sesión que no se mantiene tras desplegar | Revisa `CORS_ORIGINS`, `COOKIE_SECURE=true` y que las cookies de producción usen `SameSite=None; Secure`. |
| `db:apply` se niega | El esquema ya existe; usa `--seed-only` o `db:reset` (borra datos). |
| Un adjunto da error de Storage | Bucket inexistente, nombre distinto de `STORAGE_BUCKET` o clave `service_role` incorrecta. |
