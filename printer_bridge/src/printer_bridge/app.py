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
import tkinter as tk
from tkinter import BOTH, END, LEFT, RIGHT, BooleanVar, StringVar, Tk, filedialog, messagebox, simpledialog, ttk
from typing import Any, Callable

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import Client as FirestoreClient

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
    def __init__(
        self,
        config: AppConfig,
        registry: PrintedRegistry,
        logger: Callable[[str, str], None],
    ) -> None:
        self.config = config
        self.registry = registry
        self.logger = logger
        self.client: FirestoreClient | None = None
        self.unsubscribe_order_items = None
        self.unsubscribe_print_jobs = None
        self.start_time = datetime.now(timezone.utc) - timedelta(minutes=2)

    def connect(self) -> None:
        self.logger("Buscando archivo de credenciales de Firebase...", "INFO")
        credentials_path = resolve_credentials_path(self.config.credentials_path)
        self.logger(f"Credencial encontrada en: {credentials_path}", "INFO")

        if not firebase_admin._apps:
            cred = credentials.Certificate(str(credentials_path))
            firebase_admin.initialize_app(cred)
            self.logger("Firebase Admin SDK inicializado correctamente", "INFO")
        else:
            self.logger("Sesión existente de Firebase Admin reutilizada", "INFO")

        self.client = firestore.client()
        self.logger("Cliente de Firestore conectado con éxito", "INFO")

    def start(self) -> None:
        self.connect()
        if not self.client:
            raise RuntimeError("No se pudo crear el cliente de Firestore")

        areas_str = ", ".join(self.config.handled_areas)
        self.logger(f"Iniciando escucha en tiempo real de Firestore (Áreas asignadas: {areas_str})...", "INFO")
        self.unsubscribe_order_items = self.client.collection("orderItems").on_snapshot(self._on_snapshot)
        self.unsubscribe_print_jobs = self.client.collection("printJobs").on_snapshot(self._on_print_jobs_snapshot)
        self.logger("✓ Escucha activa: Esperando nuevas comandas y notas de consumo", "INFO")

    def stop(self) -> None:
        if self.unsubscribe_order_items:
            try:
                if hasattr(self.unsubscribe_order_items, "unsubscribe"):
                    self.unsubscribe_order_items.unsubscribe()
                elif callable(self.unsubscribe_order_items):
                    self.unsubscribe_order_items()
            except Exception:
                pass
            self.unsubscribe_order_items = None
        if self.unsubscribe_print_jobs:
            try:
                if hasattr(self.unsubscribe_print_jobs, "unsubscribe"):
                    self.unsubscribe_print_jobs.unsubscribe()
                elif callable(self.unsubscribe_print_jobs):
                    self.unsubscribe_print_jobs()
            except Exception:
                pass
            self.unsubscribe_print_jobs = None
        self.logger("Escucha detenida. No se procesarán nuevas órdenes hasta reiniciar.", "WARN")

    def _on_snapshot(self, collection_snapshot: Any, changes: list[Any], read_time: Any) -> None:
        del collection_snapshot, read_time
        if not changes:
            return

        self.logger(f"Firestore 'orderItems': {len(changes)} cambio(s) detectado(s)", "INFO")
        grouped: dict[str, list[dict[str, Any]]] = {}

        for change in changes:
            doc_id = change.document.id
            change_type = change.type.name
            payload = change.document.to_dict() or {}

            product_name = payload.get("productName", "Producto sin nombre")
            qty = payload.get("quantity", 1)
            area = payload.get("area", "SIN_AREA")
            status = payload.get("status", "SIN_ESTADO")
            table = payload.get("tableNumber", "-")
            order_id = payload.get("orderId", "SIN_ORDEN")
            restaurant_id = payload.get("restaurantId", "GLOBAL")

            if change_type != "ADDED":
                self.logger(f"Item #{doc_id} cambio='{change_type}' ignorado (solo se procesan 'ADDED')", "SKIP")
                continue

            self.logger(
                f"Leído orderItem #{doc_id} | Orden #{order_id} | Mesa {table} | {qty}x {product_name} | Área: {area} | Estado: {status} | Rest: {restaurant_id}",
                "READ",
            )

            created_at = payload.get("createdAt")
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    if dt < self.start_time:
                        self.logger(f"  -> Descartado #{doc_id}: Creado antes de iniciar el bridge ({created_at})", "SKIP")
                        continue
                except ValueError:
                    pass

            item_id = payload.get("id") or doc_id
            if self.registry.has(item_id):
                self.logger(f"  -> Descartado #{doc_id}: Ya fue impreso anteriormente", "SKIP")
                continue

            reason = self._check_matches_config(payload)
            if reason != "OK":
                self.logger(f"  -> Descartado #{doc_id}: {reason}", "SKIP")
                continue

            self.logger(f"  -> Aceptado #{doc_id} para imprimir en área {area} (Orden #{order_id})", "MATCH")
            grouped.setdefault(order_id, []).append(payload)

        for order_id, items in grouped.items():
            pending_items = [it for it in items if not self.registry.has(it.get("id") or "")]
            if not pending_items:
                continue

            for item in pending_items:
                item_id = item.get("id") or ""
                if item_id:
                    self.registry.mark(item_id)

            first = pending_items[0]
            table_label = str(first.get("tableNumber", "-"))
            try:
                ticket = self._build_ticket(order_id, pending_items)
                PrinterService.print_bytes(self.config.printer_name, ticket)
                areas = sorted({str(it.get("area", "")) for it in pending_items if it.get("area")})
                area_tag = f"[{', '.join(areas)}] " if areas else ""
                self.logger(f"{area_tag}✓ IMPRESA comanda #{order_id} | Mesa {table_label} | {len(pending_items)} item(s)", "PRINT")
            except Exception as exc:  # noqa: BLE001
                self.logger(f"✗ ERROR imprimiendo comanda #{order_id}: {exc}", "ERROR")

    def _on_print_jobs_snapshot(self, collection_snapshot: Any, changes: list[Any], read_time: Any) -> None:
        del collection_snapshot, read_time
        if not changes:
            return

        self.logger(f"Firestore 'printJobs': {len(changes)} cambio(s) detectado(s)", "INFO")

        for change in changes:
            doc_id = change.document.id
            change_type = change.type.name
            payload = change.document.to_dict() or {}

            if change_type != "ADDED":
                continue

            job_type = payload.get("type", "DESCONOCIDO")
            area = payload.get("area", "SIN_AREA")
            client = payload.get("clientName", "Cliente")
            total_bs = payload.get("totalBs", 0)

            self.logger(
                f"Leído printJob #{doc_id} | Tipo: {job_type} | Área: {area} | Cliente: {client} | Total: Bs {total_bs}",
                "READ",
            )

            created_at = payload.get("createdAt")
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    if dt < self.start_time:
                        self.logger(f"  -> Descartado printJob #{doc_id}: Creado antes de iniciar ({created_at})", "SKIP")
                        continue
                except ValueError:
                    pass

            job_id = payload.get("id") or doc_id
            if self.registry.has(job_id):
                self.logger(f"  -> Descartado printJob #{doc_id}: Ya fue impreso previamente", "SKIP")
                continue

            reason = self._check_matches_print_job(payload)
            if reason != "OK":
                self.logger(f"  -> Descartado printJob #{doc_id}: {reason}", "SKIP")
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
                self.logger(f"Cargando Nota de Consumo #{job_id}...", "MATCH")
                ticket = EscPos58Formatter.build_consumption_note(payload)
                self.logger(f"Enviando Nota de Consumo #{job_id} a '{self.config.printer_name}'...", "INFO")
                PrinterService.print_bytes(self.config.printer_name, ticket)
                for oid in order_ids:
                    self.registry.mark(f"order_delivery:{oid}")

                self.registry.mark(job_id)
                area = payload.get("area") or "CAJA"
                reprint_tag = " [REIMPRESION]" if is_reprint else ""
                orders_label = f" (Comanda(s) #{', '.join(order_ids)})" if order_ids else ""
                self.logger(f"[{area}] ✓ IMPRESA Nota de Consumo #{job_id}{reprint_tag}{orders_label} | Cliente: {client}", "PRINT")
            except Exception as exc:  # noqa: BLE001
                self.logger(f"✗ ERROR imprimiendo Nota de Consumo #{job_id}: {exc}", "ERROR")

    def _check_matches_config(self, payload: dict[str, Any]) -> str:
        area = payload.get("area")
        status = payload.get("status")
        restaurant_id = payload.get("restaurantId")

        if not area or area not in self.config.handled_areas:
            return f"Área '{area}' no asignada a este equipo (Configuradas: {', '.join(self.config.handled_areas)})"
        if status not in PENDING_STATUSES:
            return f"Estado '{status}' no es pendiente ({', '.join(PENDING_STATUSES)})"
        if self.config.restaurant_ids and restaurant_id not in self.config.restaurant_ids:
            return f"Restaurante '{restaurant_id}' no coincide con el perfil ({', '.join(self.config.restaurant_ids)})"
        return "OK"

    def _matches_config(self, payload: dict[str, Any]) -> bool:
        return self._check_matches_config(payload) == "OK"

    def _build_ticket(self, order_id: str, items: list[dict[str, Any]]) -> bytes:
        first = items[0]
        return EscPos58Formatter.build_ticket(
            order_id=order_id,
            table_label=str(first.get("tableNumber", "-")),
            items=items,
        )

    def _check_matches_print_job(self, payload: dict[str, Any]) -> str:
        if payload.get("type") != "NOTA_CONSUMO":
            return f"Tipo '{payload.get('type')}' no es NOTA_CONSUMO"
        area = payload.get("area")
        if not area or area not in self.config.handled_areas:
            return f"Área '{area}' no asignada a este equipo ({', '.join(self.config.handled_areas)})"

        restaurant_ids = payload.get("restaurantIds") or []
        if self.config.restaurant_ids and not any(r in self.config.restaurant_ids for r in restaurant_ids):
            return f"Restaurantes de nota ({restaurant_ids}) no coinciden con ({self.config.restaurant_ids})"

        return "OK"

    def _matches_print_job(self, payload: dict[str, Any]) -> bool:
        return self._check_matches_print_job(payload) == "OK"


