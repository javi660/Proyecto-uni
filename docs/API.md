# Referencia de la API REST

Base: `/api`. Todas las rutas responden JSON (salvo la descarga de adjuntos y los CSV). Este documento resume el contrato; las reglas de negocio completas están en [DECISIONES.md §3, §4 y §10](DECISIONES.md). La clasificación de acceso de las 58 rutas está verificada por `backend/tests/integration/security.integration.test.js`.

## 1. Convenciones

### Formato de respuesta
```json
{ "ok": true, "data": {}, "error": null, "meta": { "page": 1, "pageSize": 20, "total": 0 } }
```
En error: `{ "ok": false, "data": null, "error": { "code": "STRING", "message": "texto para el usuario", "details": [] } }`. `meta` solo aparece en listados. Los campos JSON replican los nombres de la base (español, `snake_case`).

### Códigos HTTP
| Código | Uso |
|---|---|
| 200 / 201 | Correcto / creado |
| 400 | Datos inválidos (cuerpo, consulta o parámetros; los esquemas rechazan campos desconocidos) |
| 401 | Sin sesión válida |
| 403 | Perfil sin permiso (`FORBIDDEN`), CSRF inválido (`CSRF_INVALID`), cambio de contraseña pendiente (`PASSWORD_CHANGE_REQUIRED`) |
| 404 | No existe **o está fuera del alcance** del usuario (no se revela su existencia) |
| 409 | Conflicto de integridad o de estado |
| 413 / 415 | Archivo demasiado grande / tipo no permitido |
| 422 | Regla semántica (p. ej. contraseña actual incorrecta) |
| 500 | Error interno (sin detalles) |

Toda respuesta de `/api/*` lleva `Cache-Control: no-store`.

### Paginación
`?page=1&pageSize=20` (por defecto 20, máximo 100). El listado devuelve `meta.total`.

### Autenticación y CSRF
- Sesión por cookies **HttpOnly**: `sgssu_at` (acceso, 15 min) y `sgssu_rt` (renovación, 7 días, ruta `/api/auth`, rota en cada uso; reutilizar una ya rotada revoca la sesión). No hay tokens en el cuerpo de las respuestas.
- Toda petición que cambia datos (POST, PUT, PATCH, DELETE) exige la cabecera `X-CSRF-Token` con el valor de `GET /api/auth/csrf` (campo `data.csrf_token`, cookie `sgssu_csrf`).
- Un usuario con `debe_cambiar_password` solo puede usar `/api/auth/me`, `/api/auth/password` y `/api/auth/logout`; el resto responde 403 `PASSWORD_CHANGE_REQUIRED`.
- El perfil se lee de la base en cada petición. Desactivar a un usuario o restablecer su contraseña invalida sus sesiones.

Ejemplo con `curl` (cookies en un archivo):
```bash
CSRF=$(curl -s -c jar -b jar http://localhost:4000/api/auth/csrf | node -pe "JSON.parse(require('fs').readFileSync(0)).data.csrf_token")
curl -s -c jar -b jar -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" \
  -d '{"correo":"admin@universidad.edu","password":"..."}' http://localhost:4000/api/auth/login
curl -s -b jar http://localhost:4000/api/requests
```

### Perfiles y alcance
ADM = administrador, EST = estudiante, FUN = funcionario, SUP = supervisor. Alcance de consulta de solicitudes: ADM todas; EST las propias; FUN aquellas cuya **última** asignación es suya; SUP las de servicios de las dependencias que supervisa. Fuera de alcance → 404.

