-- =====================================================================
-- SGSSU - Esquema de base de datos (PostgreSQL / Supabase)
-- Versión 1.0 (Fase 2)
--
-- Contiene: funciones auxiliares, 14 tablas, restricciones, índices,
-- triggers de integridad e inmutabilidad, y RLS.
--
-- Uso:
--   * Recomendado:  cd backend && npm run db:apply
--   * Alternativa:  pegar este archivo completo en Supabase > SQL Editor y ejecutar.
--
-- Este archivo crea el esquema DESDE CERO (no es idempotente). Los cambios
-- posteriores se hacen con archivos numerados en database/migrations/.
-- No incluye BEGIN/COMMIT: lo ejecuta una transacción externa.
--
-- Códigos SQLSTATE propios (los usa el backend para responder con HTTP correcto):
--   SG001  Transición de estado no permitida, o solicitud en estado final
--   SG002  Regla de integridad de negocio incumplida (perfiles, dependencias, asignaciones)
-- Código estándar usado para la inmutabilidad:
--   23001  restrict_violation (intento de modificar/borrar un registro de solo inserción)
-- =====================================================================


-- =====================================================================
-- 1. SECUENCIA Y FUNCIONES AUXILIARES
-- =====================================================================

-- Secuencia global del código de seguimiento (SGSSU-AAAA-NNNNNN)
CREATE SEQUENCE seq_codigo_solicitud AS BIGINT START WITH 1 INCREMENT BY 1;

-- Genera el código de seguimiento. El año es el de America/Bogota.
CREATE OR REPLACE FUNCTION fn_generar_codigo_solicitud()
RETURNS VARCHAR
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT 'SGSSU-'
         || to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY')
         || '-'
         || CASE WHEN length(s.n::text) >= 6 THEN s.n::text ELSE lpad(s.n::text, 6, '0') END
  FROM (SELECT nextval('seq_codigo_solicitud') AS n) AS s;
$$;

-- Mantiene actualizado_en en cada UPDATE
CREATE OR REPLACE FUNCTION fn_set_actualizado_en()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.actualizado_en := clock_timestamp();
  RETURN NEW;
END;
$$;

-- Bloquea UPDATE / DELETE / TRUNCATE en tablas de solo inserción
CREATE OR REPLACE FUNCTION fn_bloquear_modificacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'El registro es de solo inserción: no se permite % en la tabla %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- Grafo de transiciones de estado permitidas (red de seguridad: la lógica principal
-- vive en backend/src/services/request.service.js; ambos deben coincidir).
CREATE OR REPLACE FUNCTION fn_transicion_permitida(p_desde TEXT, p_hacia TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT (p_desde, p_hacia) IN (
    ('REGISTRADA', 'ASIGNADA'),
    ('REGISTRADA', 'RECHAZADA'),
    ('ASIGNADA',   'EN_PROCESO'),
    ('EN_PROCESO', 'RESUELTA'),
    ('RESUELTA',   'CERRADA'),
    ('RESUELTA',   'REABIERTA'),
    ('REABIERTA',  'ASIGNADA'),
    ('REABIERTA',  'EN_PROCESO')
  );
$$;


-- =====================================================================
-- 2. TABLAS
-- Orden: roles -> dependencias -> usuarios -> categorias -> servicios ->
--        solicitudes -> asignaciones -> respuestas -> historial_estados ->
--        adjuntos -> notificaciones -> supervision_dependencia ->
--        auditoria -> refresh_tokens
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2.1 roles
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id_rol       SERIAL PRIMARY KEY,
  nombre       VARCHAR(30) NOT NULL UNIQUE,
  descripcion  TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT ck_roles_nombre CHECK (nombre IN ('ADMINISTRADOR', 'ESTUDIANTE', 'FUNCIONARIO', 'SUPERVISOR'))
);

-- ---------------------------------------------------------------------
-- 2.2 dependencias
-- ---------------------------------------------------------------------
CREATE TABLE dependencias (
  id_dependencia  BIGSERIAL PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL UNIQUE,
  descripcion     TEXT,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_dependencias_nombre CHECK (char_length(btrim(nombre)) > 0)
);

