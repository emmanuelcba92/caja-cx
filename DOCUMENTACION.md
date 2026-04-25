# Guía de Funcionamiento - Cirugías COAT 🩺

Este documento explica de manera detallada el funcionamiento de cada módulo de la aplicación **Cirugías COAT**, diseñada para la gestión administrativa y financiera de cirugías e ingresos diarios.

---

## 1. Módulo de Caja (Caja Diaria) 💰
Es el corazón de la aplicación. Aquí se registran los ingresos por cada cirugía realizada.

- **Carga de Datos**: Se ingresan los datos del paciente (Nombre, DNI, Obra Social).
- **Honorarios Médicos**: Permite asignar pagos hasta a 3 profesionales por cirugía.
  - El sistema calcula automáticamente el porcentaje para cada médico.
  - Soporta pagos en **Pesos (ARS)** y **Dólares (USD)**.
- **Anestesista**: Campo específico para registrar la liquidación del anestesiólogo.
- **Saldo COAT**: El sistema calcula automáticamente el resto que queda para la institución (COAT) después de restar los honorarios profesionales.
- **Cierre de Caja**: Al presionar "Cerrar Caja", los datos se guardan en el historial y se limpia el formulario para un nuevo día.

---

## 2. Módulo de Historial 📜
Permite auditar y revisar todos los registros guardados anteriormente.

- **Búsqueda por Fecha**: Se pueden filtrar los registros por día.
- **Seguridad (PIN)**: Para editar o eliminar un registro del historial, el sistema solicitará un **PIN de seguridad** (personalizable por cada usuario).
- **Resumen Diario**: Muestra los totales acumulados de ingresos en Pesos y Dólares del día seleccionado.

---

## 3. Módulo de Liquidaciones 📄
Diseñado para la rendición de cuentas a los profesionales al finalizar un periodo (mensual o quincenal).

- **Generación de Planillas**: Agrupa todas las cirugías de un mes específico para un profesional.
- **Gestión de Deducciones**: Permite agregar "extras" (ej. gastos de materiales) o "deducciones" (ej. pagos adelantados) con fecha y detalle.
- **Exportación**:
  - **Planilla General**: Vista resumida de todas las cirugías del mes.
  - **Recibo Individual**: Genera un documento PDF formal con el detalle de lo que el profesional debe percibir.
  - **Excel**: Permite descargar los datos para uso contable externo.

---

## 4. Módulo de Profesionales 👥
Es el catálogo maestro de los médicos que operan en la institución.

- **Alta y Baja**: Permite agregar nuevos profesionales o eliminar los que ya no están activos.
- **Categorías**: Se clasifican por especialidad o rol (ej. Anestesista).
- **Matriz de Liquidaciones**: Una vista avanzada que muestra el estado de las liquidaciones de todos los profesionales de un mes en una sola pantalla.

---

## 5. Módulo de Órdenes (Cirugías) 📋
Gestiona la documentación previa a la cirugía.

- **Órdenes de Internación**: Formulario para crear pedidos de cirugía.
- **Previsualización**: Genera una vista previa del documento tal cual se imprimirá.
- **Estado**: Permite dar seguimiento a las órdenes pendientes y realizadas.

---

## 6. Módulo de Notas 📝
Sistema de comunicación y recordatorios internos.

- **Recordatorios**: Tareas pendientes que aparecen en el panel principal.
- **Notas Compartidas**: Permite dejar mensajes para otros administradores o usuarios del sistema.
- **Notificaciones**: El icono de la campana indica si hay notas nuevas sin leer.

---

## 7. Módulo de Sistema (Administración) ⚙️
Control total de la aplicación.

- **Gestión de Accesos**: El administrador puede autorizar nuevos correos electrónicos para que ingresen al sistema.
- **Roles**:
  - **SuperAdmin**: Control total.
  - **Administrador**: Puede editar caja e historial.
  - **Viewer (Invitado)**: Solo puede ver los datos, sin permiso para editar o borrar.
- **Configuración de Seguridad**: Cada usuario puede cambiar su contraseña, su email y su **PIN de seguridad** desde el menú de usuario (icono con iniciales abajo a la izquierda).

---

## Tips de Rendimiento ⚡
- **Modo PC Antigua**: Si la aplicación se siente lenta (especialmente en equipos con Windows 7), activa el **"Modo PC Antigua"** en el menú de usuario. Esto desactivará efectos visuales pesados para que el sistema vuele.
- **Atajos**: Usa la tecla `Enter` para moverte rápido entre campos en el formulario de caja.

---
*Documentación generada el 25 de Abril, 2026.*
