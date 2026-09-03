# Firestore Setup

Este programa no incluye una key real de servicio. Para conectarlo a Firestore en otra PC debes crear una cuenta de servicio en Google Cloud y descargar su JSON.

## Permisos minimos recomendados

La cuenta de servicio debe tener acceso de lectura a Firestore.

- Rol recomendado: `Cloud Datastore User`
- Si vas a administrar indices o configuraciones desde esa cuenta, usa un rol mas amplio solo si es necesario.

## Archivos esperados

El ejecutable buscara la credencial en este orden:

1. Ruta seleccionada manualmente en la interfaz.
2. `service-account.json` junto al ejecutable.
3. `service-account.json` en `%APPDATA%\PrinterBridge\`.

## Pasos

1. En Google Cloud Console abre `IAM y Administracion > Cuentas de servicio`.
2. Crea una cuenta de servicio para el bridge de impresion.
3. Asignale el rol `Cloud Datastore User`.
4. Genera una clave JSON.
5. Renombra el archivo a `service-account.json`.
6. Colocalo junto al ejecutable instalado o cargalo desde la app y usa el boton `Copiar local`.

## Seguridad

- No compartas esta key por chat o correo sin cifrado.
- No la subas al repositorio.
- Si una PC se pierde, revoca la key desde Google Cloud y genera otra.