-- ---------------------------------------------------------------------
-- 2.3 usuarios
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id_usuario               BIGSERIAL PRIMARY KEY,
  nombres                  VARCHAR(100) NOT NULL,
  apellidos                VARCHAR(100) NOT NULL,
  correo                   VARCHAR(150) NOT NULL UNIQUE,
  password_hash            TEXT NOT NULL,
  id_rol                   INTEGER NOT NULL REFERENCES roles (id_rol),
  id_dependencia           BIGINT REFERENCES dependencias (id_dependencia),
  activo                   BOOLEAN NOT NULL DEFAULT TRUE,
  debe_cambiar_password    BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_usuarios_nombres   CHECK (char_length(btrim(nombres)) > 0),
  CONSTRAINT ck_usuarios_apellidos CHECK (char_length(btrim(apellidos)) > 0),
  -- El backend normaliza el correo a minúsculas; la base lo garantiza
  CONSTRAINT ck_usuarios_correo_minusculas CHECK (correo = LOWER(correo)),
  CONSTRAINT ck_usuarios_correo_formato    CHECK (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Nunca texto plano: solo se acepta el formato de un hash bcrypt ($2a$/$2b$/$2y$ + costo + 53 caracteres)
  CONSTRAINT ck_usuarios_password_bcrypt   CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$.{53}$')
);

-- ---------------------------------------------------------------------
-- 2.4 categorias
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
  id_categoria    BIGSERIAL PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL UNIQUE,
  descripcion     TEXT,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_categorias_nombre CHECK (char_length(btrim(nombre)) > 0)
);

-- ---------------------------------------------------------------------
-- 2.5 servicios
-- ---------------------------------------------------------------------
CREATE TABLE servicios (
  id_servicio     BIGSERIAL PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  descripcion     TEXT,
  id_categoria    BIGINT NOT NULL REFERENCES categorias (id_categoria),
  id_dependencia  BIGINT NOT NULL REFERENCES dependencias (id_dependencia),
  sla_horas       INTEGER NOT NULL DEFAULT 72,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_servicios_nombre    CHECK (char_length(btrim(nombre)) > 0),
  CONSTRAINT ck_servicios_sla_horas CHECK (sla_horas > 0),
  CONSTRAINT uq_servicios_categoria_nombre UNIQUE (id_categoria, nombre)
);

-- ---------------------------------------------------------------------
-- 2.6 solicitudes
-- ---------------------------------------------------------------------
CREATE TABLE solicitudes (
  id_solicitud         BIGSERIAL PRIMARY KEY,
  codigo               VARCHAR(30) NOT NULL UNIQUE DEFAULT fn_generar_codigo_solicitud(),
  id_estudiante        BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  id_servicio          BIGINT NOT NULL REFERENCES servicios (id_servicio),
  asunto               VARCHAR(180) NOT NULL,
  descripcion          TEXT NOT NULL,
  estado               VARCHAR(30) NOT NULL DEFAULT 'REGISTRADA',
  prioridad            VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  fecha_registro       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_resolucion     TIMESTAMPTZ,
  fecha_cierre         TIMESTAMPTZ,
  CONSTRAINT ck_solicitudes_codigo CHECK (codigo ~ '^SGSSU-[0-9]{4}-[0-9]{6,}$'),
  CONSTRAINT ck_solicitudes_estado CHECK (estado IN
    ('REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA', 'RECHAZADA', 'REABIERTA')),
  CONSTRAINT ck_solicitudes_prioridad CHECK (prioridad IN ('BAJA', 'NORMAL', 'ALTA', 'URGENTE')),
  CONSTRAINT ck_solicitudes_asunto      CHECK (char_length(btrim(asunto)) > 0),
  CONSTRAINT ck_solicitudes_descripcion CHECK (char_length(btrim(descripcion)) > 0),
  -- fecha_resolucion conserva la última resolución (se mantiene si la solicitud se reabre)
  CONSTRAINT ck_solicitudes_fecha_resolucion CHECK (
    (estado NOT IN ('RESUELTA', 'CERRADA') OR fecha_resolucion IS NOT NULL)
    AND (fecha_resolucion IS NULL OR fecha_resolucion >= fecha_registro)
  ),
  -- fecha_cierre existe si y solo si la solicitud está CERRADA
  CONSTRAINT ck_solicitudes_fecha_cierre CHECK (
    (estado = 'CERRADA') = (fecha_cierre IS NOT NULL)
    AND (fecha_cierre IS NULL OR fecha_cierre >= fecha_registro)
  )
);

