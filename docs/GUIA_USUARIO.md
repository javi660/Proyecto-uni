# Guía de usuario por perfil

Esta guía describe lo que ve y puede hacer cada perfil en SGSSU. Los nombres de botones y menús son los de la aplicación. Si algo que necesitas no aparece en tu menú, tu perfil no tiene ese permiso.

## 1. Para todos los perfiles

### Ingresar y salir
1. Abre la dirección del sistema y entra a **Iniciar sesión** con tu correo y contraseña.
2. Si el administrador te creó la cuenta o restableció tu contraseña, el sistema te lleva a **Cambiar contraseña** antes de dejarte usarlo.
3. Para salir usa el menú de usuario en la parte superior. La sesión también se cierra sola si queda inactiva (el acceso dura 15 minutos y se renueva mientras uses el sistema, hasta 7 días).

Si escribes mal los datos, el mensaje es el mismo para correo inexistente o contraseña incorrecta (por seguridad). Tras varios intentos fallidos seguidos desde la misma red, el acceso se bloquea unos minutos. Una cuenta desactivada no puede ingresar.

### Contraseña
Mínimo 10 caracteres, con al menos una minúscula, una mayúscula y un número. Cámbiala en **Mi perfil → Cambiar contraseña**. Si la olvidas, pide al administrador que la restablezca (no hay correo automático).

### Notificaciones
La campana de la barra superior muestra cuántas notificaciones no has leído y se actualiza cada 30 segundos. En **Notificaciones** puedes filtrar (todas, no leídas, leídas), abrir la solicitud relacionada (se marca como leída al pulsarla) y **Marcar todas como leídas**. No se envía correo: las avisos son solo dentro del sistema, y no recibes avisos de tus propias acciones.

### Inicio
La pantalla **Inicio** muestra tarjetas y un gráfico del mes en curso con las cifras que tu perfil puede ver.

### Estados de una solicitud

| Estado | Significa |
|---|---|
| REGISTRADA | Recién creada, sin responsable. |
| ASIGNADA | Tiene un funcionario responsable que aún no empieza. |
| EN_PROCESO | El funcionario la está atendiendo. |
| RESUELTA | El funcionario dio una solución; el estudiante debe cerrarla o reabrirla. |
| REABIERTA | El estudiante indicó que la solución no sirvió. |
| CERRADA | Finalizada (definitivo). |
| RECHAZADA | No procede (definitivo, con motivo). |

---

## 2. Estudiante

Ves y gestionas **solo tus propias solicitudes**. Menú: Inicio, Mis solicitudes, Nueva solicitud, Notificaciones, Mi perfil.

### Registrar una solicitud
1. **Nueva solicitud**.
2. Elige el **servicio** (solo aparecen los activos), escribe el **asunto** (hasta 180 caracteres) y la **descripción** (hasta 4000).
3. Adjunta archivos si hace falta: PDF, PNG, JPG o DOCX, de hasta 5 MB cada uno y máximo 3 por solicitud. Se revisa el contenido real del archivo, no solo la extensión.
4. **Registrar solicitud**. Recibirás un código de seguimiento (por ejemplo `SGSSU-2026-000089`) y una notificación.

### Seguir una solicitud
En **Mis solicitudes** busca por código, asunto o estado y abre el detalle. Allí ves el estado, el funcionario asignado, los adjuntos, las respuestas del personal y la **línea de tiempo**. Las notas internas del personal nunca se muestran; las acciones de supervisores y administradores aparecen como «Gestión de solicitudes».

Puedes añadir más adjuntos mientras la solicitud no esté CERRADA ni RECHAZADA (respetando el límite de 3).

### Cuando está RESUELTA
- **Cerrar solicitud**: la das por solucionada; es definitivo.
- **Reabrir**: debes escribir el motivo. La solicitud vuelve al funcionario y a los supervisores.

No hay plazo máximo para reabrir una solicitud resuelta.

---

## 3. Funcionario

Ves **las solicitudes que se te asignaron** (conservas el acceso tras el cierre y lo pierdes si se reasignan a otra persona). Menú: Inicio, Solicitudes, **Mis asignaciones**, Reportes, Notificaciones, Mi perfil.

### Atender una solicitud
1. Abre la solicitud desde **Mis asignaciones** (o desde la notificación «Tienes una nueva solicitud»).
2. **Iniciar atención** pasa de ASIGNADA (o REABIERTA) a EN_PROCESO y avisa al estudiante.
3. Registra **respuestas** con el formulario del detalle:
   - **Pública**: la ve el estudiante y se le notifica.
   - **Interna**: solo personal; no se notifica al estudiante.
4. Puedes subir adjuntos de evidencia (mismas reglas de tipo y tamaño).
5. **Marcar como resuelta**: exige al menos una respuesta **pública** publicada desde que iniciaste la atención (una interna o una de un ciclo anterior no cuenta). Si no la hay, el sistema lo indica.

Si el estudiante reabre la solicitud, vuelve a ti: usa **Iniciar atención** otra vez.

### Reportes
**Reportes** muestra solo tus cifras (solicitudes asignadas a ti): por estado, categoría, dependencia y período, con exportación a CSV.

---

## 4. Supervisor

Ves **las solicitudes de las dependencias que supervisas** (las define el administrador). Una solicitud de otra dependencia aparece como inexistente. Menú: Inicio, Solicitudes, Reportes, Notificaciones, Mi perfil.

