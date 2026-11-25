-- =====================================================================
-- SGSSU - Datos iniciales ESENCIALES (seguros para producción)
-- Versión 1.0 (Fase 2)
--
-- Solo contiene los 4 perfiles del sistema. No incluye usuarios, contraseñas
-- ni datos ficticios. Es idempotente: se puede ejecutar varias veces.
--
-- Los usuarios y los datos de demostración se crean con un script aparte
-- (se agrega en una fase posterior), con contraseñas tomadas del entorno.
-- El catálogo de ejemplo (dependencias, categorías y servicios) está en
-- seed_catalogo_demo.sql y es OPCIONAL.
-- =====================================================================

INSERT INTO roles (nombre, descripcion) VALUES
  ('ADMINISTRADOR', 'Administra usuarios, categorías, servicios, dependencias y consulta la información global y la auditoría'),
  ('ESTUDIANTE',    'Registra solicitudes y consulta el estado y el historial de las propias'),
  ('FUNCIONARIO',   'Atiende las solicitudes que se le asignan dentro de su dependencia'),
  ('SUPERVISOR',    'Supervisa las dependencias a su cargo: asigna solicitudes, revisa tiempos e indicadores y genera reportes')
ON CONFLICT (nombre) DO UPDATE
  SET descripcion = EXCLUDED.descripcion;