-- ---------------------------------------------------------------------
-- 2.7 asignaciones
-- ---------------------------------------------------------------------
CREATE TABLE asignaciones (
  id_asignacion   BIGSERIAL PRIMARY KEY,
  id_solicitud    BIGINT NOT NULL REFERENCES solicitudes (id_solicitud),
  id_funcionario  BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  id_asignador    BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  asignado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_en   TIMESTAMPTZ,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  observacion     TEXT,
  -- Una asignación está activa si y solo si no ha finalizado
  CONSTRAINT ck_asignaciones_activo_finalizado CHECK (activo = (finalizado_en IS NULL)),
  CONSTRAINT ck_asignaciones_fechas CHECK (finalizado_en IS NULL OR finalizado_en >= asignado_en)
);

-- Una solicitud solo puede tener UNA asignación activa
CREATE UNIQUE INDEX ux_asignaciones_activa_por_solicitud
  ON asignaciones (id_solicitud)
  WHERE activo;

-- ---------------------------------------------------------------------
-- 2.8 respuestas
-- ---------------------------------------------------------------------
CREATE TABLE respuestas (
  id_respuesta  BIGSERIAL PRIMARY KEY,
  id_solicitud  BIGINT NOT NULL REFERENCES solicitudes (id_solicitud),
  id_usuario    BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  contenido     TEXT NOT NULL,
  visibilidad   VARCHAR(20) NOT NULL DEFAULT 'PUBLICA',
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_respuestas_contenido   CHECK (char_length(btrim(contenido)) > 0),
  CONSTRAINT ck_respuestas_visibilidad CHECK (visibilidad IN ('PUBLICA', 'INTERNA'))
);

-- ---------------------------------------------------------------------
-- 2.9 historial_estados  (solo inserción)
-- ---------------------------------------------------------------------
CREATE TABLE historial_estados (
  id_historial     BIGSERIAL PRIMARY KEY,
  id_solicitud     BIGINT NOT NULL REFERENCES solicitudes (id_solicitud),
  estado_anterior  VARCHAR(30),
  estado_nuevo     VARCHAR(30) NOT NULL,
  id_usuario       BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  observacion      TEXT,
  -- TRUE: el estudiante propietario puede ver la observación (DECISIONES 4.4). Migración 001.
  observacion_publica BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_cambio     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_historial_estado_anterior CHECK (estado_anterior IS NULL OR estado_anterior IN
    ('REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA', 'RECHAZADA', 'REABIERTA')),
  CONSTRAINT ck_historial_estado_nuevo CHECK (estado_nuevo IN
    ('REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA', 'RECHAZADA', 'REABIERTA')),
  -- Un cambio real: el estado cambia
  CONSTRAINT ck_historial_cambio CHECK (estado_anterior IS DISTINCT FROM estado_nuevo),
  -- La fila inicial (sin estado anterior) es siempre REGISTRADA, y REGISTRADA solo es estado inicial
  CONSTRAINT ck_historial_inicial CHECK ((estado_anterior IS NULL) = (estado_nuevo = 'REGISTRADA')),
  -- Rechazar y reabrir exigen motivo (reglas de negocio 11 y 12)
  CONSTRAINT ck_historial_motivo CHECK (
    estado_nuevo NOT IN ('RECHAZADA', 'REABIERTA')
    OR char_length(btrim(COALESCE(observacion, ''))) > 0
  )
);

