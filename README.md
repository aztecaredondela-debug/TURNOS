[README.md](https://github.com/user-attachments/files/34367270/README.md)
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
- `festivos.js`: festivos de 2026 con los que arranca la app. A partir de ahí se gestionan desde la pestaña **Festivos** (solo administrador).
- `app.js`: interfaz y Firebase.
- `database.rules.json`: reglas de seguridad.
- `manifest.json`, `icon-*.png`, `apple-touch-icon.png`: nombre e icono al añadir la web a la pantalla de inicio.

## Modelo de datos
- `operarios/{id}`: nombre, grupo (`electromecanicos`, `electromedicina`, `oficios`; sin grupo = electromecánicos), tipo (turno; sin tipo = rotativo), ref (fecha), idx (posición en su ciclo), pinHash. Grupos y turnos se definen en `GRUPOS` y `TIPOS_TURNO` de `ciclo.js`. Los cambios de turno solo son posibles dentro del mismo grupo.
- `notas/{fecha}/{id}`: texto
- `cambios/{fecha}/{id}`: turno resultante tras un cambio (`LC` = libre por cambio)
- `ausencias/{fecha}/{id}`: código del tipo de ausencia (`V` vacaciones, `B` baja, `LD` libre disposición, `FA` familiar, `MA` maternidad/paternidad, `OT` otros). Los tipos se definen en `TIPOS_AUS` de `ciclo.js`
- `festivos/{fecha}`: texto del festivo (`F`, `F(SAB)`...)
- `chat/{id}`: autor, texto, t (hora en milisegundos)
- `solicitudes/{id}`: fecha, solicitante, estado, ofertas
- `operarios/{id}/admin`: `true` solo se puede poner a mano desde la consola de Firebase; da acceso a la pestaña Equipo

## Si algo falla
Abajo de la pantalla aparece un aviso rojo con el motivo. Casi siempre es una de estas:
- Reglas sin publicar en Firebase (Realtime Database > Reglas).
- Acceso Anónimo sin activar (Authentication > Método de acceso).
- Navegador con versión antigua: recarga con Ctrl+F5 y comprueba que abajo pone la última "Versión".

## Código de equipo (acceso)
Nadie puede leer ni escribir datos si no ha introducido el código del equipo, que se guarda en la base de datos en el nodo `codigo` (se crea a mano desde la consola de Firebase y no está en el repositorio).
- Cada móvil lo escribe una sola vez.
- Si alguien deja el equipo: en la consola, borra el nodo `miembros` y cambia el valor de `codigo`. Todos tendrán que escribir el código nuevo.
- Usa un código largo (12 caracteres o más) con letras y números; no solo cifras.

## Limitación conocida
El PIN evita entrar por error con el nombre de otro compañero, pero no es seguridad real: el hash es legible por quien tenga acceso a la base de datos. Si necesitáis protección fuerte, hay que pasar a correo/contraseña con Firebase Auth.