## 2. Salud (públicas)

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/health` | Estado del servidor |
| GET | `/api/health/db` | Estado de la conexión a la base de datos |

## 3. Autenticación

| Método | Ruta | Quién | Cuerpo / resultado |
|---|---|---|---|
| GET | `/api/auth/csrf` | público | `{csrf_token}` |
| POST | `/api/auth/login` | público (límite de 10 intentos/15 min por IP) | `{correo, password}` → `{user}` y cookies. 401 `INVALID_CREDENTIALS` (mismo mensaje para correo inexistente o clave errónea); 403 `ACCOUNT_DISABLED` |
| POST | `/api/auth/refresh` | cookie `sgssu_rt` | Renueva ambas cookies |
| POST | `/api/auth/logout` | sesión | Revoca la sesión y borra cookies (idempotente) |
| GET | `/api/auth/me` | todos | `{user}` (`id_usuario`, `nombres`, `apellidos`, `correo`, `rol`, `debe_cambiar_password`, …) |
| PATCH | `/api/auth/password` | todos | `{password_actual, password_nueva}` → 422 si la actual es incorrecta. Contraseña: ≥ 10 caracteres con minúscula, mayúscula y número |

## 4. Administración (solo ADM salvo lectura de catálogo)

### Catálogo
`/api/dependencies`, `/api/categories` y `/api/services` comparten forma:

| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `/api/<recurso>` | todos | Paginado; filtros `q`, `activo`. Los no administradores solo ven lo activo. Servicios admiten además `id_categoria` e `id_dependencia` |
| GET | `/api/<recurso>/:id` | todos | Un inactivo responde 404 a no administradores |
| POST | `/api/<recurso>` | ADM | Cuerpos abajo |
| PUT | `/api/<recurso>/:id` | ADM | Reemplaza los campos editables |
| PATCH | `/api/<recurso>/:id/status` | ADM | `{activo: boolean}` |

Cuerpos (estrictos): dependencia `{nombre (≤120), descripcion?}`; categoría `{nombre (≤100), descripcion?}`; servicio `{nombre (≤150), descripcion?, id_categoria, id_dependencia, sla_horas? (1–8760, por defecto 72)}`. No hay `DELETE`: solo se desactiva.

Códigos de negocio: `DUPLICATE_NAME` (409), `HAS_ACTIVE_DEPENDENTS` (409, con conteo en `details`), `CATEGORY_INACTIVE`, `DEPENDENCY_INACTIVE`.

### Usuarios (`/api/users`, solo ADM)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/users` | Listado paginado con filtros |
| POST | `/api/users` | `{nombres, apellidos, correo, rol, id_dependencia?, password_inicial}`; fija `debe_cambiar_password` |
| GET · PUT | `/api/users/:id` | Detalle / edición (`{nombres, apellidos, correo, rol, id_dependencia?}`) |
| PATCH | `/api/users/:id/status` | `{activo}`; revoca sesiones al desactivar |
| PATCH | `/api/users/:id/password-reset` | `{password_nueva}`; fuerza cambio al ingresar; no sobre uno mismo (`USE_OWN_PASSWORD_CHANGE`) |
| GET · PUT | `/api/users/:id/supervision` | Dependencias de un SUPERVISOR; `PUT {ids_dependencias: []}` reemplaza el conjunto |

Códigos: `DUPLICATE_EMAIL`, `DEPENDENCY_REQUIRED`, `DEPENDENCY_NOT_ALLOWED`, `INVALID_DEPENDENCY`, `SELF_DEACTIVATION`, `SELF_ROLE_CHANGE`, `LAST_ADMIN`, `HAS_ACTIVE_ASSIGNMENTS`, `HAS_SUPERVISION`, `NOT_A_SUPERVISOR`. `password_hash` nunca sale de la API.

## 5. Solicitudes

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| POST | `/api/requests` | EST | `{id_servicio, asunto (≤180), descripcion (≤4000)}`. Estado, propietario, prioridad y código los fija el servidor. 409 `SERVICE_INACTIVE` |
| GET | `/api/requests/my` | EST | Solo las propias |
| GET | `/api/requests` | todos | Según alcance. Filtros: `q`, `estado`, `prioridad`, `id_servicio`, `id_categoria`, `id_dependencia`, `desde`, `hasta` (AAAA-MM-DD, hora de Bogotá, `hasta` inclusivo), `page`, `pageSize`. Más recientes primero |
| GET | `/api/requests/:id` | todos (en alcance) | Detalle con adjuntos y funcionario asignado |
| PATCH | `/api/requests/:id/status` | según destino | `{estado, observacion?}`. Ver transiciones abajo |
| PATCH | `/api/requests/:id/priority` | ADM, SUP (ámbito) | `{prioridad}`; 409 `SAME_PRIORITY` |
| GET | `/api/requests/:id/timeline` | quien ve la solicitud | Estados y respuestas en orden cronológico (para EST, sin datos internos) |
| GET · POST | `/api/requests/:id/responses` | ver: todos; crear: FUN asignado | `{contenido, visibilidad: PUBLICA \| INTERNA}` (por defecto PUBLICA). EST nunca recibe las INTERNA |
| GET | `/api/requests/:id/assignments` | quien ve la solicitud | Historial de asignaciones |
| POST | `/api/requests/:id/assignment` | ADM, SUP (ámbito) | `{id_funcionario, observacion? (≤500)}`. Asigna la primera vez y reasigna después |
| GET | `/api/officials` | ADM, SUP | Funcionarios activos asignables; filtros `id_dependencia`, `q`; incluye `carga_activa` |

### Transiciones de `PATCH /status`

| Destino | Desde | Quién | Motivo |
|---|---|---|---|
| EN_PROCESO | ASIGNADA, REABIERTA | FUN asignado | opcional |
| RESUELTA | EN_PROCESO | FUN asignado | opcional; exige respuesta pública desde la última entrada a EN_PROCESO |
| CERRADA | RESUELTA | EST propietario, ADM, SUP (ámbito) | opcional |
| REABIERTA | RESUELTA | EST propietario | **obligatorio** |
| RECHAZADA | REGISTRADA | ADM, SUP (ámbito) | **obligatorio** |