-- ---------------------------------------------------------------------
-- 2.10 adjuntos
-- ---------------------------------------------------------------------
CREATE TABLE adjuntos (
  id_adjunto         BIGSERIAL PRIMARY KEY,
  id_solicitud       BIGINT NOT NULL REFERENCES solicitudes (id_solicitud),
  id_usuario         BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  nombre_original    VARCHAR(255) NOT NULL,
  nombre_almacenado  VARCHAR(255) NOT NULL UNIQUE,
  ruta_archivo       TEXT NOT NULL,
  tipo_mime          VARCHAR(100) NOT NULL,
  tamano_bytes       BIGINT NOT NULL,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_adjuntos_nombre_original CHECK (char_length(btrim(nombre_original)) > 0),
  -- La ruta es una clave de objeto generada por el sistema: nunca absoluta ni con ".."
  CONSTRAINT ck_adjuntos_ruta CHECK (ruta_archivo !~ '(^/|\.\.|\\)' AND char_length(ruta_archivo) > 0),
  CONSTRAINT ck_adjuntos_mime CHECK (tipo_mime IN (
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  CONSTRAINT ck_adjuntos_tamano CHECK (tamano_bytes > 0 AND tamano_bytes <= 5242880)
);

-- ---------------------------------------------------------------------
-- 2.11 notificaciones
-- ---------------------------------------------------------------------
CREATE TABLE notificaciones (
  id_notificacion  BIGSERIAL PRIMARY KEY,
  id_usuario       BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  id_solicitud     BIGINT REFERENCES solicitudes (id_solicitud),
  titulo           VARCHAR(150) NOT NULL,
  mensaje          TEXT NOT NULL,
  tipo             VARCHAR(50) NOT NULL,
  leida            BOOLEAN NOT NULL DEFAULT FALSE,
  creada_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_notificaciones_titulo  CHECK (char_length(btrim(titulo)) > 0),
  CONSTRAINT ck_notificaciones_mensaje CHECK (char_length(btrim(mensaje)) > 0),
  CONSTRAINT ck_notificaciones_tipo CHECK (tipo IN (
    'SOLICITUD_REGISTRADA', 'SOLICITUD_ASIGNADA', 'SOLICITUD_REASIGNADA',
    'SOLICITUD_INICIADA', 'NUEVA_RESPUESTA', 'SOLICITUD_RESUELTA',
    'SOLICITUD_CERRADA', 'SOLICITUD_REABIERTA', 'SOLICITUD_RECHAZADA'
  ))
);

-- ---------------------------------------------------------------------
-- 2.12 supervision_dependencia
-- ---------------------------------------------------------------------
CREATE TABLE supervision_dependencia (
  id_supervision  BIGSERIAL PRIMARY KEY,
  id_supervisor   BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  id_dependencia  BIGINT NOT NULL REFERENCES dependencias (id_dependencia),
  creada_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_supervision_supervisor_dependencia UNIQUE (id_supervisor, id_dependencia)
);

-- ---------------------------------------------------------------------
-- 2.13 auditoria  (solo inserción)
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
  id_auditoria  BIGSERIAL PRIMARY KEY,
  id_usuario    BIGINT REFERENCES usuarios (id_usuario),
  operacion     VARCHAR(60) NOT NULL,
  recurso       VARCHAR(60) NOT NULL,
  id_recurso    VARCHAR(60),
  resultado     VARCHAR(10) NOT NULL,
  detalle       JSONB,
  ip            INET,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_auditoria_resultado CHECK (resultado IN ('EXITO', 'FALLO'))
);

-- ---------------------------------------------------------------------
-- 2.14 refresh_tokens  (sesiones revocables)
-- ---------------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id_token    BIGSERIAL PRIMARY KEY,
  id_usuario  BIGINT NOT NULL REFERENCES usuarios (id_usuario),
  token_hash  TEXT NOT NULL UNIQUE,
  expira_en   TIMESTAMPTZ NOT NULL,
  revocado    BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_refresh_tokens_expiracion CHECK (expira_en > creado_en)
);


