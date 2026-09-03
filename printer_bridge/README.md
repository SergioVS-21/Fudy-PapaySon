# Printer Bridge

Aplicacion de escritorio en Python para escuchar nuevas comandas en Firestore e imprimir automaticamente los items que correspondan al area asignada a este equipo.

El formato de impresion usa ESC/POS para impresoras POS58.

## Que hace

- Escucha la coleccion `orderItems` en Firestore.
- Filtra solo items nuevos con `status` pendiente y `area` asignada al equipo.
- Agrupa los items por `orderId` y genera un ticket ESC/POS de 58 mm.
- Imprime el ticket en la impresora seleccionada del sistema.
- Guarda un registro local de items impresos para no duplicar tickets.

## Areas soportadas

- `COCINA`
- `BARRA`
- `PIZZERIA`
- `CAJA`

## Requisitos

- Python 3.11+
- macOS o Windows con impresora instalada
- Archivo de credenciales de servicio de Firebase/Google Cloud con acceso a Firestore
- En Windows, `pywin32` para envio RAW a la impresora

## Instalacion local

```bash
cd printer_bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m printer_bridge.app
```

## Empaquetar como app instalable

En macOS:

```bash
cd printer_bridge
./build_macos_app.sh
```

Esto genera la app en `dist/PrinterBridge.app`.

En Windows:

```bat
cd printer_bridge
build_windows.bat
```

Si quieres un instalador `.exe` clasico, en una PC Windows con Inno Setup instalado ejecuta el script `installer_windows.iss` despues del build.

El build de Windows debe ejecutarse en Windows. PyInstaller no genera un `.exe` de Windows desde macOS.

## Configuracion

La aplicacion guarda la configuracion en:

- macOS: `~/Library/Application Support/PrinterBridge/config.json`
- Windows: `%APPDATA%/PrinterBridge/config.json`

Campos principales:

- `credentials_path`: ruta al JSON de servicio
- `printer_name`: impresora destino
- `handled_areas`: areas que este equipo imprimira
- `restaurant_ids`: opcional, para limitar por restaurante
- `auto_print_enabled`: activa o desactiva la escucha automatica

## Credenciales Firestore

No se incluye una key real en este proyecto.

- La app acepta un JSON seleccionado manualmente.
- Tambien acepta un archivo llamado `service-account.json` junto al ejecutable.
- Tambien acepta `service-account.json` en la carpeta de configuracion local del sistema.

La guia de permisos y configuracion esta en `FIRESTORE_SETUP.md`.

## Flujo recomendado

1. Instalar la app en el equipo de Barra.
2. Configurar `handled_areas = ["BARRA"]` y seleccionar la impresora de Barra.
3. Instalar la app en el equipo de Cocina.
4. Configurar `handled_areas = ["COCINA"]` y seleccionar la impresora de Cocina.
5. Si un item nuevo entra en Firestore con area `BARRA`, solo lo imprimira el equipo de Barra.

## Formato del ticket

Cada ticket imprime:

- numero de comanda
- mesa
- descripcion de la orden

En modo cocina el encabezado sale mas grande para que el numero de comanda y la mesa se lean a distancia.

La descripcion se imprime una linea por producto, por ejemplo:

```text
2x Cafe Latte
1x Jugo de fresa
	Nota: Sin azucar
```

## Notas

- El sistema imprime por item nuevo detectado. Si una comanda trae productos de Barra y Cocina, cada equipo imprime solo su parte.
- Si quieres reimprimir, puedes usar el boton manual de prueba o borrar el registro local `printed_items.json`.
- En Windows el envio se hace en modo RAW para respetar ESC/POS; la impresora debe estar instalada en el sistema con su nombre visible.