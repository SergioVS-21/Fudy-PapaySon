from __future__ import annotations

import ctypes
import json
import os
import platform
import queue
import shutil
import socket
import subprocess
import sys
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path
from tkinter import BOTH, LEFT, RIGHT, StringVar, Tk, filedialog, messagebox, simpledialog, ttk
from typing import Any, Callable

import firebase_admin
from firebase_admin import credentials, firestore

APP_NAME = "PrinterBridge"
SUPPORTED_AREAS = ["COCINA", "GRILL", "BARRA", "PIZZERIA", "CAJA"]
SUPPORTED_RESTAURANTS = {
    "LA_PALMERA": "La Palmera",
    "LAGOS": "Lagos",
    "NEXT_RESTOBAR": "Next Restobar",
    "PAPA_Y_SON": "Papa y Son",
}
ACCESS_PROFILES = {
    "87tyui": {
        "id": "PAPA_Y_SON",
        "label": "Papa y Son",
        "restaurant_ids": ["PAPA_Y_SON"],
        "allowed_areas": ["COCINA", "GRILL", "BARRA", "CAJA"],
        "default_station_name": "Caja Papa y Son",
    },
    "90oiuty": {
        "id": "NEXT_RESTOBAR",
        "label": "Next Restobar",
        "restaurant_ids": ["NEXT_RESTOBAR"],
        "allowed_areas": ["COCINA", "BARRA", "PIZZERIA"],
        "default_station_name": "Caja Next",
    },
}
PENDING_STATUSES = {"PENDIENTE", "EN_PROCESO"}

try:
    if platform.system() == "Windows":
        import win32print  # type: ignore
    else:
        win32print = None
except ImportError:
    win32print = None


def app_support_dir() -> Path:
    system = platform.system()
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    if system == "Windows":
        return Path(os.environ.get("APPDATA", Path.home())) / APP_NAME
    return Path.home() / ".config" / APP_NAME


CONFIG_DIR = app_support_dir()
CONFIG_PATH = CONFIG_DIR / "config.json"
PRINTED_ITEMS_PATH = CONFIG_DIR / "printed_items.json"
DEFAULT_CREDENTIAL_FILE = "service-account.json"


def runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def resolve_credentials_path(configured_path: str) -> Path:
    candidates: list[Path] = []
    if configured_path:
        candidates.append(Path(configured_path).expanduser())

    candidates.extend([
        runtime_dir() / DEFAULT_CREDENTIAL_FILE,
        CONFIG_DIR / DEFAULT_CREDENTIAL_FILE,
    ])

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    raise RuntimeError(
        "No se encontro la credencial de Firestore. Selecciona un JSON valido o coloca service-account.json junto al ejecutable."
    )


@dataclass
class AppConfig:
    credentials_path: str = ""
    printer_name: str = ""
    handled_areas: list[str] = field(default_factory=lambda: ["COCINA"])
    restaurant_ids: list[str] = field(default_factory=list)
    auto_print_enabled: bool = True
    station_name: str = "Caja principal"


class ConfigStore:
    @staticmethod
    def load() -> AppConfig:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        if not CONFIG_PATH.exists():
            config = AppConfig()
            ConfigStore.save(config)
            return config
        payload = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return AppConfig(**payload)

    @staticmethod
    def save(config: AppConfig) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(asdict(config), indent=2, ensure_ascii=True), encoding="utf-8")


