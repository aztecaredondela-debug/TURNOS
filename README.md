# Turnos - Mantenimiento

Calendario de turnos para el equipo: cada persona ve su calendario, quién trabaja cada día, deja notas y pide o acepta cambios de turno en tiempo real.

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
- `app.js`: interfaz y Firebase.
- `database.rules.json`: reglas de seguridad.

## Modelo de datos
- `operarios/{id}`: nombre, ref (fecha), idx (posición en el ciclo), pinHash
- `notas/{fecha}/{id}`: texto
- `cambios/{fecha}/{id}`: turno resultante tras un cambio (`LC` = libre por cambio)
- `solicitudes/{id}`: fecha, solicitante, estado, ofertas

## Limitación conocida
El PIN evita entrar por error con el nombre de otro compañero, pero no es seguridad real: el hash es legible por quien tenga acceso a la base de datos. Si necesitáis protección fuerte, hay que pasar a correo/contraseña con Firebase Auth.