class PrinterBridgeApp:
    def __init__(self) -> None:
        self.config = ConfigStore.load()
        self.registry = PrintedRegistry()
        self.events: queue.Queue[tuple[str, str, str]] = queue.Queue()
        self.bridge: FirestorePrintBridge | None = None
        self.is_listening: bool = False

        self.root = Tk()
        self.root.withdraw()
        self.root.geometry("860x740")
        self.root.minsize(780, 600)

        profile = self._request_access_profile()
        if not profile:
            self.root.destroy()
            raise SystemExit(0)
        self.access_profile: dict[str, Any] = profile

        self.root.title(f"{APP_NAME} · {self.access_profile['label']}")
        self.config = self._normalize_config_for_profile(self.config)

        self.credentials_var = StringVar(value=self.config.credentials_path)
        self.printer_var = StringVar(value=self.config.printer_name)
        self.station_var = StringVar(value=self.config.station_name)
        self.auto_scroll_var = BooleanVar(value=True)
        self.status_var = StringVar(value="● Listener: DETENIDO")

        self.area_vars = {
            area: StringVar(value="1" if area in self.config.handled_areas else "0")
            for area in self.access_profile["allowed_areas"]
        }
        self.start_btn: ttk.Button | None = None
        self.stop_btn: ttk.Button | None = None
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._build_ui()
        self._setup_log_styles()
        self.root.deiconify()

        self._push_event(f"Iniciando {APP_NAME} para perfil: {self.access_profile['label']}", "INFO")
        self._push_event(
            f"Configuración activa: Estación='{self.config.station_name}', Áreas=[{', '.join(self.config.handled_areas)}], Impresora='{self.config.printer_name or 'Ninguna'}'",
            "INFO",
        )

        self.root.after(150, self._drain_events)

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

            messagebox.showerror(APP_NAME, "Clave inválida")

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
        main_container = ttk.Frame(self.root, padding=12)
        main_container.pack(fill=BOTH, expand=True)

        # Header
        header_frame = ttk.Frame(main_container)
        header_frame.pack(fill="x", pady=(0, 8))

        title_lbl = ttk.Label(header_frame, text="Bridge de Impresión Automática", font=("Helvetica", 15, "bold"))
        title_lbl.pack(side=LEFT)

        self.status_lbl = ttk.Label(header_frame, textvariable=self.status_var, font=("Helvetica", 10, "bold"), foreground="#dc2626")
        self.status_lbl.pack(side=RIGHT, padx=4)

        sub_lbl = ttk.Label(
            main_container,
            text=f"Perfil activo: {self.access_profile['label']}  |  Restaurantes: {', '.join(self.access_profile['restaurant_ids'])}",
            font=("Helvetica", 9),
        )
        sub_lbl.pack(anchor="w", pady=(0, 8))

        # Config Settings Box
        config_frame = ttk.LabelFrame(main_container, text="Configuración del Equipo y Conexión", padding=10)
        config_frame.pack(fill="x", pady=(0, 8))

        # Row 1: Credentials
        row_cred = ttk.Frame(config_frame)
        row_cred.pack(fill="x", pady=2)
        ttk.Label(row_cred, text="Credencial Firebase:", width=18, anchor="w").pack(side=LEFT)
        ttk.Entry(row_cred, textvariable=self.credentials_var).pack(side=LEFT, fill="x", expand=True, padx=4)
        ttk.Button(row_cred, text="Buscar...", command=self._select_credentials).pack(side=LEFT, padx=2)
        ttk.Button(row_cred, text="Copiar local", command=self._install_local_credentials).pack(side=LEFT, padx=2)

        # Row 2: Printer
        row_print = ttk.Frame(config_frame)
        row_print.pack(fill="x", pady=2)
        ttk.Label(row_print, text="Impresora POS:", width=18, anchor="w").pack(side=LEFT)
        self.printer_combo = ttk.Combobox(row_print, textvariable=self.printer_var, values=PrinterService.list_printers())
        self.printer_combo.pack(side=LEFT, fill="x", expand=True, padx=4)
        ttk.Button(row_print, text="Refrescar", command=self._refresh_printers).pack(side=LEFT, padx=2)

        # Row 3: Station Name & Areas
        row_station = ttk.Frame(config_frame)
        row_station.pack(fill="x", pady=2)
        ttk.Label(row_station, text="Nombre Estación:", width=18, anchor="w").pack(side=LEFT)
        ttk.Entry(row_station, textvariable=self.station_var).pack(side=LEFT, fill="x", expand=True, padx=4)

        # Areas Checkboxes
        areas_frame = ttk.Frame(config_frame)
        areas_frame.pack(fill="x", pady=(4, 0))
        ttk.Label(areas_frame, text="Áreas asignadas:", width=18, anchor="w").pack(side=LEFT)
        for area in self.access_profile["allowed_areas"]:
            ttk.Checkbutton(
                areas_frame,
                text=area.title(),
                variable=self.area_vars[area],
                onvalue="1",
                offvalue="0",
            ).pack(side=LEFT, padx=6)

        # Action Buttons Row
        buttons_frame = ttk.Frame(main_container)
        buttons_frame.pack(fill="x", pady=(4, 8))

        self.btn_start = ttk.Button(buttons_frame, text="▶ Iniciar Escucha", command=self._start_listener)
        self.btn_start.pack(side=LEFT, padx=(0, 4))

        self.btn_stop = ttk.Button(buttons_frame, text="⏹ Detener", command=self._stop_listener, state="disabled")
        self.btn_stop.pack(side=LEFT, padx=4)

        self.start_btn = self.btn_start
        self.stop_btn = self.btn_stop

        ttk.Button(buttons_frame, text="💾 Guardar Cambios", command=self._save_config).pack(side=LEFT, padx=4)
        ttk.Button(buttons_frame, text="🔄 Refrescar Impresoras", command=self._refresh_printers).pack(side=LEFT, padx=4)
        ttk.Button(buttons_frame, text="🔗 Probar Conexión", command=self._test_connection).pack(side=LEFT, padx=4)
        ttk.Button(buttons_frame, text="🖨 Imprimir Ticket Prueba", command=self._print_test).pack(side=LEFT, padx=4)

        # Activity Log Box
        log_frame = ttk.LabelFrame(main_container, text="Registro de Actividad en Tiempo Real (Log de lectura, carga e impresión)", padding=8)
        log_frame.pack(fill=BOTH, expand=True)

        log_toolbar = ttk.Frame(log_frame)
        log_toolbar.pack(fill="x", pady=(0, 4))

        ttk.Button(log_toolbar, text="Limpiar Log", command=self._clear_log).pack(side=LEFT, padx=(0, 4))
        ttk.Button(log_toolbar, text="Copiar Log", command=self._copy_log).pack(side=LEFT, padx=4)
        ttk.Checkbutton(log_toolbar, text="Auto-scroll hacia abajo", variable=self.auto_scroll_var).pack(side=LEFT, padx=8)

        # Text Console with Scrollbars
        text_container = ttk.Frame(log_frame)
        text_container.pack(fill=BOTH, expand=True)

        self.log_text = tk.Text(
            text_container,
            wrap="word",
            font=("Consolas", 9),
            background="#0f172a",
            foreground="#f8fafc",
            insertbackground="#ffffff",
            padx=8,
            pady=8,
            relief="flat",
        )
        log_scroll = ttk.Scrollbar(text_container, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_scroll.set)

        self.log_text.pack(side=LEFT, fill=BOTH, expand=True)
        log_scroll.pack(side=RIGHT, fill="y")

    def _setup_log_styles(self) -> None:
        self.log_text.tag_configure("TIME", foreground="#94a3b8")
        self.log_text.tag_configure("TAG_INFO", foreground="#38bdf8", font=("Consolas", 9, "bold"))
        self.log_text.tag_configure("TAG_READ", foreground="#67e8f9", font=("Consolas", 9, "bold"))
        self.log_text.tag_configure("TAG_MATCH", foreground="#c084fc", font=("Consolas", 9, "bold"))
        self.log_text.tag_configure("TAG_PRINT", foreground="#4ade80", font=("Consolas", 9, "bold"))
        self.log_text.tag_configure("TAG_SKIP", foreground="#64748b")
        self.log_text.tag_configure("TAG_WARN", foreground="#fbbf24", font=("Consolas", 9, "bold"))
        self.log_text.tag_configure("TAG_ERROR", foreground="#f87171", font=("Consolas", 9, "bold"))

        self.log_text.tag_configure("MSG_INFO", foreground="#f8fafc")
        self.log_text.tag_configure("MSG_READ", foreground="#bae6fd")
        self.log_text.tag_configure("MSG_MATCH", foreground="#e9d5ff")
        self.log_text.tag_configure("MSG_PRINT", foreground="#86efac", font=("Consolas", 9, "bold"))
        self.log_text.tag_configure("MSG_SKIP", foreground="#94a3b8")
        self.log_text.tag_configure("MSG_WARN", foreground="#fde68a")
        self.log_text.tag_configure("MSG_ERROR", foreground="#fca5a5", font=("Consolas", 9, "bold"))

    def _select_credentials(self) -> None:
        selected = filedialog.askopenfilename(filetypes=[("JSON", "*.json")])
        if selected:
            self.credentials_var.set(selected)
            self._push_event(f"Archivo de credencial seleccionado: {selected}", "INFO")

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
        self._push_event(f"Credencial copiada a la carpeta del sistema: {target}", "INFO")

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
        self._push_event(
            f"Configuración guardada (Estación: '{self.config.station_name}', Áreas: {self.config.handled_areas}, Impresora: '{self.config.printer_name}')",
            "INFO",
        )

    def _refresh_printers(self) -> None:
        printers = PrinterService.list_printers()
        self.printer_combo["values"] = printers
        self._push_event(f"Listado de impresoras actualizado: {len(printers)} impresora(s) encontrada(s)", "INFO")

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
            self.status_var.set(f"● Listener: ACTIVO (Áreas: {areas_str})")
            self.status_lbl.configure(foreground="#16a34a")
            self._push_event(f"Listener iniciado exitosamente (Áreas activas: {areas_str})", "INFO")
        except Exception as exc:  # noqa: BLE001
            self.is_listening = False
            self._set_listener_state(False)
            self.status_var.set("● Listener: ERROR")
            self.status_lbl.configure(foreground="#dc2626")
            self._push_event(f"Fallo al iniciar listener: {exc}", "ERROR")
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
        self.status_var.set("● Listener: DETENIDO")
        self.status_lbl.configure(foreground="#dc2626")
        self._push_event("Listener detenido", "INFO")

    def _test_connection(self) -> None:
        self._save_config()
        try:
            self._push_event("Probando conexión con Firestore...", "INFO")
            bridge = FirestorePrintBridge(self.config, self.registry, self._push_event)
            bridge.connect()
            if not bridge.client:
                raise RuntimeError("No se pudo crear el cliente de Firestore")
            docs = list(bridge.client.collection("orders").limit(1).stream())
            self._push_event(f"✓ Conexión exitosa con Firestore. Lectura de prueba: {len(docs)} documento(s)", "INFO")
            messagebox.showinfo(APP_NAME, "Conexión a Firestore verificada correctamente")
        except Exception as exc:  # noqa: BLE001
            self._push_event(f"✗ Falló la prueba de conexión: {exc}", "ERROR")
            messagebox.showerror(APP_NAME, f"No se pudo conectar a Firestore: {exc}")

    def _print_test(self) -> None:
        self._save_config()
        if not self.config.printer_name:
            messagebox.showerror(APP_NAME, "Selecciona una impresora antes de imprimir")
            return
        try:
            self._push_event(f"Generando ticket de prueba para '{self.config.printer_name}'...", "MATCH")
            ticket = EscPos58Formatter.build_ticket(
                order_id="PRUEBA-01",
                table_label="10",
                items=[
                    {"quantity": 2, "productName": "Hamburguesa Doble Carne", "note": "Sin cebolla"},
                    {"quantity": 1, "productName": "Papas Fritas Rústicas", "note": "Salsa aparte"},
                ],
            )
            PrinterService.print_bytes(self.config.printer_name, ticket)
            self._push_event(f"✓ Ticket de prueba impreso en '{self.config.printer_name}'", "PRINT")
        except Exception as exc:  # noqa: BLE001
            self._push_event(f"✗ Error imprimiendo ticket de prueba: {exc}", "ERROR")
            messagebox.showerror(APP_NAME, f"No se pudo imprimir: {exc}")

    def _clear_log(self) -> None:
        self.log_text.delete("1.0", END)
        self._push_event("Log limpiado", "INFO")

    def _copy_log(self) -> None:
        content = self.log_text.get("1.0", END)
        self.root.clipboard_clear()
        self.root.clipboard_append(content)
        messagebox.showinfo(APP_NAME, "Registro copiado al portapapeles")

    def _push_event(self, message: str, level: str = "INFO") -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.events.put((timestamp, level.upper(), message))

    def _drain_events(self) -> None:
        while not self.events.empty():
            timestamp, level, message = self.events.get_nowait()
            tag_name = f"TAG_{level}"
            msg_name = f"MSG_{level}"

            # Ensure tags exist fallback
            if tag_name not in ("TAG_INFO", "TAG_READ", "TAG_MATCH", "TAG_PRINT", "TAG_SKIP", "TAG_WARN", "TAG_ERROR"):
                tag_name = "TAG_INFO"
                msg_name = "MSG_INFO"

            badge = f"[{level:<5}]"
            self.log_text.insert(END, f"[{timestamp}] ", "TIME")
            self.log_text.insert(END, f"{badge} ", tag_name)
            self.log_text.insert(END, f"{message}\n", msg_name)

            if self.auto_scroll_var.get():
                self.log_text.see(END)

        self.root.after(150, self._drain_events)

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