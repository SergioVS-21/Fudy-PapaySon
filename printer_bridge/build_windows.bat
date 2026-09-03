@echo off
setlocal

cd /d "%~dp0"

if not exist .venv (
  py -3 -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

if exist service-account.json (
  echo Se encontro service-account.json y quedara junto al ejecutable para la prueba.
) else (
  echo No se encontro service-account.json en la carpeta del proyecto.
  echo Copia ahi tu key de servicio de Firestore antes de distribuir el build.
)

pyinstaller ^
  --noconfirm ^
  --windowed ^
  --name PrinterBridge ^
  --paths src ^
  --add-data "FIRESTORE_SETUP.md;." ^
  --add-data "service-account.template.json;." ^
  src\printer_bridge\app.py

echo.
echo Ejecutable generado en dist\PrinterBridge\ o dist\PrinterBridge.exe segun configuracion de PyInstaller.
endlocal