-- =====================================================================
-- 3. ÍNDICES
-- (todas las claves foráneas tienen índice; los UNIQUE ya crean el suyo)
-- =====================================================================

-- usuarios
CREATE INDEX ix_usuarios_id_rol         ON usuarios (id_rol);
CREATE INDEX ix_usuarios_id_dependencia ON usuarios (id_dependencia);
CREATE INDEX ix_usuarios_activo         ON usuarios (activo);

-- servicios
CREATE INDEX ix_servicios_id_categoria   ON servicios (id_categoria);
CREATE INDEX ix_servicios_id_dependencia ON servicios (id_dependencia);

-- solicitudes (el código ya tiene índice por su UNIQUE)
CREATE INDEX ix_solicitudes_estudiante_fecha ON solicitudes (id_estudiante, fecha_registro DESC);
CREATE INDEX ix_solicitudes_id_servicio      ON solicitudes (id_servicio);
CREATE INDEX ix_solicitudes_estado           ON solicitudes (estado);
CREATE INDEX ix_solicitudes_fecha_registro   ON solicitudes (fecha_registro);

-- asignaciones
CREATE INDEX ix_asignaciones_id_funcionario ON asignaciones (id_funcionario, activo);
CREATE INDEX ix_asignaciones_id_asignador   ON asignaciones (id_asignador);
CREATE INDEX ix_asignaciones_solicitud      ON asignaciones (id_solicitud, asignado_en);

-- respuestas
CREATE INDEX ix_respuestas_solicitud_fecha ON respuestas (id_solicitud, creado_en);
CREATE INDEX ix_respuestas_id_usuario      ON respuestas (id_usuario);

-- historial_estados
CREATE INDEX ix_historial_solicitud_fecha ON historial_estados (id_solicitud, fecha_cambio);
CREATE INDEX ix_historial_id_usuario      ON historial_estados (id_usuario);

-- adjuntos
CREATE INDEX ix_adjuntos_id_solicitud ON adjuntos (id_solicitud);
CREATE INDEX ix_adjuntos_id_usuario   ON adjuntos (id_usuario);

-- notificaciones
CREATE INDEX ix_notificaciones_usuario_leida ON notificaciones (id_usuario, leida, creada_en DESC);
CREATE INDEX ix_notificaciones_id_solicitud  ON notificaciones (id_solicitud);

-- supervision_dependencia (el UNIQUE cubre id_supervisor)
CREATE INDEX ix_supervision_id_dependencia ON supervision_dependencia (id_dependencia);

-- auditoria
CREATE INDEX ix_auditoria_creado_en  ON auditoria (creado_en DESC);
CREATE INDEX ix_auditoria_id_usuario ON auditoria (id_usuario);
CREATE INDEX ix_auditoria_recurso    ON auditoria (recurso, id_recurso);

-- refresh_tokens (el UNIQUE cubre token_hash)
CREATE INDEX ix_refresh_tokens_id_usuario ON refresh_tokens (id_usuario);
CREATE INDEX ix_refresh_tokens_expira_en  ON refresh_tokens (expira_en);


-- =====================================================================
-- 4. FUNCIONES DE TRIGGER (reglas de integridad)
-- =====================================================================

-- Coherencia entre perfil y dependencia:
--   FUNCIONARIO  -> debe tener dependencia
--   ESTUDIANTE   -> no puede tener dependencia
CREATE OR REPLACE FUNCTION fn_usuarios_rol_dependencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT nombre INTO v_rol FROM roles WHERE id_rol = NEW.id_rol;

  IF v_rol = 'FUNCIONARIO' AND NEW.id_dependencia IS NULL THEN
    RAISE EXCEPTION 'Un usuario FUNCIONARIO debe pertenecer a una dependencia' USING ERRCODE = 'SG002';
  END IF;

  IF v_rol = 'ESTUDIANTE' AND NEW.id_dependencia IS NOT NULL THEN
    RAISE EXCEPTION 'Un usuario ESTUDIANTE no puede pertenecer a una dependencia' USING ERRCODE = 'SG002';
  END IF;

  RETURN NEW;
END;
$$;