class PrintedRegistry:
    def __init__(self) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._printed = self._load()

    def _load(self) -> dict[str, str]:
        if not PRINTED_ITEMS_PATH.exists():
            return {}
        try:
            return json.loads(PRINTED_ITEMS_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def has(self, item_id: str) -> bool:
        if not item_id:
            return False
        with self._lock:
            if item_id in self._printed:
                return True
            self._printed.update(self._load())
            return item_id in self._printed

    def mark(self, item_id: str) -> None:
        if not item_id:
            return
        with self._lock:
            self._printed.update(self._load())
            self._printed[item_id] = datetime.now().isoformat()
            try:
                PRINTED_ITEMS_PATH.write_text(
                    json.dumps(self._printed, indent=2, ensure_ascii=True),
                    encoding="utf-8",
                )
            except Exception:
                pass


class PrinterService:
    @staticmethod
    def list_printers() -> list[str]:
        system = platform.system()
        if system == "Darwin" or system == "Linux":
            result = subprocess.run(["lpstat", "-a"], capture_output=True, text=True, check=False)
            if result.returncode != 0:
                return []
            printers = []
            for line in result.stdout.splitlines():
                if not line.strip():
                    continue
                printers.append(line.split()[0])
            return printers

        if system == "Windows":
            command = [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-Printer | Select-Object -ExpandProperty Name",
            ]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                return []
            return [line.strip() for line in result.stdout.splitlines() if line.strip()]

        return []

    @staticmethod
    def print_bytes(printer_name: str, payload: bytes) -> None:
        system = platform.system()
        if system == "Darwin" or system == "Linux":
            subprocess.run(["lpr", "-P", printer_name, "-o", "raw"], input=payload, check=True)
            return

        if system == "Windows":
            if not win32print:
                raise RuntimeError("En Windows se requiere pywin32 para impresion ESC/POS")

            printer_handle = win32print.OpenPrinter(printer_name)
            try:
                job = win32print.StartDocPrinter(printer_handle, 1, ("PrinterBridge", None, "RAW"))
                try:
                    del job
                    win32print.StartPagePrinter(printer_handle)
                    win32print.WritePrinter(printer_handle, payload)
                    win32print.EndPagePrinter(printer_handle)
                finally:
                    win32print.EndDocPrinter(printer_handle)
            finally:
                win32print.ClosePrinter(printer_handle)
            return

        raise RuntimeError("Sistema operativo no soportado para impresion")


class EscPos58Formatter:
    WIDTH = 32

    @classmethod
    def build_ticket(cls, order_id: str, table_label: str, items: list[dict[str, Any]]) -> bytes:
        body = bytearray()
        body.extend(b"\x1b@")
        body.extend(b"\x1ba\x01")
        body.extend(b"\x1bE\x01")
        body.extend(b"\x1d!\x11")
        body.extend(cls._encode("COMANDA\n"))
        body.extend(b"\x1d!\x00")
        body.extend(b"\x1bE\x00")
        body.extend(cls._encode("\n"))

        body.extend(b"\x1bE\x01")
        body.extend(b"\x1d!\x10")
        body.extend(cls._encode(f"#{order_id}\n"))
        body.extend(cls._encode(f"MESA {table_label}\n"))
        body.extend(b"\x1d!\x00")
        body.extend(b"\x1bE\x00")
        body.extend(cls._encode("\n"))

        body.extend(b"\x1ba\x00")
        body.extend(cls._encode("DESCRIPCION\n"))
        body.extend(cls._encode("-" * cls.WIDTH + "\n"))

        for item in items:
            description = f"{item.get('quantity', 1)}x {item.get('productName', 'Producto')}"
            for line in cls._wrap(description):
                body.extend(cls._encode(line + "\n"))
            note = (item.get("note") or "").strip()
            if note:
                for line in cls._wrap(f"  Nota: {note}"):
                    body.extend(cls._encode(line + "\n"))
            body.extend(cls._encode("\n"))

        body.extend(cls._encode("-" * cls.WIDTH + "\n"))
        body.extend(b"\x1ba\x01")
        body.extend(cls._encode(datetime.now().strftime("%d/%m/%Y %H:%M") + "\n"))
        body.extend(cls._encode("\n\n\n\n"))
        body.extend(b"\x1b@")
        return bytes(body)

    @classmethod
    def build_consumption_note(cls, job: dict[str, Any]) -> bytes:
        body = bytearray()
        body.extend(b"\x1b@")
        body.extend(b"\x1ba\x01")
        body.extend(b"\x1bE\x01")
        is_reprint = bool(job.get("isReprint") or job.get("reprint"))
        if is_reprint:
            body.extend(cls._encode("*** REIMPRESION ***\n"))
        body.extend(cls._encode("NOTA DE CONSUMO\n"))
        
        body.extend(b"\x1d!\x00")
        body.extend(b"\x1bE\x00")

        for local_label in job.get("localLabels", []):
            body.extend(cls._encode("NO FISCAL\n"))
            body.extend(cls._encode(f"{local_label}\n"))

        body.extend(cls._encode("\n"))
        order_ids = job.get("orderIds", [])
        for order_id in order_ids:
            body.extend(b"\x1bE\x01")
            body.extend(cls._encode(f"#{order_id}\n"))
            body.extend(b"\x1bE\x00")

        table_labels = ", ".join(job.get("tableLabels", [])) or "-"
        body.extend(cls._encode(f"MESA {table_labels}\n\n"))
        body.extend(b"\x1ba\x00")

        for line in cls._wrap(f"CLIENTE {job.get('clientName', 'Cliente')}"):
            body.extend(cls._encode(line + "\n"))
        for line in cls._wrap(f"CEDULA {job.get('clientDocumentId', 'No registrada')}"):
            body.extend(cls._encode(line + "\n"))
        for line in cls._wrap(datetime.now().strftime("FECHA %d/%m/%Y %H:%M")):
            body.extend(cls._encode(line + "\n"))

        body.extend(cls._encode("-" * cls.WIDTH + "\n"))
        body.extend(cls._encode("DESCRIPCION\n"))
        body.extend(cls._encode("-" * cls.WIDTH + "\n"))

        bcv_rate = cls._estimate_bcv_rate(job)

        for item in job.get("items", []):
            description = f"{item.get('quantity', 1)}x {item.get('productName', 'Producto')}"
            for line in cls._wrap(description):
                body.extend(cls._encode(line + "\n"))

            price_line = cls._amount_line(
                f"Bs {float(item.get('unitPrice', 0)) * bcv_rate:.2f} c/u",
                f"Bs {float(item.get('total', 0)) * bcv_rate:.2f}",
            )
            for line in price_line.split("\n"):
                body.extend(cls._encode(line + "\n"))

            note = (item.get("note") or "").strip()
            if note:
                for line in cls._wrap(f"  Nota: {note}"):
                    body.extend(cls._encode(line + "\n"))

            body.extend(cls._encode("\n"))

        body.extend(cls._encode("-" * cls.WIDTH + "\n"))
        body.extend(cls._encode("NO FISCAL\n"))
        body.extend(cls._encode(cls._amount_line("METODO", str(job.get("paymentMethod", "OTRO")).replace("_", " ")) + "\n"))
        reference = str(job.get("paymentReference", "No registrada"))
        for line in cls._wrap(f"REFERENCIA {reference}"):
            body.extend(cls._encode(line + "\n"))

        body.extend(cls._encode(cls._amount_line("SUBTOTAL", f"Bs {float(job.get('subtotalUsd', 0)) * bcv_rate:.2f}") + "\n"))

        tax_bs = float(job.get("taxBs", 0) or 0)
        if tax_bs > 0:
            body.extend(cls._encode(cls._amount_line("IVA (16%)", f"Bs {tax_bs:.2f}") + "\n"))

        body.extend(cls._encode(cls._amount_line("TOTAL", f"Bs {float(job.get('totalBs', 0)):.2f}") + "\n"))

        body.extend(cls._encode("-" * cls.WIDTH + "\n"))
        body.extend(cls._encode("NO FISCAL\n"))
        body.extend(b"\x1ba\x01")
        body.extend(cls._encode("Gracias por su compra\n"))
        body.extend(cls._encode("\n\n\n\n"))
        body.extend(b"\x1b@")
        return bytes(body)

    @classmethod
    def _center(cls, value: str) -> str:
        return value.center(cls.WIDTH)

    @classmethod
    def _wrap(cls, value: str) -> list[str]:
        text = value.strip()
        if len(text) <= cls.WIDTH:
            return [text]

        words = text.split()
        lines: list[str] = []
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if len(candidate) <= cls.WIDTH:
                current = candidate
                continue
            if current:
                lines.append(current)
            current = word
        if current:
            lines.append(current)
        return lines

    @classmethod
    def _amount_line(cls, label: str, value: str) -> str:
        clean_label = label.strip().upper()
        clean_value = value.strip()
        space = cls.WIDTH - len(clean_label) - len(clean_value)
        if space >= 1:
            return f"{clean_label}{' ' * space}{clean_value}"
        return f"{clean_label}\n{clean_value}"

    @classmethod
    def _estimate_bcv_rate(cls, job: dict[str, Any]) -> float:
        total_usd = float(job.get('totalUsd', 0) or 0)
        total_bs = float(job.get('totalBs', 0) or 0)
        if total_usd <= 0 or total_bs <= 0:
            return 1.0
        return total_bs / total_usd

    @staticmethod
    def _encode(value: str) -> bytes:
        return value.encode("cp850", errors="replace")


class FirestorePrintBridge:
    def __init__(self, config: AppConfig, registry: PrintedRegistry, logger: Callable[[str], None]) -> None:
        self.config = config
        self.registry = registry
        self.logger = logger
        self.client: firestore.Client | None = None
        self.unsubscribe_order_items = None
        self.unsubscribe_print_jobs = None
        self.start_time = datetime.now(timezone.utc) - timedelta(minutes=2)

    def connect(self) -> None:
        credentials_path = resolve_credentials_path(self.config.credentials_path)

        if not firebase_admin._apps:
            cred = credentials.Certificate(str(credentials_path))
            firebase_admin.initialize_app(cred)

        self.client = firestore.client()

    def start(self) -> None:
        self.connect()
        if not self.client:
            raise RuntimeError("No se pudo crear el cliente de Firestore")

        self.unsubscribe_order_items = self.client.collection("orderItems").on_snapshot(self._on_snapshot)
        self.unsubscribe_print_jobs = self.client.collection("printJobs").on_snapshot(self._on_print_jobs_snapshot)
        self.logger("Escucha iniciada sobre orderItems y printJobs")

    def stop(self) -> None:
        if self.unsubscribe_order_items:
            self.unsubscribe_order_items()
            self.unsubscribe_order_items = None
        if self.unsubscribe_print_jobs:
            self.unsubscribe_print_jobs()
            self.unsubscribe_print_jobs = None
        self.logger("Escucha detenida")

    def _on_snapshot(self, collection_snapshot: Any, changes: list[Any], read_time: Any) -> None:
        del collection_snapshot, read_time
        grouped: dict[str, list[dict[str, Any]]] = {}

        for change in changes:
            if change.type.name != "ADDED":
                continue

            payload = change.document.to_dict() or {}
            
            created_at = payload.get("createdAt")
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    if dt < self.start_time:
                        continue
                except ValueError:
                    pass

            item_id = payload.get("id") or change.document.id
            if self.registry.has(item_id):
                continue
            if not self._matches_config(payload):
                continue

            grouped.setdefault(payload["orderId"], []).append(payload)

        for order_id, items in grouped.items():
            pending_items = [it for it in items if not self.registry.has(it.get("id") or "")]
            if not pending_items:
                continue

            for item in pending_items:
                item_id = item.get("id") or ""
                if item_id:
                    self.registry.mark(item_id)

            try:
                ticket = self._build_ticket(order_id, pending_items)
                PrinterService.print_bytes(self.config.printer_name, ticket)
                areas = sorted({str(it.get("area", "")) for it in pending_items if it.get("area")})
                area_tag = f"[{', '.join(areas)}] " if areas else ""
                self.logger(f"{area_tag}Impresa comanda {order_id} con {len(pending_items)} items")
            except Exception as exc:  # noqa: BLE001
                self.logger(f"Error imprimiendo {order_id}: {exc}")

    def _on_print_jobs_snapshot(self, collection_snapshot: Any, changes: list[Any], read_time: Any) -> None:
        del collection_snapshot, read_time

        for change in changes:
            if change.type.name != "ADDED":
                continue

            payload = change.document.to_dict() or {}

            created_at = payload.get("createdAt")
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    if dt < self.start_time:
                        continue
                except ValueError:
                    pass

            job_id = payload.get("id") or change.document.id
            if self.registry.has(job_id):
                continue
            if not self._matches_print_job(payload):
                continue

            raw_order_ids = payload.get("orderIds") or []
            if not raw_order_ids and payload.get("orderId"):
                raw_order_ids = [payload.get("orderId")]
            order_ids = [str(oid).strip() for oid in raw_order_ids if str(oid).strip()]

            is_reprint = bool(payload.get("isReprint") or payload.get("reprint"))

            # REGLA: Nunca imprimir más de 1 nota de entrega por comanda a menos que sea reimpresión
            if not is_reprint and order_ids:
                already_printed = [oid for oid in order_ids if self.registry.has(f"order_delivery:{oid}")]
                if already_printed:
                    self.registry.mark(job_id)
                    area = payload.get("area") or "CAJA"
                    orders_label = ", ".join(order_ids)
                    self.logger(
                        f"[{area}] Omitida nota de entrega para comanda(s) #{orders_label}: "
                        f"ya fue impresa previamente (no es reimpresión)"
                    )
                    continue

            self.registry.mark(job_id)

            try:
                ticket = EscPos58Formatter.build_consumption_note(payload)
                PrinterService.print_bytes(self.config.printer_name, ticket)
                for oid in order_ids:
                    self.registry.mark(f"order_delivery:{oid}")

                area = payload.get("area") or "CAJA"
                reprint_tag = " [REIMPRESION]" if is_reprint else ""
                orders_label = f" (Comanda(s) #{', '.join(order_ids)})" if order_ids else ""
                self.logger(f"[{area}] Impresa nota de consumo {job_id}{reprint_tag}{orders_label}")
            except Exception as exc:  # noqa: BLE001
                self.logger(f"Error imprimiendo nota de consumo {job_id}: {exc}")

    def _matches_config(self, payload: dict[str, Any]) -> bool:
        area = payload.get("area")
        status = payload.get("status")
        restaurant_id = payload.get("restaurantId")

        if not area or area not in self.config.handled_areas:
            return False
        if status not in PENDING_STATUSES:
            return False
        if self.config.restaurant_ids and restaurant_id not in self.config.restaurant_ids:
            return False
        return True

    def _build_ticket(self, order_id: str, items: list[dict[str, Any]]) -> bytes:
        first = items[0]
        return EscPos58Formatter.build_ticket(
            order_id=order_id,
            table_label=str(first.get("tableNumber", "-")),
            items=items,
        )

    def _matches_print_job(self, payload: dict[str, Any]) -> bool:
        if payload.get("type") != "NOTA_CONSUMO":
            return False
        area = payload.get("area")
        if not area or area not in self.config.handled_areas:
            return False

        restaurant_ids = payload.get("restaurantIds") or []
        if self.config.restaurant_ids and not any(restaurant_id in self.config.restaurant_ids for restaurant_id in restaurant_ids):
            return False

        return True


class PrinterBridgeApp:
    def __init__(self) -> None:
        self.config = ConfigStore.load()
        self.registry = PrintedRegistry()
        self.events: queue.Queue[str] = queue.Queue()
        self.bridge: FirestorePrintBridge | None = None
        self.is_listening: bool = False

        self.root = Tk()
        self.root.withdraw()
        self.root.geometry("760x620")

        self.access_profile = self._request_access_profile()
        if not self.access_profile:
            self.root.destroy()
            raise SystemExit(0)

        self.root.title(f"{APP_NAME} · {self.access_profile['label']}")
        self.config = self._normalize_config_for_profile(self.config)

        self.credentials_var = StringVar(value=self.config.credentials_path)
        self.printer_var = StringVar(value=self.config.printer_name)
        self.station_var = StringVar(value=self.config.station_name)
        self.auto_print_var = StringVar(value="Si" if self.config.auto_print_enabled else "No")

        self.area_vars = {
            area: StringVar(value="1" if area in self.config.handled_areas else "0")
            for area in self.access_profile["allowed_areas"]
        }
        self.start_btn: ttk.Button | None = None
        self.stop_btn: ttk.Button | None = None
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._build_ui()
        self.root.deiconify()
        self.root.after(250, self._drain_events)

    def _request_access_profile(self) -> dict[str, Any] | None:
        while True:
            access_code = simpledialog.askstring(
                APP_NAME,
                "Ingresa la clave de acceso",
                parent=self.root,
                show="*",
            )

            if access_code is None:
                return None

            profile = ACCESS_PROFILES.get(access_code.strip())
            if profile:
                return profile

            messagebox.showerror(APP_NAME, "Clave invalida")

    def _normalize_config_for_profile(self, config: AppConfig) -> AppConfig:
        allowed_areas = self.access_profile["allowed_areas"]
        handled_areas = [area for area in config.handled_areas if area in allowed_areas]
        if not handled_areas and allowed_areas:
            handled_areas = [allowed_areas[0]]

        station_name = config.station_name.strip() or self.access_profile["default_station_name"]

        normalized = AppConfig(
          credentials_path=config.credentials_path,
          printer_name=config.printer_name,
          handled_areas=handled_areas,
          restaurant_ids=list(self.access_profile["restaurant_ids"]),
          auto_print_enabled=config.auto_print_enabled,
          station_name=station_name,
        )
        ConfigStore.save(normalized)
        return normalized

    def _build_ui(self) -> None:
        frame = ttk.Frame(self.root, padding=16)
        frame.pack(fill=BOTH, expand=True)

        ttk.Label(frame, text="Bridge de impresion automatica", font=("Helvetica", 16, "bold")).pack(anchor="w")
        ttk.Label(
            frame,
            text=f"Acceso activo: {self.access_profile['label']}",
            font=("Helvetica", 11, "bold"),
        ).pack(anchor="w", pady=(4, 0))

        credentials_row = ttk.Frame(frame)
        credentials_row.pack(fill="x", pady=(16, 8))
        ttk.Label(credentials_row, text="Credenciales Firebase").pack(anchor="w")
        ttk.Entry(credentials_row, textvariable=self.credentials_var).pack(side=LEFT, fill="x", expand=True)
        ttk.Button(credentials_row, text="Buscar", command=self._select_credentials).pack(side=RIGHT, padx=(8, 0))
        ttk.Button(credentials_row, text="Copiar local", command=self._install_local_credentials).pack(side=RIGHT, padx=(8, 0))
        ttk.Label(
            frame,
            text="Puedes seleccionar un JSON o dejar service-account.json junto al ejecutable.",
        ).pack(anchor="w")

        printer_row = ttk.Frame(frame)
        printer_row.pack(fill="x", pady=8)
        ttk.Label(printer_row, text="Impresora").pack(anchor="w")
        self.printer_combo = ttk.Combobox(printer_row, textvariable=self.printer_var, values=PrinterService.list_printers())
        self.printer_combo.pack(fill="x")

        station_row = ttk.Frame(frame)
        station_row.pack(fill="x", pady=8)
        ttk.Label(station_row, text="Nombre de la estacion").pack(anchor="w")
        ttk.Entry(station_row, textvariable=self.station_var).pack(fill="x")

        areas = ttk.LabelFrame(frame, text="Areas que imprimira este equipo")
        areas.pack(fill="x", pady=12)
        for area in self.access_profile["allowed_areas"]:
            ttk.Checkbutton(
                areas,
                text=area.title(),
                variable=self.area_vars[area],
                onvalue="1",
                offvalue="0",
            ).pack(anchor="w", padx=12, pady=4)

        restaurants = ttk.LabelFrame(frame, text="Restaurante habilitado")
        restaurants.pack(fill="x", pady=12)
        ttk.Label(
            restaurants,
            text=self.access_profile["label"],
        ).pack(anchor="w", padx=12, pady=(8, 4))

        buttons = ttk.Frame(frame)
        buttons.pack(fill="x", pady=(8, 12))
        ttk.Button(buttons, text="Guardar configuracion", command=self._save_config).pack(side=LEFT)
        ttk.Button(buttons, text="Refrescar impresoras", command=self._refresh_printers).pack(side=LEFT, padx=8)
        ttk.Button(buttons, text="Probar conexion", command=self._test_connection).pack(side=LEFT)
        self.start_btn = ttk.Button(buttons, text="Iniciar escucha", command=self._start_listener)
        self.start_btn.pack(side=LEFT, padx=8)
        self.stop_btn = ttk.Button(buttons, text="Detener", command=self._stop_listener, state="disabled")
        self.stop_btn.pack(side=LEFT)
        ttk.Button(buttons, text="Imprimir prueba", command=self._print_test).pack(side=LEFT, padx=8)

        ttk.Label(frame, text="Eventos").pack(anchor="w")
        self.log = ttk.Treeview(frame, columns=("message",), show="headings", height=14)
        self.log.heading("message", text="Mensaje")
        self.log.pack(fill=BOTH, expand=True)

    def _select_credentials(self) -> None:
        selected = filedialog.askopenfilename(filetypes=[("JSON", "*.json")])
        if selected:
            self.credentials_var.set(selected)

    def _install_local_credentials(self) -> None:
        source = self.credentials_var.get().strip()
        if not source:
            messagebox.showerror(APP_NAME, "Selecciona primero un archivo de credenciales")
            return
        source_path = Path(source).expanduser()
        if not source_path.exists():
            messagebox.showerror(APP_NAME, "El archivo de credenciales no existe")
            return

        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        target = CONFIG_DIR / DEFAULT_CREDENTIAL_FILE
        shutil.copy2(source_path, target)
        self.credentials_var.set(str(target))
        self._push_event(f"Credencial copiada a {target}")

    def _save_config(self) -> None:
        handled_areas = [area for area, value in self.area_vars.items() if value.get() == "1"]
        if not handled_areas:
            handled_areas = [self.access_profile["allowed_areas"][0]]
        self.config = AppConfig(
            credentials_path=self.credentials_var.get().strip(),
            printer_name=self.printer_var.get().strip(),
            handled_areas=handled_areas,
            restaurant_ids=list(self.access_profile["restaurant_ids"]),
            auto_print_enabled=True,
            station_name=self.station_var.get().strip() or self.access_profile["default_station_name"],
        )
        ConfigStore.save(self.config)
        self._push_event("Configuracion guardada")

    def _refresh_printers(self) -> None:
        self.printer_combo["values"] = PrinterService.list_printers()
        self._push_event("Listado de impresoras actualizado")

    def _on_close(self) -> None:
        if self.bridge:
            try:
                self.bridge.stop()
            except Exception:
                pass
            self.bridge = None
        self.root.destroy()

    def _set_listener_state(self, active: bool) -> None:
        if self.start_btn and self.stop_btn:
            if active:
                self.start_btn.configure(state="disabled")
                self.stop_btn.configure(state="normal")
            else:
                self.start_btn.configure(state="normal")
                self.stop_btn.configure(state="disabled")

    def _start_listener(self) -> None:
        if self.is_listening or self.bridge is not None:
            messagebox.showwarning(APP_NAME, "La escucha ya se encuentra iniciada en este equipo.")
            return

        self._set_listener_state(True)
        self._save_config()
        if not self.config.printer_name:
            self._set_listener_state(False)
            messagebox.showerror(APP_NAME, "Selecciona una impresora antes de iniciar")
            return

        try:
            self.bridge = FirestorePrintBridge(self.config, self.registry, self._push_event)
            self.bridge.start()
            self.is_listening = True
            areas_str = ", ".join(self.config.handled_areas)
            self._push_event(f"Listener iniciado (Áreas activas: {areas_str})")
        except Exception as exc:  # noqa: BLE001
            self.is_listening = False
            self._set_listener_state(False)
            messagebox.showerror(APP_NAME, str(exc))

    def _stop_listener(self) -> None:
        if self.bridge:
            try:
                self.bridge.stop()
            except Exception:
                pass
            self.bridge = None
        self.is_listening = False
        self._set_listener_state(False)
        self._push_event("Listener detenido")

    def _test_connection(self) -> None:
        self._save_config()
        try:
            bridge = FirestorePrintBridge(self.config, self.registry, self._push_event)
            bridge.connect()
            if not bridge.client:
                raise RuntimeError("No se pudo crear el cliente de Firestore")
            docs = list(bridge.client.collection("orders").limit(1).stream())
            self._push_event(f"Conexion OK con Firestore. Lectura de prueba: {len(docs)} documento(s)")
            messagebox.showinfo(APP_NAME, "Conexion a Firestore verificada correctamente")
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror(APP_NAME, f"No se pudo conectar a Firestore: {exc}")

    def _print_test(self) -> None:
        self._save_config()
        if not self.config.printer_name:
            messagebox.showerror(APP_NAME, "Selecciona una impresora antes de imprimir")
            return
        try:
            PrinterService.print_bytes(
                self.config.printer_name,
                EscPos58Formatter.build_ticket(
                    order_id="TEST-001",
                    table_label="12",
                    items=[
                        {"quantity": 2, "productName": "Hamburguesa clasica", "note": "Sin cebolla"},
                        {"quantity": 1, "productName": "Papas fritas"},
                    ],
                ),
            )
            self._push_event("Prueba enviada a impresora")
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror(APP_NAME, f"No se pudo imprimir: {exc}")

    def _push_event(self, message: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.events.put(f"[{timestamp}] {message}")

    def _drain_events(self) -> None:
        while not self.events.empty():
            message = self.events.get_nowait()
            self.log.insert("", 0, values=(message,))
        self.root.after(250, self._drain_events)

    def run(self) -> None:
        self.root.mainloop()


SINGLE_INSTANCE_PORT = 48529
_instance_socket: socket.socket | None = None
_instance_mutex_handle: Any = None


def ensure_single_instance() -> bool:
    global _instance_socket, _instance_mutex_handle

    if platform.system() == "Windows":
        try:
            kernel32 = ctypes.windll.kernel32
            mutex_name = "Global\\PrinterBridge_SingleInstance_Mutex_Fudy"
            handle = kernel32.CreateMutexW(None, True, mutex_name)
            last_error = kernel32.GetLastError()
            # 183 = ERROR_ALREADY_EXISTS
            if last_error == 183 or not handle:
                return False
            _instance_mutex_handle = handle
            return True
        except Exception:
            pass

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
        sock.listen(1)
        _instance_socket = sock
        return True
    except OSError:
        return False


def main() -> None:
    if not ensure_single_instance():
        temp_root = Tk()
        temp_root.withdraw()
        messagebox.showwarning(
            APP_NAME,
            "PrinterBridge ya se encuentra en ejecución en este equipo.\nNo se permite abrir múltiples instancias."
        )
        temp_root.destroy()
        sys.exit(0)

    app = PrinterBridgeApp()
    app.run()


if __name__ == "__main__":
    main()