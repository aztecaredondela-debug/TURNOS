[README.md](https://github.com/user-attachments/files/34101610/README.md)
# Turnos - Mantenimiento

Calendario de turnos para el equipo (con festivos y días de convenio): cada persona ve su calendario, quién trabaja cada día, deja notas y pide o acepta cambios de turno en tiempo real.

Web estática (GitHub Pages) + Firebase Realtime Database.

## Puesta en marcha
1. Crea un proyecto en Firebase y una **Realtime Database**.
2. En **Authentication > Sign-in method** activa **Anónimo**.
3. Copia el contenido de `database.rules.json` en **Realtime Database > Reglas** y publícalo.
4. Registra una app web y pega su configuración en `firebase-config.js`.
5. Sube el repositorio y activa **Settings > Pages** (rama `main`, carpeta raíz).
6. En Authentication > Settings > Dominios autorizados, añade `TU_USUARIO.github.io`.

## Estructura
- `ciclo.js`: ciclo de 70 días y cálculo del turno (sin dependencias).
- `festivos.js`: festivos y días de convenio ("sen actividade programada") del año. Hay que cargar la lista nueva cada año.
- `app.js`: interfaz y Firebase.
- `database.rules.json`: reglas de seguridad.

## Modelo de datos
- `operarios/{id}`: nombre, ref (fecha), idx (posición en el ciclo), pinHash, fijo (opcional: `M` o `T` = mañana/tarde fijo de lunes a viernes; `S` = semanas alternas mañana/tarde de lunes a viernes, con `ref` = un día de una semana e `idx` 0 = esa semana de mañana, 1 = de tarde; libran fines de semana y festivos)
- `notas/{fecha}/{id}`: texto
- `cambios/{fecha}/{id}`: turno resultante tras un cambio (`LC` = libre por cambio)
- `ausencias/{fecha}/{id}`: código del tipo de ausencia (`V` vacaciones, `B` baja, `LD` libre disposición, `VA`/`LA` vacaciones y libre disposición del año anterior (días pendientes que se disfrutan este año), `FA` familiar, `MA` maternidad/paternidad, `OT` otros). Los tipos se definen en `TIPOS_AUS` de `ciclo.js`
- `chat/{id}`: autor, texto, t (hora en milisegundos)
- `solicitudes/{id}`: fecha, solicitante, estado, ofertas
- `operarios/{id}/admin`: `true` solo se puede poner a mano desde la consola de Firebase; da acceso a la pestaña Equipo

## Si algo falla
Abajo de la pantalla aparece un aviso rojo con el motivo. Casi siempre es una de estas:
- Reglas sin publicar en Firebase (Realtime Database > Reglas).
- Acceso Anónimo sin activar (Authentication > Método de acceso).
- Navegador con versión antigua: recarga con Ctrl+F5 y comprueba que abajo pone la última "Versión".

## Limitación conocida
El PIN evita entrar por error con el nombre de otro compañero, pero no es seguridad real: el hash es legible por quien tenga acceso a la base de datos. Si necesitáis protección fuerte, hay que pasar a correo/contraseña con Firebase Auth.