-- Solo un usuario con perfil SUPERVISOR puede supervisar dependencias
CREATE OR REPLACE FUNCTION fn_supervision_validar_supervisor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT r.nombre INTO v_rol
    FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
   WHERE u.id_usuario = NEW.id_supervisor;

  -- Si el usuario no existe, la clave foránea reportará el error
  IF v_rol IS NOT NULL AND v_rol <> 'SUPERVISOR' THEN
    RAISE EXCEPTION 'Solo un usuario con perfil SUPERVISOR puede supervisar dependencias' USING ERRCODE = 'SG002';
  END IF;

  RETURN NEW;
END;
$$;

-- Reglas de la solicitud al insertar y al modificar:
--   INSERT: estado inicial REGISTRADA, propietario ESTUDIANTE activo, servicio activo.
--   UPDATE: estados finales inmutables, campos de identidad inmutables, transiciones válidas,
--           y los estados que exigen responsable requieren una asignación activa.
CREATE OR REPLACE FUNCTION fn_solicitudes_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol              TEXT;
  v_usuario_activo   BOOLEAN;
  v_servicio_activo  BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'REGISTRADA' THEN
      RAISE EXCEPTION 'Toda solicitud debe iniciar en estado REGISTRADA' USING ERRCODE = 'SG001';
    END IF;

    SELECT r.nombre, u.activo INTO v_rol, v_usuario_activo
      FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.id_usuario = NEW.id_estudiante;

    IF v_rol IS NOT NULL THEN
      IF v_rol <> 'ESTUDIANTE' THEN
        RAISE EXCEPTION 'El propietario de la solicitud debe tener perfil ESTUDIANTE' USING ERRCODE = 'SG002';
      END IF;
      IF NOT v_usuario_activo THEN
        RAISE EXCEPTION 'El estudiante propietario está inactivo' USING ERRCODE = 'SG002';
      END IF;
    END IF;

    SELECT activo INTO v_servicio_activo FROM servicios WHERE id_servicio = NEW.id_servicio;
    IF v_servicio_activo IS NOT NULL AND NOT v_servicio_activo THEN
      RAISE EXCEPTION 'La solicitud debe asociarse a un servicio activo' USING ERRCODE = 'SG002';
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.estado IN ('CERRADA', 'RECHAZADA') THEN
    RAISE EXCEPTION 'Una solicitud en estado % no puede modificarse', OLD.estado USING ERRCODE = 'SG001';
  END IF;

  IF (NEW.id_estudiante, NEW.id_servicio, NEW.codigo, NEW.fecha_registro)
     IS DISTINCT FROM (OLD.id_estudiante, OLD.id_servicio, OLD.codigo, OLD.fecha_registro) THEN
    RAISE EXCEPTION 'No se pueden modificar el propietario, el servicio, el código ni la fecha de registro'
      USING ERRCODE = 'SG002';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT fn_transicion_permitida(OLD.estado, NEW.estado) THEN
      RAISE EXCEPTION 'Transición de estado no permitida: % -> %', OLD.estado, NEW.estado USING ERRCODE = 'SG001';
    END IF;

    IF NEW.estado IN ('ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'REABIERTA')
       AND NOT EXISTS (
         SELECT 1 FROM asignaciones WHERE id_solicitud = NEW.id_solicitud AND activo
       ) THEN
      RAISE EXCEPTION 'El estado % requiere una asignación activa', NEW.estado USING ERRCODE = 'SG002';
    END IF;
  END IF;

  NEW.fecha_actualizacion := clock_timestamp();
  RETURN NEW;
END;
$$;

-- Reglas al crear una asignación:
--   funcionario activo, con perfil FUNCIONARIO y de la dependencia competente;
--   asignador activo, ADMINISTRADOR o SUPERVISOR que supervise esa dependencia;
--   la solicitud no puede estar en estado final.
CREATE OR REPLACE FUNCTION fn_asignaciones_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_func       TEXT;
  v_activo_func    BOOLEAN;
  v_dep_func       BIGINT;
  v_rol_asig       TEXT;
  v_activo_asig    BOOLEAN;
  v_dep_servicio   BIGINT;
  v_estado         TEXT;
BEGIN
  SELECT r.nombre, u.activo, u.id_dependencia INTO v_rol_func, v_activo_func, v_dep_func
    FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
   WHERE u.id_usuario = NEW.id_funcionario;

  SELECT r.nombre, u.activo INTO v_rol_asig, v_activo_asig
    FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
   WHERE u.id_usuario = NEW.id_asignador;

  SELECT s.id_dependencia, sol.estado INTO v_dep_servicio, v_estado
    FROM solicitudes sol JOIN servicios s ON s.id_servicio = sol.id_servicio
   WHERE sol.id_solicitud = NEW.id_solicitud;

  -- Si alguna referencia no existe, la clave foránea reportará el error correspondiente
  IF v_rol_func IS NULL OR v_rol_asig IS NULL OR v_dep_servicio IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_rol_func <> 'FUNCIONARIO' THEN
    RAISE EXCEPTION 'La solicitud solo puede asignarse a un usuario con perfil FUNCIONARIO' USING ERRCODE = 'SG002';
  END IF;

  IF NOT v_activo_func THEN
    RAISE EXCEPTION 'No se puede asignar a un funcionario inactivo' USING ERRCODE = 'SG002';
  END IF;

  IF v_dep_func IS DISTINCT FROM v_dep_servicio THEN
    RAISE EXCEPTION 'El funcionario no pertenece a la dependencia competente del servicio' USING ERRCODE = 'SG002';
  END IF;

  IF v_estado IN ('CERRADA', 'RECHAZADA') THEN
    RAISE EXCEPTION 'No se puede asignar una solicitud en estado %', v_estado USING ERRCODE = 'SG002';
  END IF;

  IF v_rol_asig NOT IN ('ADMINISTRADOR', 'SUPERVISOR') THEN
    RAISE EXCEPTION 'Solo un ADMINISTRADOR o un SUPERVISOR pueden asignar solicitudes' USING ERRCODE = 'SG002';
  END IF;

  IF NOT v_activo_asig THEN
    RAISE EXCEPTION 'El usuario que asigna está inactivo' USING ERRCODE = 'SG002';
  END IF;

  IF v_rol_asig = 'SUPERVISOR' AND NOT EXISTS (
       SELECT 1 FROM supervision_dependencia
        WHERE id_supervisor = NEW.id_asignador AND id_dependencia = v_dep_servicio
     ) THEN
    RAISE EXCEPTION 'El supervisor no supervisa la dependencia del servicio' USING ERRCODE = 'SG002';
  END IF;

  RETURN NEW;
END;
$$;

-- Una asignación solo puede finalizarse: nunca reactivarse ni cambiar de responsable.
-- Las asignaciones ya finalizadas son inmutables (conservan el registro anterior).
CREATE OR REPLACE FUNCTION fn_asignaciones_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.activo = FALSE THEN
    RAISE EXCEPTION 'Una asignación finalizada no puede modificarse' USING ERRCODE = 'SG002';
  END IF;

  IF (NEW.id_solicitud, NEW.id_funcionario, NEW.id_asignador, NEW.asignado_en)
     IS DISTINCT FROM (OLD.id_solicitud, OLD.id_funcionario, OLD.id_asignador, OLD.asignado_en) THEN
    RAISE EXCEPTION 'No se pueden modificar la solicitud, el funcionario, el asignador ni la fecha de una asignación'
      USING ERRCODE = 'SG002';
  END IF;

  RETURN NEW;
END;
$$;


-- =====================================================================
-- 5. TRIGGERS
-- =====================================================================

-- actualizado_en
CREATE TRIGGER trg_usuarios_actualizado_en
  BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();
CREATE TRIGGER trg_dependencias_actualizado_en
  BEFORE UPDATE ON dependencias FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();
CREATE TRIGGER trg_categorias_actualizado_en
  BEFORE UPDATE ON categorias FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();
CREATE TRIGGER trg_servicios_actualizado_en
  BEFORE UPDATE ON servicios FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Reglas de integridad
CREATE TRIGGER trg_usuarios_rol_dependencia
  BEFORE INSERT OR UPDATE OF id_rol, id_dependencia ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_usuarios_rol_dependencia();

CREATE TRIGGER trg_supervision_validar_supervisor
  BEFORE INSERT OR UPDATE OF id_supervisor ON supervision_dependencia
  FOR EACH ROW EXECUTE FUNCTION fn_supervision_validar_supervisor();

CREATE TRIGGER trg_solicitudes_before_write
  BEFORE INSERT OR UPDATE ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION fn_solicitudes_before_write();

CREATE TRIGGER trg_asignaciones_before_insert
  BEFORE INSERT ON asignaciones
  FOR EACH ROW EXECUTE FUNCTION fn_asignaciones_before_insert();

CREATE TRIGGER trg_asignaciones_before_update
  BEFORE UPDATE ON asignaciones
  FOR EACH ROW EXECUTE FUNCTION fn_asignaciones_before_update();

-- Inmutabilidad: las asignaciones nunca se borran (se finalizan)
CREATE TRIGGER trg_asignaciones_no_delete
  BEFORE DELETE ON asignaciones
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();
CREATE TRIGGER trg_asignaciones_no_truncate
  BEFORE TRUNCATE ON asignaciones
  FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

-- Inmutabilidad: historial de estados (solo inserción)
CREATE TRIGGER trg_historial_inmutable
  BEFORE UPDATE OR DELETE ON historial_estados
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();
CREATE TRIGGER trg_historial_no_truncate
  BEFORE TRUNCATE ON historial_estados
  FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

-- Inmutabilidad: auditoría (solo inserción)
CREATE TRIGGER trg_auditoria_inmutable
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();
CREATE TRIGGER trg_auditoria_no_truncate
  BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();


-- =====================================================================
-- 6. SEGURIDAD: RLS Y PRIVILEGIOS
-- Solo el backend (conexión directa con el rol dueño) accede a los datos.
-- Se activa RLS SIN políticas: los roles de la API pública de Supabase
-- (anon, authenticated) no pueden leer ni escribir nada.
-- No se usa FORCE ROW LEVEL SECURITY, para no bloquear al rol dueño (backend).
-- =====================================================================

ALTER TABLE roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependencias            ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios                ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias              ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios               ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_estados       ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjuntos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervision_dependencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria               ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens          ENABLE ROW LEVEL SECURITY;

-- Quita los privilegios que Supabase concede por defecto a los roles de la API pública.
-- En un PostgreSQL común (sin esos roles) este bloque no hace nada.
DO $$
DECLARE
  v_role   TEXT;
  v_objeto RECORD;
  v_tablas TEXT[] := ARRAY[
    'roles', 'dependencias', 'usuarios', 'categorias', 'servicios', 'solicitudes',
    'asignaciones', 'respuestas', 'historial_estados', 'adjuntos', 'notificaciones',
    'supervision_dependencia', 'auditoria', 'refresh_tokens'
  ];
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      FOR v_objeto IN SELECT unnest(v_tablas) AS tabla
      LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', v_objeto.tabla, v_role);
      END LOOP;

      -- Secuencias de las columnas serial de nuestras tablas + la del código de seguimiento
      FOR v_objeto IN
        SELECT DISTINCT s.oid::regclass AS secuencia
          FROM pg_class s
          JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
          JOIN pg_class t  ON t.oid = d.refobjid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE s.relkind = 'S' AND n.nspname = 'public' AND t.relname = ANY (v_tablas)
        UNION
        SELECT 'public.seq_codigo_solicitud'::regclass
      LOOP
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I', v_objeto.secuencia, v_role);
      END LOOP;

      FOR v_objeto IN
        SELECT p.oid::regprocedure AS funcion
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'fn\_%'
      LOOP
        -- En PostgreSQL toda función es ejecutable por PUBLIC por defecto: hay que quitarlo también
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_objeto.funcion);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_objeto.funcion, v_role);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