ASIGNADA se obtiene únicamente asignando. Cualquier otra transición → 409.

Códigos de estado y asignación: `INVALID_TRANSITION`, `REQUEST_CLOSED` (CERRADA/RECHAZADA), `RESPONSE_REQUIRED`, `INVALID_STATE`, `NOT_AN_OFFICIAL`, `OFFICIAL_INACTIVE`, `OFFICIAL_WRONG_DEPENDENCY`, `SAME_ASSIGNEE`.

### Adjuntos

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| GET | `/api/requests/:id/attachments` | quien ve la solicitud | Lista de adjuntos |
| POST | `/api/requests/:id/attachments` | EST propietario, FUN asignado | `multipart/form-data`, campo `archivo`, un archivo por petición |
| GET | `/api/attachments/:id/download` | quien ve la solicitud | Descarga con `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` |

Reglas: PDF, PNG, JPG/JPEG y DOCX; 5 MB por archivo; máximo 3 por solicitud; se valida extensión, MIME y firma real. Códigos: `FILE_REQUIRED`, `FILE_INVALID`, `FILE_EMPTY`, `FILE_CONTENT_MISMATCH` (400), `FILE_TYPE_NOT_ALLOWED` (415), `FILE_TOO_LARGE` (413), `ATTACHMENT_LIMIT` (409), `REQUEST_CLOSED` (409).

## 6. Notificaciones (todos, solo las propias)

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/notifications` | `?leida=true\|false&page&pageSize` → `id_notificacion`, `id_solicitud`, `codigo`, `titulo`, `mensaje`, `tipo`, `leida`, `creada_en` |
| GET | `/api/notifications/unread-count` | `{no_leidas}` |
| PATCH | `/api/notifications/:id/read` | Marca una (idempotente); ajena o inexistente → 404 |
| PATCH | `/api/notifications/read-all` | `{actualizadas}` |

Tipos: `SOLICITUD_REGISTRADA`, `SOLICITUD_ASIGNADA`, `SOLICITUD_REASIGNADA`, `SOLICITUD_INICIADA`, `NUEVA_RESPUESTA`, `SOLICITUD_RESUELTA`, `SOLICITUD_CERRADA`, `SOLICITUD_REABIERTA`, `SOLICITUD_RECHAZADA`. Destinatarios por evento: [DECISIONES.md §8](DECISIONES.md).

## 7. Dashboard y reportes

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| GET | `/api/dashboard` | todos | Indicadores del período según el perfil (EST: sus propias solicitudes) |
| GET | `/api/reports/by-status` | ADM, SUP, FUN | Los 7 estados, con ceros |
| GET | `/api/reports/by-period` | ADM, SUP, FUN | Registradas, resueltas y rechazadas por mes |
| GET | `/api/reports/by-category` | ADM, SUP, FUN | Conteos, retraso, tiempos y cumplimiento del SLA |
| GET | `/api/reports/by-dependency` | ADM, SUP, FUN | Ídem por dependencia |

Parámetros: `desde`, `hasta` (AAAA-MM-DD, `hasta` inclusivo, máximo 3 años), `id_dependencia`, `id_categoria`, `formato=json|csv`. Se rechazan fechas inexistentes, rangos invertidos y parámetros desconocidos (400). Por defecto: mes en curso (`by-period`: últimos 6 meses), en hora de Bogotá. Toda respuesta incluye `periodo {desde, hasta, por_defecto}`, `ambito` y `criterio`. El CSV usa UTF-8 con BOM, CRLF y neutraliza fórmulas. Definiciones de los indicadores: [DECISIONES.md §5 y §10.12](DECISIONES.md).

## 8. Auditoría (solo ADM, solo lectura)

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/audit` | Registros paginados, más recientes primero |
| GET | `/api/audit/:id` | Un registro |
| GET | `/api/audit/filters` | Operaciones y recursos existentes |

Filtros de `/api/audit`: `operacion`, `recurso`, `id_recurso`, `id_usuario`, `resultado` (`EXITO` \| `FALLO`), `desde`, `hasta`, `page`, `pageSize`. Cada fila trae `id_auditoria`, `id_usuario`, `usuario`, `correo`, `operacion`, `recurso`, `id_recurso`, `resultado`, `detalle`, `ip`, `creado_en`. Las claves con aspecto de credencial se muestran como `[oculto]`. No existe ningún endpoint para modificar o borrar auditoría (PUT/PATCH/DELETE/POST sobre `/api/audit/:id` → 404).
