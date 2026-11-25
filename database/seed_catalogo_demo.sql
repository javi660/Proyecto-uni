-- =====================================================================
-- SGSSU - Catálogo de EJEMPLO (opcional, solo para demostración)
-- Versión 1.0 (Fase 2)
--
-- Dependencias, categorías y servicios ficticios para poder probar el sistema.
-- NO usar en un entorno de producción real: allí el administrador crea el catálogo
-- desde la aplicación. Es idempotente (ON CONFLICT DO NOTHING).
--
-- Uso:  cd backend && npm run db:apply -- --demo-catalog
-- =====================================================================

INSERT INTO dependencias (nombre, descripcion) VALUES
  ('Admisiones y Registro Académico', 'Gestiona certificados, constancias, homologaciones y el registro académico de los estudiantes'),
  ('Bienestar Universitario',         'Gestiona apoyos socioeconómicos y actividades de bienestar, deporte y cultura'),
  ('Tesorería y Cartera',             'Gestiona pagos, paz y salvos financieros y financiación de matrícula')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO categorias (nombre, descripcion) VALUES
  ('Académico',     'Trámites relacionados con la vida académica del estudiante'),
  ('Financiero',    'Trámites relacionados con pagos, cartera y financiación'),
  ('Bienestar',     'Apoyos y actividades de bienestar universitario')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO servicios (nombre, descripcion, id_categoria, id_dependencia, sla_horas)
SELECT v.nombre, v.descripcion, c.id_categoria, d.id_dependencia, v.sla_horas
  FROM (VALUES
    ('Certificado de notas',                'Solicitud de certificado de calificaciones',                 'Académico',  'Admisiones y Registro Académico', 72),
    ('Constancia de estudios',              'Solicitud de constancia de matrícula vigente',               'Académico',  'Admisiones y Registro Académico', 48),
    ('Homologación de asignaturas',         'Solicitud de homologación de materias cursadas',             'Académico',  'Admisiones y Registro Académico', 120),
    ('Paz y salvo financiero',              'Solicitud de paz y salvo por todo concepto',                 'Financiero', 'Tesorería y Cartera',             72),
    ('Financiación de matrícula',           'Solicitud de plan de pagos o financiación de matrícula',     'Financiero', 'Tesorería y Cartera',             120),
    ('Certificado de pagos',                'Solicitud de certificado de pagos realizados',               'Financiero', 'Tesorería y Cartera',             48),
    ('Apoyo socioeconómico',                'Solicitud de apoyo socioeconómico para estudiantes',         'Bienestar',  'Bienestar Universitario',         120),
    ('Inscripción a actividades deportivas y culturales', 'Inscripción a grupos y actividades de bienestar', 'Bienestar', 'Bienestar Universitario',        72)
  ) AS v (nombre, descripcion, categoria, dependencia, sla_horas)
  JOIN categorias   c ON c.nombre = v.categoria
  JOIN dependencias d ON d.nombre = v.dependencia
ON CONFLICT (id_categoria, nombre) DO NOTHING;