### Asignar y reasignar
1. En **Solicitudes** usa el filtro rápido **Por asignar** para ver las REGISTRADAS.
2. Abre una solicitud y pulsa **Asignar** (o **Reasignar** si ya tiene responsable).
3. El cuadro lista solo los funcionarios activos de la dependencia del servicio, con su carga de trabajo actual. Elige uno y, si quieres, escribe una observación (hasta 500 caracteres).

Al asignar, la solicitud pasa a ASIGNADA y se notifica al estudiante y al funcionario. Reasignar una solicitud ASIGNADA o EN_PROCESO **no cambia su estado**: solo cambia el responsable (se notifica al estudiante, al nuevo y al anterior). Una solicitud RESUELTA no admite cambio de responsable; una CERRADA o RECHAZADA, tampoco.

### Rechazar, cerrar y priorizar
- **Rechazar**: solo solicitudes REGISTRADAS; el motivo es obligatorio y el estudiante lo verá.
- **Cerrar solicitud**: sobre solicitudes RESUELTAS de tu ámbito.
- **Prioridad**: puedes cambiarla en el detalle mientras la solicitud esté abierta.

Ves las respuestas internas del personal, pero no puedes crear respuestas (las crea el funcionario asignado).

### Reportes
Cifras y gráficos de tus dependencias, con filtros por fechas, dependencia y categoría, y **Exportar CSV**. Ver la sección 6.

---

## 5. Administrador

Tienes el alcance de los otros perfiles sobre **todas** las dependencias (asignar, reasignar, rechazar, cerrar, cambiar prioridad), salvo las acciones propias del funcionario (iniciar, responder, resolver) y del estudiante (registrar, reabrir). Además, el menú **Administración**:

### Usuarios
- **Nuevo usuario**: nombres, apellidos, correo, perfil y una **contraseña inicial** (que el usuario deberá cambiar al ingresar). Un funcionario necesita una dependencia activa.
- **Editar**, **Desactivar/Activar** y **Restablecer contraseña**. Desactivar o restablecer cierra todas las sesiones de esa persona.
- **Supervisión** (solo para el perfil Supervisor): marca las dependencias que supervisa. Se reemplaza el conjunto completo.

Reglas que el sistema impone: no puedes desactivarte ni cambiar tu propio perfil; siempre debe quedar un administrador activo; un funcionario con asignaciones activas no puede desactivarse ni cambiarse de perfil o dependencia; un supervisor con dependencias asignadas debe vaciar su lista antes de cambiar de perfil.

### Dependencias, categorías y servicios
- Se crean y editan; no se borran, solo se **desactivan**. Los nombres no se pueden repetir (sin distinguir mayúsculas).
- Un servicio pertenece a una **categoría** y a una **dependencia**, y tiene un **SLA** en horas (72 por defecto; de 1 a 8760) que se usa para medir retrasos.
- No se desactiva una dependencia con servicios o funcionarios activos, ni una categoría con servicios activos. Un servicio desactivado deja de aparecer para los estudiantes.

Orden recomendado para empezar: dependencias → categorías → servicios → usuarios (funcionarios y supervisores) → supervisión.

### Auditoría
**Auditoría** lista las operaciones sensibles (inicios de sesión y fallos, cambios de usuarios y catálogo, asignaciones, cambios de estado, adjuntos…). Filtra por operación, recurso, usuario, resultado y fechas; abre una fila para ver el detalle. Es solo lectura: nadie puede editar o borrar registros, y las claves con aspecto de credencial se muestran como `[oculto]`.

---

## 6. Reportes (administrador, supervisor y funcionario)

- **Período:** por defecto el mes en curso (en el reporte por período, los últimos 6 meses). Todas las fechas usan la hora de Bogotá. Cada reporte indica el período y el ámbito que está mostrando.
- **Filtros:** fechas, dependencia y categoría.
- **Qué mide:**
  - *Con retraso*: solicitud abierta cuyo tiempo desde el registro supera el SLA de su servicio.
  - *Tiempo de atención*: del registro al primer paso a EN_PROCESO.
  - *Tiempo de resolución*: del registro a la resolución.
  - *Cumplimiento del SLA*: porcentaje de solicitudes resueltas dentro de su SLA.
- Cada gráfico tiene una tabla equivalente con los mismos datos y un botón **Exportar CSV** (abre bien en Excel, en español y con tildes).
- El estudiante no tiene acceso a Reportes; su Inicio muestra sus propias cifras.

---

## 7. Preguntas frecuentes

**No encuentro una solicitud que debería ver.** Fuera de tu alcance el sistema la trata como inexistente. Verifica con tu supervisor o administrador que esté asignada a ti o pertenezca a tu dependencia.

**No me deja marcar como resuelta.** Falta una respuesta pública publicada desde que iniciaste la atención.

**Subí un archivo y lo rechazó.** Solo PDF, PNG, JPG y DOCX, máximo 5 MB y 3 por solicitud; el contenido debe coincidir con la extensión.

**¿Llegan correos?** No. Las notificaciones son solo dentro del sistema.

**Se cerró mi sesión.** Ocurre al desactivar tu cuenta, restablecer tu contraseña o tras 7 días sin renovar la sesión.
