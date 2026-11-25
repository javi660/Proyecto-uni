# Instalación, configuración de Supabase y despliegue

> Qué está verificado: la instalación local con PostgreSQL y las pruebas se ejecutaron realmente. Las secciones de **Supabase** y **despliegue** describen los pasos esperados según el diseño y la documentación de cada servicio, pero **no se han ejecutado contra tu proyecto de Supabase ni en un hosting real**. Cada paso que no pude comprobar está marcado como *sin verificar*.

## 1. Requisitos

- Node.js 20 o superior (probado con 22) y npm.
- Una base PostgreSQL: la de un proyecto Supabase o una local (PostgreSQL 16 en las pruebas).
- Para el despliegue: un servidor o servicio donde correr Node.js, y un lugar para servir los archivos estáticos del frontend, ambos bajo **el mismo dominio** (ver sección 5).

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
| `CORS_ORIGINS` | sí | Orígenes permitidos separados por comas (en desarrollo, `http://localhost:5173`; en producción, el dominio del sitio con `https://`). |
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

El frontend tiene un solo ajuste opcional, `VITE_API_PROXY_TARGET` (por defecto `http://localhost:4000`), que solo afecta al servidor de desarrollo. Las variables `VITE_*` son visibles en el navegador: no pongas secretos.

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

## 5. Despliegue (sin verificar en un hosting real)

### 5.1 Principio: un solo origen

El frontend llama siempre a rutas relativas `/api`, y las cookies de sesión son `SameSite=Lax`. Por eso el sitio y la API deben verse bajo **el mismo dominio**: el servidor web que sirve `frontend/dist` debe reenviar `/api` al backend. Si el frontend y el backend viven en dominios distintos, las cookies de sesión no funcionarán sin cambios de código.

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

### 5.2 Variables del backend en producción

```
NODE_ENV=production
PORT=4000
CORS_ORIGINS=https://sgssu.ejemplo.edu
DATABASE_URL=<cadena de Supabase>
DB_SSL=require
JWT_ACCESS_SECRET=<48+ bytes aleatorios, exclusivo de producción>
JWT_REFRESH_SECRET=<otro distinto>
COOKIE_SECURE=true
TRUST_PROXY=1            # número de proxies entre el cliente y Node (1 con un solo Nginx/balanceador)
BCRYPT_COST=12
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
STORAGE_BUCKET=sgssu-adjuntos
```

- `TRUST_PROXY` debe reflejar la cantidad real de proxies: si es menor, el límite de intentos de login y la auditoría verían la IP del proxy; si es mayor, un cliente podría falsificar su IP.
- Los secretos JWT de producción deben ser distintos de los de desarrollo. Cambiarlos cierra todas las sesiones.
- Arranque: `cd backend && npm ci --omit=dev && npm start`. Usa un gestor de procesos (por ejemplo systemd o el del hosting) para reiniciarlo.
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
| Sesión que no se mantiene tras desplegar | Frontend y API en dominios distintos o sin `COOKIE_SECURE`/HTTPS. |
| `db:apply` se niega | El esquema ya existe; usa `--seed-only` o `db:reset` (borra datos). |
| Un adjunto da error de Storage | Bucket inexistente, nombre distinto de `STORAGE_BUCKET` o clave `service_role` incorrecta. |
