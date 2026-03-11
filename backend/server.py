from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, date, timedelta, timezone
import math

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
STRAVA_CLIENT_ID = os.environ.get('STRAVA_CLIENT_ID', '')
STRAVA_CLIENT_SECRET = os.environ.get('STRAVA_CLIENT_SECRET', '')
STRAVA_INITIAL_ACCESS_TOKEN = os.environ.get('STRAVA_ACCESS_TOKEN', '')
STRAVA_INITIAL_REFRESH_TOKEN = os.environ.get('STRAVA_REFRESH_TOKEN', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ====== HR ZONE MAP PER SESSION TYPE ======
SESSION_TYPE_HR_ZONES = {
    "corsa_lenta": {"zone": "Z2", "min_hr": 118, "max_hr": 146, "mid_hr": 132},
    "lungo":       {"zone": "Z2", "min_hr": 118, "max_hr": 146, "mid_hr": 132},
    "progressivo": {"zone": "Z3", "min_hr": 147, "max_hr": 160, "mid_hr": 153},
    "ripetute":    {"zone": "Z4", "min_hr": 161, "max_hr": 175, "mid_hr": 168},
    "ripetute_salita": {"zone": "Z4", "min_hr": 161, "max_hr": 175, "mid_hr": 168},
    "test":        {"zone": "Z5", "min_hr": 176, "max_hr": 200, "mid_hr": 185},
}

# ====== VDOT / DANIELS PACE ZONES ======
# Maps session type to Daniels training zone for pace calculation
SESSION_PACE_ZONE = {
    "corsa_lenta": "easy",
    "lungo": "easy",
    "progressivo": "threshold",
    "ripetute": "interval",
    "ripetute_salita": None,   # max effort, no target pace
    "test": None,
    "rinforzo": None,
    "cyclette": None,
    "riposo": None,
}

def _vo2_from_velocity(velocity_m_per_min: float) -> float:
    """Daniels formula: VO2 (ml/kg/min) from running velocity (m/min)."""
    return -4.60 + 0.182258 * velocity_m_per_min + 0.000104 * velocity_m_per_min * velocity_m_per_min

def _velocity_from_vo2(vo2: float) -> float:
    """Inverse Daniels formula: velocity (m/min) from VO2 (ml/kg/min).
    Solves: vo2 = -4.60 + 0.182258*v + 0.000104*v²  using quadratic formula."""
    a = 0.000104
    b = 0.182258
    c = -4.60 - vo2
    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return 0.0
    return (-b + math.sqrt(discriminant)) / (2 * a)

def _velocity_to_pace_str(velocity_m_per_min: float) -> str:
    """Convert velocity (m/min) to pace string (min:sec per km)."""
    if velocity_m_per_min <= 0:
        return "8:00"
    secs_per_km = 1000.0 / velocity_m_per_min * 60.0
    # Safety caps: 3:00/km to 8:00/km
    secs_per_km = max(180, min(480, secs_per_km))
    mins = int(secs_per_km) // 60
    secs = int(secs_per_km) % 60
    return f"{mins}:{secs:02d}"

def vdot_training_paces(vdot: float) -> dict:
    """Calculate Daniels training paces from a VDOT value.
    Returns dict with keys: easy, marathon, threshold, interval, repetition."""
    # Each zone is a % of VO2max
    zone_pcts = {
        "easy": 0.65,        # 59-74%, we use midpoint ~65%
        "marathon": 0.79,    # 75-84%, midpoint ~79%
        "threshold": 0.88,   # 83-90%, use ~88%
        "interval": 0.98,    # 95-100%, use ~98%
        "repetition": 1.05,  # 105-110%, use ~105%
    }
    paces = {}
    for zone_name, pct in zone_pcts.items():
        target_vo2 = vdot * pct
        velocity = _velocity_from_vo2(target_vo2)
        paces[zone_name] = _velocity_to_pace_str(velocity)
    return paces

def _pace_to_seconds(pace_str: str) -> int:
    """Convert pace string like '4:30' to total seconds (270)."""
    if not pace_str or pace_str in ('N/D', 'max', ''):
        return 0
    try:
        parts = pace_str.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return 0

def calculate_vdot_from_race(distance_km: float, duration_minutes: float) -> float | None:
    """Calculate VDOT from a race/test result using Daniels formula."""
    if distance_km <= 0 or duration_minutes <= 0:
        return None
    dist_m = distance_km * 1000
    velocity = dist_m / duration_minutes  # m/min
    # Daniels %VO2max at race distance
    pct_vo2 = (0.8 + 0.1894393 * math.exp(-0.012778 * duration_minutes)
               + 0.2989558 * math.exp(-0.1932605 * duration_minutes))
    if pct_vo2 <= 0:
        return None
    vo2 = _vo2_from_velocity(velocity)
    return round(vo2 / pct_vo2, 1)

async def calculate_current_vdot() -> tuple[float | None, dict | None]:
    """Calculate current VDOT from best post-injury (2026+) race/test efforts.
    Returns (vdot, best_effort_info) or (None, None)."""
    runs = await db.runs.find({"date": {"$gte": "2026-01-01"}}, {"_id": 0}).to_list(2000)
    if not runs:
        return None, None

    def pace_str_to_secs(p):
        if not p or ':' not in p:
            return 9999
        parts = p.split(':')
        try:
            return int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            return 9999

    # Find best effort at standard distances
    best_race = None
    best_vdot = None
    for target_dist in [10, 6, 5, 15, 4, 21.1]:
        candidates = [r for r in runs if abs(r.get("distance_km", 0) - target_dist) < 0.5
                       and r.get("duration_minutes", 0) > 0]
        if candidates:
            # Pick fastest
            best = min(candidates, key=lambda r: pace_str_to_secs(r.get("avg_pace", "9:99")))
            vdot = calculate_vdot_from_race(best["distance_km"], best["duration_minutes"])
            if vdot and (best_vdot is None or vdot > best_vdot):
                best_vdot = vdot
                best_race = best

    if best_vdot and best_race:
        info = {
            "distance_km": best_race["distance_km"],
            "duration_minutes": best_race["duration_minutes"],
            "avg_pace": best_race.get("avg_pace"),
            "date": best_race.get("date"),
        }
        return best_vdot, info
    return None, None

# ====== MODELS ======

class RunCreate(BaseModel):
    date: str
    distance_km: float
    duration_minutes: float
    avg_pace: str
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    avg_hr_pct: Optional[int] = None
    max_hr_pct: Optional[int] = None
    run_type: str = "easy"
    notes: Optional[str] = None
    location: Optional[str] = None

class RunResponse(BaseModel):
    id: str
    date: str
    distance_km: float
    duration_minutes: float
    avg_pace: str
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    avg_hr_pct: Optional[int] = None
    max_hr_pct: Optional[int] = None
    run_type: str
    notes: Optional[str] = None
    location: Optional[str] = None

class TestCreate(BaseModel):
    date: str
    test_type: str
    distance_km: float
    duration_minutes: float
    avg_pace: str
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    notes: Optional[str] = None

class TestResponse(BaseModel):
    id: str
    date: str
    test_type: str
    distance_km: float
    duration_minutes: float
    avg_pace: str
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    notes: Optional[str] = None

class AIAnalyzeRequest(BaseModel):
    run_id: str

class SessionCompleteRequest(BaseModel):
    week_id: str
    session_index: int
    completed: bool

class ProfileUpdateRequest(BaseModel):
    age: Optional[int] = None
    weight_kg: Optional[float] = None
    max_hr: Optional[int] = None
    max_weekly_km: Optional[int] = None

# ====== HELPER FUNCTIONS ======

def make_id():
    return str(uuid.uuid4())

def pace_to_seconds(pace_str):
    parts = pace_str.split(":")
    return int(parts[0]) * 60 + int(parts[1])

def seconds_to_pace(secs):
    m = int(secs) // 60
    s = int(secs) % 60
    return f"{m}:{s:02d}"

def get_monday(d):
    return d - timedelta(days=d.weekday())

DAYS_IT = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]

def generate_training_plan(vdot_paces=None):
    """Generate complete training plan from March 9, 2026 to December 12, 2026.
    If vdot_paces dict is provided, session paces are derived from VDOT instead of hardcoded."""
    race_date = date(2026, 12, 12)
    start_date = date(2026, 3, 9)

    phases = [
        {"name": "Ripresa", "weeks": 6, "km_range": (20, 35), "desc": "Ritorno graduale alla corsa dopo infortunio"},
        {"name": "Base Aerobica", "weeks": 8, "km_range": (35, 45), "desc": "Costruzione della base aerobica"},
        {"name": "Sviluppo", "weeks": 8, "km_range": (42, 52), "desc": "Sviluppo della resistenza specifica"},
        {"name": "Preparazione Specifica", "weeks": 8, "km_range": (48, 58), "desc": "Lavori specifici per la mezza maratona"},
        {"name": "Picco", "weeks": 5, "km_range": (50, 57), "desc": "Fase di picco e rifinitura"},
        {"name": "Tapering", "weeks": 3, "km_range": (40, 25), "desc": "Scarico pre-gara"},
    ]
    
    # Recovery weeks every 4 weeks (weeks 4, 8, 12, 16, 20, 24, 28, 32) - reduce km by 30-40%
    recovery_weeks = {4, 8, 12, 16, 20, 24, 28, 32}

    weeks = []
    current_date = start_date
    week_num = 1

    for phase in phases:
        km_start, km_end = phase["km_range"]
        for i in range(phase["weeks"]):
            progress = i / max(phase["weeks"] - 1, 1)
            target_km = round(km_start + (km_end - km_start) * progress, 1)
            week_start = current_date
            week_end = current_date + timedelta(days=6)
            
            # Apply recovery week reduction
            is_recovery = week_num in recovery_weeks
            if is_recovery and phase["name"] not in ["Tapering", "Ripresa"]:
                target_km = round(target_km * 0.65, 1)  # 35% reduction

            sessions = generate_week_sessions(phase["name"], week_num, target_km, week_start, i, phase["weeks"], is_recovery, paces=vdot_paces)

            week_notes = get_week_notes(phase["name"], week_num, i)
            if is_recovery:
                week_notes = "⚡ SETTIMANA DI SCARICO - Recupero attivo per prevenire infortuni. " + week_notes

            weeks.append({
                "id": make_id(),
                "week_number": week_num,
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "phase": phase["name"],
                "phase_description": phase["desc"],
                "target_km": target_km,
                "is_recovery_week": is_recovery,
                "sessions": sessions,
                "notes": week_notes
            })

            current_date += timedelta(days=7)
            week_num += 1

    return weeks

def generate_week_sessions(phase, week_num, target_km, week_start, phase_week, total_phase_weeks, is_recovery=False, paces=None):
    """Generate sessions for a week. If paces dict is provided (from VDOT), overrides hardcoded paces."""
    sessions = []

    if phase == "Ripresa":
        templates = [
            {"day": 0, "type": "riposo", "title": "Riposo / Rinforzo", "desc": "Esercizi di rinforzo muscolare + stretching", "km": 0, "pace": None, "dur": 40},
            {"day": 1, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Corsa facile in zona aerobica", "km": round(target_km * 0.2, 1), "pace": "5:40", "dur": None},
            {"day": 2, "type": "rinforzo", "title": "Rinforzo Muscolare", "desc": "Protocollo rinforzo: calf raise, squat, clamshell", "km": 0, "pace": None, "dur": 45},
            {"day": 3, "type": "corsa_lenta", "title": "Corsa Media", "desc": "Corsa a ritmo medio-facile", "km": round(target_km * 0.25, 1), "pace": "5:30", "dur": None},
            {"day": 4, "type": "riposo", "title": "Riposo", "desc": "Recupero completo o cyclette leggera 30min", "km": 0, "pace": None, "dur": 0},
            {"day": 5, "type": "corsa_lenta", "title": "Corsa Facile", "desc": "Corsa facile + allunghi", "km": round(target_km * 0.2, 1), "pace": "5:40", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo Lento", "desc": "Corsa lunga a ritmo confortevole", "km": round(target_km * 0.35, 1), "pace": "5:45", "dur": None},
        ]
    elif phase == "Base Aerobica":
        templates = [
            {"day": 0, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Corsa di recupero", "km": round(target_km * 0.15, 1), "pace": "5:30", "dur": None},
            {"day": 1, "type": "ripetute", "title": "Ripetute", "desc": "Riscaldamento 2km + 6x1000m a 4:40 (rec 2min) + defaticamento", "km": round(target_km * 0.2, 1), "pace": "4:40", "dur": None},
            {"day": 2, "type": "rinforzo", "title": "Rinforzo + Cyclette", "desc": "Rinforzo muscolare + 30min cyclette leggera", "km": 0, "pace": None, "dur": 60},
            {"day": 3, "type": "progressivo", "title": "Progressivo", "desc": "Corsa progressiva: inizia a 5:30, chiudi a 4:50", "km": round(target_km * 0.2, 1), "pace": "5:10", "dur": None},
            {"day": 4, "type": "riposo", "title": "Riposo", "desc": "Recupero completo", "km": 0, "pace": None, "dur": 0},
            {"day": 5, "type": "corsa_lenta", "title": "Corsa Facile", "desc": "Corsa facile + 6 allunghi progressivi", "km": round(target_km * 0.15, 1), "pace": "5:30", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo", "desc": "Corsa lunga progressiva", "km": round(target_km * 0.3, 1), "pace": "5:20", "dur": None},
        ]
    elif phase == "Sviluppo":
        # Aggiungiamo ripetute in salita per stimolo neuromuscolare
        templates = [
            {"day": 0, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Recupero attivo", "km": round(target_km * 0.13, 1), "pace": "5:25", "dur": None},
            {"day": 1, "type": "ripetute_salita", "title": "Ripetute in Salita", "desc": "2km riscaldamento + 8x60sec salita forte (rec discesa) + 2km defaticamento. Grande stimolo neuromuscolare!", "km": round(target_km * 0.18, 1), "pace": "max", "dur": None},
            {"day": 2, "type": "cyclette", "title": "Cyclette Recupero", "desc": "45min cyclette + core stability", "km": 0, "pace": None, "dur": 45},
            {"day": 3, "type": "ripetute", "title": "Ripetute Medie", "desc": "2km riscaldamento + 5x2000m a 4:35 (rec 2:30) + defaticamento", "km": round(target_km * 0.22, 1), "pace": "4:35", "dur": None},
            {"day": 4, "type": "rinforzo", "title": "Rinforzo + Riposo", "desc": "Rinforzo muscolare specifico runner", "km": 0, "pace": None, "dur": 45},
            {"day": 5, "type": "corsa_lenta", "title": "Corsa Pre-Lungo", "desc": "Corsa facile + allunghi", "km": round(target_km * 0.12, 1), "pace": "5:20", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo Progressivo", "desc": "Lungo con ultimi 3km a ritmo gara", "km": min(round(target_km * 0.35, 1), 20), "pace": "5:10", "dur": None},
        ]
    elif phase == "Preparazione Specifica":
        # Lungo fino a 22km e ripetute in salita alternate
        long_km = min(round(target_km * 0.38, 1), 22)  # Max 22km
        templates = [
            {"day": 0, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Recupero", "km": round(target_km * 0.12, 1), "pace": "5:20", "dur": None},
            {"day": 1, "type": "ripetute", "title": "Ripetute Gara", "desc": "2km riscaldamento + 4x3000m a 4:30 (rec 3min) + defaticamento", "km": round(target_km * 0.24, 1), "pace": "4:30", "dur": None},
            {"day": 2, "type": "cyclette", "title": "Cyclette + Core", "desc": "50min cyclette moderata + core stability", "km": 0, "pace": None, "dur": 50},
            {"day": 3, "type": "ripetute_salita", "title": "Ripetute Salita", "desc": "2km riscaldamento + 10x45sec salita forte (rec discesa) + 2km defaticamento. Forza esplosiva!", "km": round(target_km * 0.15, 1), "pace": "max", "dur": None},
            {"day": 4, "type": "riposo", "title": "Riposo", "desc": "Recupero completo + stretching", "km": 0, "pace": None, "dur": 0},
            {"day": 5, "type": "corsa_lenta", "title": "Corsa Facile", "desc": "Corsa facile + 8 allunghi", "km": round(target_km * 0.11, 1), "pace": "5:15", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo Specifico 22km", "desc": f"Lungo {long_km}km con ultimi 5km a ritmo gara 4:30. Simulazione mezza maratona!", "km": long_km, "pace": "5:00", "dur": None},
        ]
    elif phase == "Picco":
        # Lungo fino a 24km, massima specificità
        long_km = min(round(target_km * 0.42, 1), 24)  # Max 24km
        templates = [
            {"day": 0, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Recupero attivo", "km": round(target_km * 0.12, 1), "pace": "5:15", "dur": None},
            {"day": 1, "type": "ripetute", "title": "Ripetute Veloci", "desc": "2km riscaldamento + 8x1000m a 4:15 (rec 2min) + defaticamento", "km": round(target_km * 0.20, 1), "pace": "4:15", "dur": None},
            {"day": 2, "type": "cyclette", "title": "Cyclette Recupero", "desc": "40min cyclette leggera", "km": 0, "pace": None, "dur": 40},
            {"day": 3, "type": "ripetute_salita", "title": "Ripetute Salita Brevi", "desc": "2km riscaldamento + 6x30sec salita esplosiva (rec discesa) + 2km defaticamento", "km": round(target_km * 0.12, 1), "pace": "max", "dur": None},
            {"day": 4, "type": "rinforzo", "title": "Rinforzo Leggero", "desc": "Rinforzo muscolare mantenimento", "km": 0, "pace": None, "dur": 35},
            {"day": 5, "type": "corsa_lenta", "title": "Corsa Pre-Lungo", "desc": "Corsa facile + allunghi", "km": round(target_km * 0.10, 1), "pace": "5:15", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo di Picco 24km", "desc": f"Lungo {long_km}km: ultimi 8km a ritmo gara 4:30. Ultimo test prima del tapering!", "km": long_km, "pace": "4:55", "dur": None},
        ]
    else:  # Tapering
        progress = phase_week / max(total_phase_weeks - 1, 1)
        templates = [
            {"day": 0, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Recupero", "km": round(target_km * 0.15, 1), "pace": "5:20", "dur": None},
            {"day": 1, "type": "ripetute", "title": "Ripetute Brevi", "desc": "Riscaldamento + 4x800m a 4:20 (rec 2min)", "km": round(target_km * 0.2, 1), "pace": "4:20", "dur": None},
            {"day": 2, "type": "riposo", "title": "Riposo", "desc": "Recupero completo", "km": 0, "pace": None, "dur": 0},
            {"day": 3, "type": "corsa_lenta", "title": "Corsa Facile", "desc": "Corsa leggera + 4 allunghi", "km": round(target_km * 0.2, 1), "pace": "5:15", "dur": None},
            {"day": 4, "type": "riposo", "title": "Riposo", "desc": "Recupero + stretching", "km": 0, "pace": None, "dur": 0},
            {"day": 5, "type": "corsa_lenta", "title": "Shakeout Run", "desc": "20min corsa leggerissima", "km": round(target_km * 0.12, 1), "pace": "5:30", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo Ridotto", "desc": "Lungo ridotto a ritmo confortevole", "km": round(target_km * 0.33, 1), "pace": "5:10", "dur": None},
        ]

    for t in templates:
        session_date = week_start + timedelta(days=t["day"])

        # Override pace with VDOT-derived pace if available
        final_pace = t["pace"]
        if paces and t["pace"] and t["pace"] != "max":
            daniels_zone = SESSION_PACE_ZONE.get(t["type"])
            if daniels_zone and daniels_zone in paces:
                final_pace = paces[daniels_zone]

        sessions.append({
            "day": DAYS_IT[t["day"]],
            "date": session_date.isoformat(),
            "type": t["type"],
            "title": t["title"],
            "description": t["desc"],
            "target_distance_km": t["km"],
            "target_pace": final_pace,
            "target_duration_min": t["dur"],
            "completed": False
        })

    return sessions

def get_week_notes(phase, week_num, phase_week):
    notes_map = {
        "Ripresa": "Ascolta il tuo corpo. Se senti dolore al tendine, riduci immediatamente. Il riscaldamento pre-corsa è fondamentale.",
        "Base Aerobica": "Mantieni la maggior parte delle corse in zona aerobica (FC <155bpm). La pazienza ora paga dopo.",
        "Sviluppo": "Iniziamo ad alzare l'intensità. Assicurati di dormire almeno 7-8 ore.",
        "Preparazione Specifica": "Lavori a ritmo gara. Il corpo si sta adattando al target 4:30/km.",
        "Picco": "Settimane decisive. Massima concentrazione su recupero e alimentazione.",
        "Tapering": "Riduci il volume ma mantieni l'intensità. Fidati dell'allenamento fatto!"
    }
    return notes_map.get(phase, "")

def get_weekly_history_data():
    data = [
        ("2025-02-17", "2025-02-23", 20.05, 2025), ("2025-02-24", "2025-03-02", 35.66, 2025),
        ("2025-03-03", "2025-03-09", 32.69, 2025), ("2025-03-10", "2025-03-16", 64.50, 2025),
        ("2025-03-17", "2025-03-23", 42.12, 2025), ("2025-03-24", "2025-03-30", 26.12, 2025),
        ("2025-03-31", "2025-04-06", 65.40, 2025), ("2025-04-07", "2025-04-13", 52.09, 2025),
        ("2025-04-14", "2025-04-20", 23.13, 2025), ("2025-04-21", "2025-04-27", 28.09, 2025),
        ("2025-04-28", "2025-05-04", 20.80, 2025), ("2025-05-05", "2025-05-11", 45.35, 2025),
        ("2025-05-12", "2025-05-18", 50.09, 2025), ("2025-05-19", "2025-05-25", 26.37, 2025),
        ("2025-05-26", "2025-06-01", 27.39, 2025), ("2025-06-02", "2025-06-08", 39.98, 2025),
        ("2025-06-09", "2025-06-15", 43.79, 2025), ("2025-06-16", "2025-06-22", 36.93, 2025),
        ("2025-06-23", "2025-06-29", 20.88, 2025), ("2025-06-30", "2025-07-06", 36.83, 2025),
        ("2025-07-07", "2025-07-13", 38.89, 2025), ("2025-07-14", "2025-07-20", 11.29, 2025),
        ("2025-07-21", "2025-07-27", 37.48, 2025), ("2025-07-28", "2025-08-03", 33.01, 2025),
        ("2025-08-04", "2025-08-10", 38.78, 2025), ("2025-08-11", "2025-08-17", 43.25, 2025),
        ("2025-08-18", "2025-08-24", 30.64, 2025), ("2025-08-25", "2025-08-31", 29.97, 2025),
        ("2025-09-01", "2025-09-07", 12.02, 2025), ("2025-09-08", "2025-09-14", 0.0, 2025),
        ("2025-09-15", "2025-09-21", 0.0, 2025), ("2025-09-22", "2025-09-28", 14.56, 2025),
        ("2025-09-29", "2025-10-05", 36.02, 2025), ("2025-10-06", "2025-10-12", 39.05, 2025),
        ("2025-10-13", "2025-10-19", 42.85, 2025), ("2025-10-20", "2025-10-26", 31.54, 2025),
        ("2025-10-27", "2025-11-02", 52.06, 2025), ("2025-11-03", "2025-11-09", 8.0, 2025),
        ("2025-11-10", "2025-11-16", 20.09, 2025), ("2025-11-17", "2025-11-23", 30.68, 2025),
        ("2025-11-24", "2025-11-30", 16.19, 2025),
        ("2026-01-26", "2026-02-01", 2.0, 2026), ("2026-02-02", "2026-02-08", 10.03, 2026),
        ("2026-02-09", "2026-02-15", 13.02, 2026), ("2026-02-23", "2026-03-01", 13.02, 2026),
        ("2026-03-02", "2026-03-08", 6.01, 2026),
    ]
    result = []
    for i, (ws, we, km, yr) in enumerate(data):
        result.append({"id": make_id(), "week_start": ws, "week_end": we, "total_km": km, "year": yr, "week_number": i + 1})
    return result

def get_seed_runs():
    return [
        {"id": make_id(), "date": "2025-11-21", "distance_km": 6.0, "duration_minutes": 26.0, "avg_pace": "4:20", "avg_hr": 149, "max_hr": 161, "avg_hr_pct": 83, "max_hr_pct": 89, "run_type": "test", "notes": "Test 6km - Miglior forma pre-infortunio", "location": "Roma"},
        {"id": make_id(), "date": "2025-10-15", "distance_km": 10.0, "duration_minutes": 45.52, "avg_pace": "4:33", "avg_hr": 158, "max_hr": 170, "avg_hr_pct": 88, "max_hr_pct": 94, "run_type": "race", "notes": "PB 10km - 45:31", "location": "Roma"},
        {"id": make_id(), "date": "2025-10-28", "distance_km": 15.0, "duration_minutes": 73.63, "avg_pace": "4:54", "avg_hr": 155, "max_hr": 172, "avg_hr_pct": 86, "max_hr_pct": 96, "run_type": "long", "notes": "PB 15km - 1:13:38", "location": "Roma"},
        {"id": make_id(), "date": "2025-09-20", "distance_km": 4.01, "duration_minutes": 16.13, "avg_pace": "4:01", "avg_hr": 168, "max_hr": 178, "avg_hr_pct": 94, "max_hr_pct": 99, "run_type": "race", "notes": "PB 4km - 16:08", "location": "Roma"},
        {"id": make_id(), "date": "2026-03-07", "distance_km": 6.01, "duration_minutes": 28.87, "avg_pace": "4:48", "avg_hr": 159, "max_hr": 179, "avg_hr_pct": 88, "max_hr_pct": 99, "run_type": "progressive", "notes": "Roma - Progressivo. Sofferta, FC molto alta. Ritorno post-infortunio.", "location": "Roma"},
        {"id": make_id(), "date": "2026-02-25", "distance_km": 5.01, "duration_minutes": 28.56, "avg_pace": "5:42", "avg_hr": 145, "max_hr": 162, "avg_hr_pct": 81, "max_hr_pct": 90, "run_type": "easy", "notes": "Corsa facile di ripresa", "location": "Roma"},
        {"id": make_id(), "date": "2026-02-20", "distance_km": 4.01, "duration_minutes": 23.66, "avg_pace": "5:54", "avg_hr": 140, "max_hr": 158, "avg_hr_pct": 78, "max_hr_pct": 88, "run_type": "easy", "notes": "Ripresa graduale", "location": "Roma"},
        {"id": make_id(), "date": "2026-02-14", "distance_km": 6.01, "duration_minutes": 34.86, "avg_pace": "5:48", "avg_hr": 143, "max_hr": 160, "avg_hr_pct": 79, "max_hr_pct": 89, "run_type": "easy", "notes": "Corsa lenta post-infortunio", "location": "Roma"},
        {"id": make_id(), "date": "2026-02-05", "distance_km": 5.02, "duration_minutes": 30.12, "avg_pace": "6:00", "avg_hr": 138, "max_hr": 155, "avg_hr_pct": 77, "max_hr_pct": 86, "run_type": "easy", "notes": "Prima corsa seria di ritorno", "location": "Roma"},
    ]

def get_supplements():
    return [
        {"id": make_id(), "name": "Collagene GELITA (Tendoforte®, Fortigel®, Verisol®)", "dosage": "Collagene puro idrolizzato in polvere", "timing": "50 minuti prima della corsa", "purpose": "Salute tendini e articolazioni, recupero tessuto connettivo", "active": True, "category": "tendini"},
        {"id": make_id(), "name": "Vitamina C", "dosage": "500-1000mg", "timing": "Insieme al collagene, 50 min pre-corsa", "purpose": "Potenzia la sintesi del collagene, antiossidante", "active": True, "category": "vitamine"},
        {"id": make_id(), "name": "Creatina Monoidrato", "dosage": "3-5g/giorno", "timing": "Post-allenamento con pasto", "purpose": "Migliora potenza muscolare, recupero, idratazione cellulare. Studi mostrano benefici anche per runner di endurance.", "active": True, "category": "performance"},
        {"id": make_id(), "name": "Magnesio", "dosage": "400mg", "timing": "Sera, prima di dormire", "purpose": "Prevenzione crampi, qualità del sonno, recupero muscolare", "active": True, "category": "minerali"},
        {"id": make_id(), "name": "Omega-3 (EPA/DHA)", "dosage": "2-3g/giorno", "timing": "Con pasto principale", "purpose": "Anti-infiammatorio, salute cardiovascolare", "active": True, "category": "anti_infiammatorio"},
        {"id": make_id(), "name": "Vitamina D3", "dosage": "2000-4000 UI", "timing": "Mattina con colazione", "purpose": "Salute ossa, sistema immunitario, prestazione muscolare", "active": True, "category": "vitamine"},
    ]

def get_exercises():
    return [
        {"id": make_id(), "name": "Calf Raise Monopodalico", "sets": 4, "reps": 12, "tempo": "3s su / 4s giù", "rest": "60s", "category": "polpaccio", "priority": "alta", "notes": "Fondamentale per il tendine d'Achille. Eseguire con controllo eccentrico."},
        {"id": make_id(), "name": "Isometria Polpaccio", "sets": 5, "reps": 1, "tempo": "45s tenuta", "rest": "60s", "category": "polpaccio", "priority": "alta", "notes": "Tenuta isometrica su un gradino. Fondamentale per la tendinopatia."},
        {"id": make_id(), "name": "Calf Ginocchio Flesso (Soleo)", "sets": 3, "reps": 15, "tempo": "3s su / 3s giù", "rest": "60s", "category": "polpaccio", "priority": "alta", "notes": "Lavora il soleo. Ginocchio leggermente flesso durante l'esecuzione."},
        {"id": make_id(), "name": "Squat Corpo Libero", "sets": 3, "reps": 20, "tempo": "Controllato", "rest": "60s", "category": "gambe", "priority": "media", "notes": "Squat completo, schiena dritta, peso sui talloni."},
        {"id": make_id(), "name": "Clamshell", "sets": 3, "reps": 20, "tempo": "2s su / 2s giù", "rest": "45s", "category": "anche", "priority": "media", "notes": "Rinforzo gluteo medio. Usa elastico per maggiore resistenza."},
        {"id": make_id(), "name": "Plank Frontale", "sets": 3, "reps": 1, "tempo": "45-60s tenuta", "rest": "45s", "category": "core", "priority": "media", "notes": "Core stability fondamentale per la postura in corsa."},
        {"id": make_id(), "name": "Single Leg Deadlift", "sets": 3, "reps": 12, "tempo": "3s discesa / 2s salita", "rest": "60s", "category": "posteriore", "priority": "media", "notes": "Equilibrio e rinforzo catena posteriore."},
        {"id": make_id(), "name": "Step-Up", "sets": 3, "reps": 15, "tempo": "Controllato", "rest": "60s", "category": "gambe", "priority": "media", "notes": "Su un gradino di 30-40cm. Simula la spinta in corsa."},
    ]

def get_profile():
    return {
        "id": make_id(),
        "name": "Runner",
        "age": 40,
        "weight_kg": 68,
        "max_hr": 179,
        "started_running": "2025-02-01",
        "total_km": 1400,
        "race_goal": "Mezza Maratona Fuerteventura - Corralejo",
        "race_date": "2026-12-12",
        "target_pace": "4:30",
        "target_time": "1:35:00",
        "pbs": {
            "4km": {"time": "16:08", "date": "2025-09-20", "pace": "4:01"},
            "6km": {"time": "26:00", "date": "2025-11-21", "pace": "4:20"},
            "10km": {"time": "45:31", "date": "2025-10-15", "pace": "4:33"},
            "15km": {"time": "1:13:38", "date": "2025-10-28", "pace": "4:54"}
        },
        "medals": {
            "4km": {
                "targets": {
                    "warmup": {"time": "20:00", "pace": "5:00"},
                    "bronzo": {"time": "18:00", "pace": "4:30"},
                    "argento": {"time": "17:00", "pace": "4:15"},
                    "oro": {"time": "16:00", "pace": "4:00"},
                    "platino": {"time": "15:20", "pace": "3:50"},
                    "elite": {"time": "14:40", "pace": "3:40"}
                },
                "current_best": "16:08",
                "status": "argento"
            },
            "6km": {
                "targets": {
                    "warmup": {"time": "33:00", "pace": "5:30"},
                    "bronzo": {"time": "30:00", "pace": "5:00"},
                    "argento": {"time": "27:00", "pace": "4:30"},
                    "oro": {"time": "25:00", "pace": "4:10"},
                    "platino": {"time": "23:00", "pace": "3:50"},
                    "elite": {"time": "21:30", "pace": "3:35"}
                },
                "current_best": "26:00",
                "status": "argento"
            },
            "10km": {
                "targets": {
                    "warmup": {"time": "55:00", "pace": "5:30"},
                    "bronzo": {"time": "50:00", "pace": "5:00"},
                    "argento": {"time": "47:00", "pace": "4:42"},
                    "oro": {"time": "43:00", "pace": "4:18"},
                    "platino": {"time": "40:00", "pace": "4:00"},
                    "elite": {"time": "37:00", "pace": "3:42"}
                },
                "current_best": "45:31",
                "status": "argento"
            },
            "15km": {
                "targets": {
                    "warmup": {"time": "1:22:30", "pace": "5:30"},
                    "bronzo": {"time": "1:15:00", "pace": "5:00"},
                    "argento": {"time": "1:15:00", "pace": "5:00"},
                    "oro": {"time": "1:08:00", "pace": "4:32"},
                    "platino": {"time": "1:02:30", "pace": "4:10"},
                    "elite": {"time": "57:00", "pace": "3:48"}
                },
                "current_best": "1:13:38",
                "status": "argento"
            },
            "21.1km": {
                "targets": {
                    "warmup": {"time": "2:00:00", "pace": "5:41"},
                    "bronzo": {"time": "1:50:00", "pace": "5:12"},
                    "argento": {"time": "1:42:00", "pace": "4:50"},
                    "oro": {"time": "1:35:00", "pace": "4:30"},
                    "platino": {"time": "1:28:00", "pace": "4:10"},
                    "elite": {"time": "1:20:00", "pace": "3:48"}
                },
                "current_best": None,
                "status": "locked"
            }
        },
        "max_weekly_km": 57,
        "injury": {
            "type": "Tendinopatia inserzionale achillea destra",
            "date": "2025-11-26",
            "recovery_start": "2025-12-26",
            "running_resumed": "2026-02-01",
            "status": "In recupero - leggerissima rigidità mattutina (sparisce in 10s)",
            "details": "Spessore tendine: 8mm -> 5mm (controlaterale 4mm). Calcificazione inserzionale ancora presente."
        },
        "mouth_tape": {
            "recommendation": "Consigliato per allenamenti a bassa intensità",
            "benefits": "Studi scientifici mostrano: respirazione nasale migliora efficienza O2, riduce FC a parità di sforzo, migliora filtrazione aria. NON usare per ripetute/alta intensità.",
            "protocol": "Inizia con corse facili <30min, poi estendi gradualmente. Togli se FC supera 150bpm."
        }
    }

def get_test_schedule():
    return [
        {"id": make_id(), "scheduled_date": "2026-04-20", "test_type": "6km_time_trial", "description": "Test 6km a sforzo massimale - Verifica ritorno alla forma", "completed": False},
        {"id": make_id(), "scheduled_date": "2026-05-04", "test_type": "fc_max_test", "description": "Test FC Max - Rivalutazione frequenza cardiaca massima (8x400m con recupero)", "completed": False},
        {"id": make_id(), "scheduled_date": "2026-06-01", "test_type": "10km_time_trial", "description": "Test 10km - Valutazione base aerobica", "completed": False},
        {"id": make_id(), "scheduled_date": "2026-07-20", "test_type": "6km_time_trial", "description": "Test 6km - Verifica sviluppo velocità", "completed": False},
        {"id": make_id(), "scheduled_date": "2026-09-07", "test_type": "15km_time_trial", "description": "Test 15km - Simulazione resistenza specifica", "completed": False},
        {"id": make_id(), "scheduled_date": "2026-10-19", "test_type": "10km_time_trial", "description": "Test 10km - Verifica ritmo gara", "completed": False},
        {"id": make_id(), "scheduled_date": "2026-11-22", "test_type": "6km_time_trial", "description": "Test 6km pre-gara - Ultima verifica", "completed": False},
    ]

# ====== ENDPOINTS ======

@api_router.post("/seed")
async def seed_data():
    await db.profile.delete_many({})
    await db.weekly_history.delete_many({})
    await db.runs.delete_many({})
    await db.training_plan.delete_many({})
    await db.supplements.delete_many({})
    await db.exercises.delete_many({})
    await db.tests.delete_many({})
    await db.test_schedule.delete_many({})
    await db.ai_analyses.delete_many({})

    await db.profile.insert_one(get_profile())
    await db.weekly_history.insert_many(get_weekly_history_data())
    seed_runs = get_seed_runs()
    await db.runs.insert_many(seed_runs)

    # Calculate VDOT from seed runs to generate plan with scientific paces
    vdot_paces = None
    best_vdot = None
    for run in seed_runs:
        if run.get("distance_km", 0) >= 4 and run.get("duration_minutes", 0) > 0:
            vdot = calculate_vdot_from_race(run["distance_km"], run["duration_minutes"])
            if vdot and (best_vdot is None or vdot > best_vdot):
                best_vdot = vdot
    if best_vdot:
        vdot_paces = vdot_training_paces(best_vdot)
        logger.info(f"Seed: VDOT {best_vdot} → paces {vdot_paces}")

    plan = generate_training_plan(vdot_paces=vdot_paces)
    if plan:
        await db.training_plan.insert_many(plan)

    await db.supplements.insert_many(get_supplements())
    await db.exercises.insert_many(get_exercises())
    await db.test_schedule.insert_many(get_test_schedule())

    return {
        "status": "ok",
        "message": "Dati inizializzati con successo",
        "weeks": len(plan),
        "vdot": best_vdot,
        "vdot_paces": vdot_paces,
    }

@api_router.get("/dashboard")
async def get_dashboard():
    profile = await db.profile.find_one({}, {"_id": 0})
    today = date.today()
    today_str = today.isoformat()

    current_week = await db.training_plan.find_one(
        {"week_start": {"$lte": today_str}, "week_end": {"$gte": today_str}},
        {"_id": 0}
    )

    recent_runs = await db.runs.find({}, {"_id": 0}).sort("date", -1).limit(5).to_list(5)
    total_runs = await db.runs.count_documents({})

    all_runs = await db.runs.find({}, {"_id": 0, "distance_km": 1, "date": 1}).to_list(2000)
    total_km = sum(r.get("distance_km", 0) for r in all_runs)

    # Calculate REAL weekly km from runs (Monday to Sunday)
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    monday_str = monday.isoformat()
    sunday_str = sunday.isoformat()
    
    this_week_km = sum(
        r.get("distance_km", 0) for r in all_runs 
        if monday_str <= r.get("date", "") <= sunday_str
    )

    # Build weekly history from actual runs (last 12 weeks)
    weekly_history = []
    for i in range(12):
        week_monday = monday - timedelta(weeks=i)
        week_sunday = week_monday + timedelta(days=6)
        week_km = sum(
            r.get("distance_km", 0) for r in all_runs 
            if week_monday.isoformat() <= r.get("date", "") <= week_sunday.isoformat()
        )
        weekly_history.append({
            "week_start": week_monday.isoformat(),
            "week_end": week_sunday.isoformat(),
            "km": round(week_km, 1)
        })
    weekly_history.reverse()

    race_date = date(2026, 12, 12)
    days_to_race = (race_date - today).days

    next_test = await db.test_schedule.find_one(
        {"scheduled_date": {"$gte": today_str}, "completed": False},
        {"_id": 0}
    )

    return {
        "profile": profile,
        "current_week": current_week,
        "recent_runs": recent_runs,
        "total_runs": total_runs,
        "total_km_logged": round(total_km, 1),
        "this_week_km": round(this_week_km, 1),  # Real km from runs this week
        "days_to_race": max(days_to_race, 0),
        "weekly_history": weekly_history,
        "next_test": next_test
    }

@api_router.get("/training-plan")
async def get_training_plan():
    weeks = await db.training_plan.find({}, {"_id": 0}).sort("week_number", 1).to_list(100)
    return {"weeks": weeks}

@api_router.get("/training-plan/current")
async def get_current_week():
    today = date.today().isoformat()
    week = await db.training_plan.find_one(
        {"week_start": {"$lte": today}, "week_end": {"$gte": today}},
        {"_id": 0}
    )
    if not week:
        week = await db.training_plan.find_one({}, {"_id": 0}, sort=[("week_start", 1)])
    return week or {}

@api_router.get("/training-plan/week/{week_id}")
async def get_week_detail(week_id: str):
    week = await db.training_plan.find_one({"id": week_id}, {"_id": 0})
    if not week:
        raise HTTPException(404, "Settimana non trovata")
    return week

@api_router.patch("/training-plan/session/complete")
async def toggle_session_complete(req: SessionCompleteRequest):
    week = await db.training_plan.find_one({"id": req.week_id})
    if not week:
        raise HTTPException(404, "Settimana non trovata")
    sessions = week.get("sessions", [])
    if req.session_index < 0 or req.session_index >= len(sessions):
        raise HTTPException(400, "Indice sessione non valido")
    sessions[req.session_index]["completed"] = req.completed
    await db.training_plan.update_one({"id": req.week_id}, {"$set": {"sessions": sessions}})
    return {"status": "ok"}

class UpdateWeekSessionsRequest(BaseModel):
    week_start: str  # "2026-03-09"
    sessions: list
    target_km: Optional[float] = None
    notes: Optional[str] = None

@api_router.put("/training-plan/week-sessions")
async def update_week_sessions(req: UpdateWeekSessionsRequest):
    """Update all sessions for a specific week (identified by week_start date)"""
    week = await db.training_plan.find_one({"week_start": req.week_start})
    if not week:
        raise HTTPException(404, f"Settimana con inizio {req.week_start} non trovata")

    update_fields = {"sessions": req.sessions}
    if req.target_km is not None:
        update_fields["target_km"] = req.target_km
    if req.notes is not None:
        update_fields["notes"] = req.notes

    await db.training_plan.update_one(
        {"week_start": req.week_start},
        {"$set": update_fields}
    )
    updated = await db.training_plan.find_one({"week_start": req.week_start}, {"_id": 0})
    return {"status": "ok", "week": updated}

@api_router.get("/runs")
async def get_runs():
    runs = await db.runs.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    return {"runs": runs}

@api_router.get("/runs/{run_id}")
async def get_run(run_id: str):
    run = await db.runs.find_one({"id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Corsa non trovata")
    analysis = await db.ai_analyses.find_one({"run_id": run_id}, {"_id": 0})

    # Find planned session for this run's date
    planned_session = None
    run_date = run.get("date", "")
    if run_date:
        week = await db.training_plan.find_one(
            {"week_start": {"$lte": run_date}, "week_end": {"$gte": run_date}},
            {"_id": 0}
        )
        if week:
            for s in week.get("sessions", []):
                if s.get("date") == run_date:
                    planned_session = {
                        **s,
                        "week_number": week.get("week_number"),
                        "phase": week.get("phase"),
                        "phase_description": week.get("phase_description"),
                        "target_km_week": week.get("target_km"),
                        "is_recovery_week": week.get("is_recovery_week", False),
                    }
                    break

    return {"run": run, "analysis": analysis, "planned_session": planned_session}

@api_router.post("/runs")
async def create_run(run: RunCreate):
    run_dict = run.dict()
    run_dict["id"] = make_id()
    await db.runs.insert_one(run_dict)
    run_dict.pop("_id", None)
    return run_dict

@api_router.post("/ai/analyze-run")
async def analyze_run(req: AIAnalyzeRequest):
    run = await db.runs.find_one({"id": req.run_id}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Corsa non trovata")

    profile = await db.profile.find_one({}, {"_id": 0})
    run_date = run.get("date", "")

    # ── Find planned session for THIS run's date ──
    planned_week = None
    planned_session = None
    if run_date:
        planned_week = await db.training_plan.find_one(
            {"week_start": {"$lte": run_date}, "week_end": {"$gte": run_date}},
            {"_id": 0}
        )
        if planned_week:
            for s in planned_week.get("sessions", []):
                if s.get("date") == run_date:
                    planned_session = s
                    break

    recent_runs = await db.runs.find({}, {"_id": 0}).sort("date", -1).limit(10).to_list(10)

    # ── Get VDOT data ──
    vdot_val, _ = await calculate_current_vdot()
    vdot_paces = vdot_training_paces(vdot_val) if vdot_val else None

    # ── Build system message from actual profile ──
    p = profile or {}
    p_name = p.get("name", "Atleta")
    p_age = p.get("age", "N/D")
    p_weight = p.get("weight_kg", "N/D")
    p_max_hr = p.get("max_hr", "N/D")
    p_target_pace = p.get("target_pace", "4:30")
    p_target_time = p.get("target_time", "1:35:00")

    injury_block = ""
    inj = p.get("injury")
    if inj:
        injury_block = (
            f"\n- INFORTUNIO: {inj.get('type', 'N/D')} ({inj.get('date', 'N/D')}), "
            f"stato: {inj.get('status', 'N/D')}"
            f"\n- Ripresa corsa: {inj.get('running_resumed', 'N/D')}"
            f"\n- Dettagli: {inj.get('details', 'N/D')}"
        )

    pbs_block = ""
    pbs = p.get("pbs")
    if pbs:
        pbs_block = "\n\nPERSONAL BEST:"
        for dist, data in pbs.items():
            pbs_block += f"\n- {dist}: {data.get('time', 'N/D')} ({data.get('pace', 'N/D')}/km)"

    vdot_block = ""
    if vdot_val:
        vdot_block = f"\n\nVDOT ATTUALE: {vdot_val}"
        if vdot_paces:
            vdot_block += (
                f"\nPASSI DANIELS: Easy {vdot_paces.get('easy')}, "
                f"Marathon {vdot_paces.get('marathon')}, "
                f"Threshold {vdot_paces.get('threshold')}, "
                f"Interval {vdot_paces.get('interval')}, "
                f"Repetition {vdot_paces.get('repetition')}"
            )

    system_msg = f"""Sei un Head Coach di Mezzofondo esperto, specializzato nella preparazione per la Mezza Maratona.

PROFILO ATLETA:
- Nome: {p_name}, Età: {p_age} anni, Peso: {p_weight}kg
- FC massima: {p_max_hr} bpm{injury_block}
{pbs_block}
{vdot_block}

OBIETTIVO: Mezza Maratona Fuerteventura Corralejo, 12 Dicembre 2026
- Passo obiettivo: {p_target_pace}/km
- Tempo obiettivo: {p_target_time}

ISTRUZIONI FONDAMENTALI:
1. CONFRONTA la corsa effettuata con la sessione pianificata per quel giorno
2. Valuta se l'atleta ha rispettato tipo, passo target e distanza del piano
3. Analizza la FC rispetto al tipo di sessione (corsa lenta → Z2, ripetute → Z4, ecc.)
4. Dai un VERDETTO chiaro: allenamento centrato, troppo intenso, troppo blando
5. Se c'è deviazione dal piano, spiega le CONSEGUENZE (overtraining, adattamento insufficiente)
6. Suggerisci correzioni specifiche per le prossime sessioni
7. Considera sempre l'infortunio nelle raccomandazioni
8. Tono da coach: diretto, motivante, tecnico ma comprensibile, IN ITALIANO

FORMATO RISPOSTA:
📊 VERDETTO: [Allenamento centrato / Troppo intenso / Troppo blando / Deviazione dal piano]
📋 PIANO VS REALTÀ: [confronto specifico con i numeri]
💪 PUNTI POSITIVI: [cosa è andato bene]
⚠️ ATTENZIONE: [cosa migliorare o rischi]
🎯 PROSSIMA SESSIONE: [suggerimento concreto per il prossimo allenamento]"""

    # ── Build user message with plan comparison ──
    run_info = f"""CORSA DA ANALIZZARE:
- Data: {run.get('date')}
- Distanza: {run.get('distance_km')} km
- Durata: {run.get('duration_minutes')} min
- Passo medio: {run.get('avg_pace')}/km
- FC media: {run.get('avg_hr', 'N/D')} bpm ({run.get('avg_hr_pct', 'N/D')}% max)
- FC max: {run.get('max_hr', 'N/D')} bpm ({run.get('max_hr_pct', 'N/D')}% max)
- Tipo registrato: {run.get('run_type')}
- Note: {run.get('notes', 'Nessuna')}
- Luogo: {run.get('location', 'N/D')}"""

    if planned_session:
        run_info += f"""

SESSIONE PIANIFICATA PER QUESTO GIORNO:
- Tipo pianificato: {planned_session.get('type', 'N/D')}
- Titolo: {planned_session.get('title', 'N/D')}
- Descrizione: {planned_session.get('description', 'N/D')}
- Distanza target: {planned_session.get('target_distance_km', 'N/D')} km
- Passo target: {planned_session.get('target_pace', 'N/D')}/km
- Durata target: {planned_session.get('target_duration_min', 'N/D')} min"""

        # Calculate deviations
        planned_dist = planned_session.get("target_distance_km", 0) or 0
        actual_dist = run.get("distance_km", 0) or 0
        if planned_dist > 0 and actual_dist > 0:
            dist_diff_pct = round((actual_dist - planned_dist) / planned_dist * 100, 1)
            run_info += f"\n- DEVIAZIONE DISTANZA: {'+' if dist_diff_pct > 0 else ''}{dist_diff_pct}%"

        planned_pace_str = planned_session.get("target_pace", "")
        actual_pace_str = run.get("avg_pace", "")
        planned_secs = _pace_to_seconds(planned_pace_str)
        actual_secs = _pace_to_seconds(actual_pace_str)
        if planned_secs > 0 and actual_secs > 0:
            pace_diff = actual_secs - planned_secs
            direction = "più lento" if pace_diff > 0 else "più veloce"
            pace_diff_pct = round(pace_diff / planned_secs * 100, 1)
            run_info += f"\n- DEVIAZIONE PASSO: {abs(pace_diff)}s/km {direction} ({'+' if pace_diff_pct > 0 else ''}{pace_diff_pct}%)"
    else:
        run_info += "\n\nNESSUNA SESSIONE PIANIFICATA per questo giorno (corsa extra o fuori piano)."

    if planned_week:
        run_info += f"""

CONTESTO SETTIMANA:
- Settimana n. {planned_week.get('week_number')}
- Fase: {planned_week.get('phase')} — {planned_week.get('phase_description', '')}
- KM target settimana: {planned_week.get('target_km')}
- Scarico: {'Sì' if planned_week.get('is_recovery_week') else 'No'}"""

    if recent_runs:
        run_info += "\n\nULTIME 5 CORSE:"
        for r in recent_runs[:5]:
            run_info += (
                f"\n- {r.get('date')}: {r.get('distance_km')}km "
                f"a {r.get('avg_pace')}/km, FC {r.get('avg_hr', 'N/D')}bpm"
            )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"analysis-{req.run_id}",
            system_message=system_msg
        ).with_model("anthropic", "claude-4-sonnet-20250514")

        response = await chat.send_message(UserMessage(text=run_info))

        analysis_doc = {
            "id": make_id(),
            "run_id": req.run_id,
            "analysis": response,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.ai_analyses.insert_one(analysis_doc)
        analysis_doc.pop("_id", None)
        return analysis_doc
    except Exception as e:
        logger.error(f"AI Analysis error: {e}")
        raise HTTPException(500, f"Errore nell'analisi AI: {str(e)}")

@api_router.get("/tests")
async def get_tests():
    results = await db.tests.find({}, {"_id": 0}).sort("date", -1).to_list(100)
    schedule = await db.test_schedule.find({}, {"_id": 0}).sort("scheduled_date", 1).to_list(20)
    return {"results": results, "schedule": schedule}

@api_router.post("/tests")
async def create_test(test: TestCreate):
    test_dict = test.dict()
    test_dict["id"] = make_id()
    await db.tests.insert_one(test_dict)
    test_dict.pop("_id", None)
    return test_dict

@api_router.get("/supplements")
async def get_supplements_list():
    supps = await db.supplements.find({}, {"_id": 0}).to_list(50)
    return {"supplements": supps}

@api_router.get("/exercises")
async def get_exercises_list():
    exercises = await db.exercises.find({}, {"_id": 0}).to_list(50)
    return {"exercises": exercises}

@api_router.post("/runs/cleanup")
async def cleanup_duplicate_runs():
    """Remove all runs without strava_id (seed duplicates)"""
    result = await db.runs.delete_many({"strava_id": {"$exists": False}})
    result2 = await db.runs.delete_many({"strava_id": None})
    total = result.deleted_count + result2.deleted_count
    remaining = await db.runs.count_documents({})
    return {"deleted": total, "remaining": remaining}

@api_router.get("/analytics")
async def get_analytics():
    """Comprehensive analytics: VO2max, race predictions, pace/HR trends, zone distribution, goal gap"""
    import math
    runs = await db.runs.find({}, {"_id": 0}).sort("date", 1).to_list(2000)
    profile = await db.profile.find_one({}, {"_id": 0})
    max_hr = profile.get("max_hr", 179) if profile else 179

    # Filter valid runs
    valid_runs = [r for r in runs if r.get("distance_km", 0) > 0.5 and r.get("avg_pace")]

    # ---- PACE TO SECONDS HELPER ----
    def pace_str_to_secs(p):
        parts = p.split(":")
        return int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 999

    # ---- VO2MAX ESTIMATION (Jack Daniels) - POST-INJURY ONLY (2026+) ----
    # Find best efforts at different distances FROM 2026 ONLY
    post_injury_runs = [r for r in valid_runs if r.get("date", "").startswith("2026")]
    
    best_efforts_post_injury = {}
    for r in post_injury_runs:
        dist = r.get("distance_km", 0)
        pace_secs = pace_str_to_secs(r.get("avg_pace", "9:99"))

        for target_dist in [4, 5, 6, 10, 15, 21.1]:
            if abs(dist - target_dist) < 0.5:
                key = f"{target_dist}km"
                if key not in best_efforts_post_injury or pace_secs < pace_str_to_secs(best_efforts_post_injury[key]["avg_pace"]):
                    best_efforts_post_injury[key] = r
    
    # Also keep all-time best efforts for reference
    best_efforts = {}
    for r in valid_runs:
        dist = r.get("distance_km", 0)
        pace_secs = pace_str_to_secs(r.get("avg_pace", "9:99"))

        for target_dist in [4, 5, 6, 10, 15, 21.1]:
            if abs(dist - target_dist) < 0.5:
                key = f"{target_dist}km"
                if key not in best_efforts or pace_secs < pace_str_to_secs(best_efforts[key]["avg_pace"]):
                    best_efforts[key] = r

    # VO2max from best POST-INJURY effort using Daniels formula
    vo2max = None
    best_race = None
    for key in ["10km", "6km", "5km", "15km", "4km"]:
        if key in best_efforts_post_injury:
            best_race = best_efforts_post_injury[key]
            break

    if best_race:
        dist_m = best_race["distance_km"] * 1000
        time_min = best_race["duration_minutes"]
        if time_min > 0:
            velocity = dist_m / time_min  # m/min
            # Daniels VO2 formula
            pct_vo2 = 0.8 + 0.1894393 * math.exp(-0.012778 * time_min) + 0.2989558 * math.exp(-0.1932605 * time_min)
            vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity
            if pct_vo2 > 0:
                vo2max = round(vo2 / pct_vo2, 1)

    # ---- TARGET VO2MAX for 4:30/km half marathon (1:35:00 = 95 min) ----
    # Using Daniels formula backwards: need to find VO2max that allows 4:30/km
    # 4:30/km = 270 sec/km, for 21.1km = 95 min
    # velocity = 21100m / 95min = 222.1 m/min
    target_velocity = 21100 / 95.0  # m/min for 1:35:00
    target_time_min = 95.0
    # Daniels formula for VO2 at this pace
    target_vo2 = -4.60 + 0.182258 * target_velocity + 0.000104 * target_velocity * target_velocity
    # %VO2max at race distance (Daniels)
    target_pct_vo2 = 0.8 + 0.1894393 * math.exp(-0.012778 * target_time_min) + 0.2989558 * math.exp(-0.1932605 * target_time_min)
    vo2max_target = round(target_vo2 / target_pct_vo2, 1) if target_pct_vo2 > 0 else None

    # ---- RACE PREDICTIONS (Riegel formula) - POST-INJURY ONLY ----
    race_predictions = {}
    ref_run = best_efforts_post_injury.get("10km") or best_efforts_post_injury.get("6km") or best_efforts_post_injury.get("5km") or best_efforts_post_injury.get("4km")
    if ref_run:
        ref_dist = ref_run["distance_km"]
        ref_time_min = ref_run["duration_minutes"]
        ref_pace = ref_run.get("avg_pace", "N/A")
        ref_date = ref_run.get("date", "N/A")
        for target_name, target_km in [("5km", 5), ("10km", 10), ("21.1km", 21.1)]:
            pred_time = ref_time_min * (target_km / ref_dist) ** 1.06
            pred_pace_s = (pred_time * 60) / target_km
            pred_pace = f"{int(pred_pace_s // 60)}:{int(pred_pace_s % 60):02d}"
            race_predictions[target_name] = {
                "predicted_time_min": round(pred_time, 1),
                "predicted_time_str": f"{int(pred_time // 60)}:{int(pred_time % 60):02d}:{int((pred_time % 1) * 60):02d}",
                "predicted_pace": pred_pace,
                "based_on": f"{ref_dist}km del {ref_date} ({ref_pace}/km)"
            }

    # Target half marathon: 4:30/km = 94:55
    target_hm_time = 95.0
    current_hm_pred = race_predictions.get("21.1km", {}).get("predicted_time_min", 999)
    goal_gap_min = round(current_hm_pred - target_hm_time, 1)
    goal_progress_pct = min(100, max(0, round((target_hm_time / max(current_hm_pred, 1)) * 100)))

    # ---- MONTHLY PACE TREND ----
    monthly_data = {}
    for r in valid_runs:
        month_key = r["date"][:7]  # YYYY-MM
        if month_key not in monthly_data:
            monthly_data[month_key] = {"paces": [], "hrs": [], "kms": 0, "count": 0}
        monthly_data[month_key]["paces"].append(pace_str_to_secs(r.get("avg_pace", "9:99")))
        if r.get("avg_hr"):
            monthly_data[month_key]["hrs"].append(r["avg_hr"])
        monthly_data[month_key]["kms"] += r.get("distance_km", 0)
        monthly_data[month_key]["count"] += 1

    pace_trend = []
    hr_trend = []
    volume_trend = []
    for month in sorted(monthly_data.keys()):
        d = monthly_data[month]
        avg_pace_s = sum(d["paces"]) / len(d["paces"])
        pace_trend.append({
            "month": month,
            "avg_pace": f"{int(avg_pace_s // 60)}:{int(avg_pace_s % 60):02d}",
            "avg_pace_secs": round(avg_pace_s),
        })
        if d["hrs"]:
            avg_hr = sum(d["hrs"]) / len(d["hrs"])
            hr_trend.append({"month": month, "avg_hr": round(avg_hr, 1)})
        volume_trend.append({"month": month, "total_km": round(d["kms"], 1), "runs": d["count"]})

    # ---- WEEKLY VOLUME (last 16 weeks) ----
    from datetime import datetime, timedelta, date, timezone
    today = date.today()
    weekly_volume = []
    for w in range(15, -1, -1):
        week_start = today - timedelta(days=today.weekday() + 7 * w)
        week_end = week_start + timedelta(days=6)
        ws = week_start.isoformat()
        we = week_end.isoformat()
        week_km = sum(r.get("distance_km", 0) for r in valid_runs if ws <= r.get("date", "") <= we)
        week_runs = sum(1 for r in valid_runs if ws <= r.get("date", "") <= we)
        weekly_volume.append({"week_start": ws, "km": round(week_km, 1), "runs": week_runs})

    # ---- HR ZONE DISTRIBUTION with CUSTOM BPM ranges (user's actual zones) ----
    user_max_hr = 180  # User's actual max HR
    zone_definitions = [
        {"zone": "Z1", "name": "Recupero", "bpm_min": 0, "bpm_max": 117},
        {"zone": "Z2", "name": "Resistenza", "bpm_min": 118, "bpm_max": 146},
        {"zone": "Z3", "name": "Ritmo", "bpm_min": 147, "bpm_max": 160},
        {"zone": "Z4", "name": "Soglia", "bpm_min": 161, "bpm_max": 175},
        {"zone": "Z5", "name": "Anaerobico", "bpm_min": 176, "bpm_max": 200},
    ]
    
    zone_counts = {"Z1": 0, "Z2": 0, "Z3": 0, "Z4": 0, "Z5": 0}
    total_hr_runs = 0
    for r in valid_runs:
        avg_hr = r.get("avg_hr")
        if avg_hr:
            total_hr_runs += 1
            if avg_hr <= 117:
                zone_counts["Z1"] += 1
            elif avg_hr <= 146:
                zone_counts["Z2"] += 1
            elif avg_hr <= 160:
                zone_counts["Z3"] += 1
            elif avg_hr <= 175:
                zone_counts["Z4"] += 1
            else:
                zone_counts["Z5"] += 1

    zone_distribution = []
    for zdef in zone_definitions:
        z = zdef["zone"]
        count = zone_counts[z]
        pct = round((count / max(total_hr_runs, 1)) * 100)
        zone_distribution.append({
            "zone": z, 
            "name": zdef["name"],
            "count": count, 
            "percentage": pct,
            "bpm_min": zdef["bpm_min"],
            "bpm_max": zdef["bpm_max"],
        })

    # ---- ANAEROBIC THRESHOLD ESTIMATE (Current and Pre-Injury) ----
    # AT typically at ~85-88% of max HR
    # Pre-injury data: November 21, 2025 - 6km test at 4:20/km with HR 149 avg
    pre_injury_at = {
        "hr": 149,
        "pace": "4:20",
        "date": "2025-11-21",
        "note": "Test 6km pre-infortunio"
    }
    
    # Current AT from tempo/threshold runs (fastest runs with HR data > 20min, post-injury 2026+)
    threshold_runs = [r for r in valid_runs if r.get("avg_hr") and r.get("duration_minutes", 0) > 20 and pace_str_to_secs(r.get("avg_pace", "9:99")) < 360 and r.get("date", "").startswith("2026")]
    at_hr = None
    at_pace = None
    if threshold_runs:
        sorted_by_pace = sorted(threshold_runs, key=lambda r: pace_str_to_secs(r.get("avg_pace", "9:99")))
        top_efforts = sorted_by_pace[:5]
        at_hr = round(sum(r["avg_hr"] for r in top_efforts) / len(top_efforts))
        avg_pace_s = sum(pace_str_to_secs(r["avg_pace"]) for r in top_efforts) / len(top_efforts)
        at_pace = f"{int(avg_pace_s // 60)}:{int(avg_pace_s % 60):02d}"
    
    current_at = {"hr": at_hr, "pace": at_pace} if at_hr else None

    # ---- ANAEROBIC THRESHOLD HISTORY (every 15 days) ----
    # Track: for runs at similar HR (~150bpm), what pace can you maintain?
    # This shows fitness progression: same HR effort -> faster pace = improvement
    at_history = []
    history_start = date(2025, 11, 1)
    period_days = 15
    current_period_start = history_start
    target_hr_range = (140, 160)  # Zone 3-4 HR range for comparison
    
    while current_period_start <= today:
        period_end = current_period_start + timedelta(days=period_days - 1)
        period_start_str = current_period_start.isoformat()
        period_end_str = period_end.isoformat()
        
        # Get runs in this period with HR in target range (140-160 bpm)
        period_runs = [
            r for r in valid_runs 
            if r.get("avg_hr") 
            and target_hr_range[0] <= r.get("avg_hr", 0) <= target_hr_range[1]
            and r.get("duration_minutes", 0) > 15 
            and period_start_str <= r.get("date", "") <= period_end_str
        ]
        
        if period_runs:
            # Average pace at similar HR effort
            avg_hr = round(sum(r["avg_hr"] for r in period_runs) / len(period_runs))
            pace_secs_list = [pace_str_to_secs(r["avg_pace"]) for r in period_runs]
            avg_pace_secs = sum(pace_secs_list) / len(pace_secs_list)
            avg_pace = f"{int(avg_pace_secs // 60)}:{int(avg_pace_secs % 60):02d}"
            
            # Find best pace in period at this HR
            best_pace_secs = min(pace_secs_list)
            best_pace = f"{int(best_pace_secs // 60)}:{int(best_pace_secs % 60):02d}"
            
            at_history.append({
                "period_start": period_start_str,
                "period_end": period_end_str,
                "avg_hr": avg_hr,
                "avg_pace": avg_pace,
                "best_pace": best_pace,
                "pace_secs": round(avg_pace_secs),
                "runs_count": len(period_runs),
                "label": f"{current_period_start.strftime('%d %b')}"
            })
        
        current_period_start += timedelta(days=period_days)

    # ---- SUMMARY STATS ----
    total_km = round(sum(r.get("distance_km", 0) for r in valid_runs), 1)
    total_time = round(sum(r.get("duration_minutes", 0) for r in valid_runs), 1)
    total_runs = len(valid_runs)

    last_30_days = [(today - timedelta(days=i)).isoformat() for i in range(30)]
    recent_runs = [r for r in valid_runs if r.get("date", "") >= last_30_days[-1]]
    recent_km = round(sum(r.get("distance_km", 0) for r in recent_runs), 1)

    return {
        "vo2max": vo2max,
        "vo2max_target": vo2max_target,
        "user_max_hr": user_max_hr,
        "race_predictions": race_predictions,
        "goal_gap_min": goal_gap_min,
        "goal_progress_pct": goal_progress_pct,
        "target_hm_time_str": "1:35:00",
        "current_hm_pred_str": race_predictions.get("21.1km", {}).get("predicted_time_str", "N/D"),
        "weekly_volume": weekly_volume,
        "zone_distribution": zone_distribution,
        "anaerobic_threshold": {
            "current": current_at,
            "pre_injury": pre_injury_at,
            "history": at_history  # Every 15 days history for progress tracking
        },
        "best_efforts": {k: {"distance": v["distance_km"], "pace": v["avg_pace"], "time": v["duration_minutes"], "date": v["date"], "avg_hr": v.get("avg_hr"), "max_hr": v.get("max_hr")} for k, v in best_efforts.items()},
        "totals": {"total_km": total_km, "total_time_hours": round(total_time / 60, 1), "total_runs": total_runs, "recent_30d_km": recent_km},
    }

@api_router.post("/training-plan/adapt")
async def adapt_training_plan():
    """Analyze progress and adapt the training plan to be more aggressive if improving"""
    runs = await db.runs.find({}, {"_id": 0}).to_list(2000)
    today = date.today()
    
    # Get runs from last 4 weeks
    four_weeks_ago = (today - timedelta(days=28)).isoformat()
    recent_runs = [r for r in runs if r.get("date", "") >= four_weeks_ago and r.get("avg_pace")]
    
    if len(recent_runs) < 5:
        return {"adapted": False, "message": "Non abbastanza corse recenti per valutare i progressi (minimo 5)", "recommendation": None}
    
    # Calculate average pace from recent runs
    def pace_to_secs(pace_str):
        if not pace_str or ':' not in pace_str:
            return 999
        parts = pace_str.split(':')
        return int(parts[0]) * 60 + int(parts[1])
    
    recent_paces = [pace_to_secs(r["avg_pace"]) for r in recent_runs]
    avg_recent_pace = sum(recent_paces) / len(recent_paces)
    
    # Get runs from 4-8 weeks ago for comparison
    eight_weeks_ago = (today - timedelta(days=56)).isoformat()
    older_runs = [r for r in runs if eight_weeks_ago <= r.get("date", "") < four_weeks_ago and r.get("avg_pace")]
    
    improvement_detected = False
    improvement_pct = 0
    recommendation = "standard"
    
    if len(older_runs) >= 3:
        older_paces = [pace_to_secs(r["avg_pace"]) for r in older_runs]
        avg_older_pace = sum(older_paces) / len(older_paces)
        
        # Calculate improvement (lower pace = better)
        if avg_older_pace > 0:
            improvement_pct = round(((avg_older_pace - avg_recent_pace) / avg_older_pace) * 100, 1)
            improvement_detected = improvement_pct > 2  # More than 2% faster
    
    # Analyze training consistency
    recent_volume = sum(r.get("distance_km", 0) for r in recent_runs)
    weeks_count = max(len(set(r.get("date", "")[:10] for r in recent_runs)) / 7, 1)
    weekly_avg_km = recent_volume / max(weeks_count, 1)
    
    # Determine recommendation
    if improvement_detected and improvement_pct > 5:
        recommendation = "aggressive"
        adjustment_factor = 1.15  # 15% more volume
        message = f"Ottimi progressi! Passo migliorato del {improvement_pct}%. Piano reso più aggressivo."
    elif improvement_detected and improvement_pct > 2:
        recommendation = "moderate_increase"
        adjustment_factor = 1.08  # 8% more volume
        message = f"Buoni progressi! Passo migliorato del {improvement_pct}%. Piano leggermente intensificato."
    elif improvement_pct < -3:
        recommendation = "reduce"
        adjustment_factor = 0.90  # 10% less volume
        message = f"Attenzione: passo rallentato del {abs(improvement_pct)}%. Piano alleggerito per favorire il recupero."
    else:
        recommendation = "standard"
        adjustment_factor = 1.0
        message = "Progressi nella norma. Piano confermato senza modifiche."
    
    # Apply adaptation to future weeks
    if recommendation != "standard":
        current_plan = await db.training_plan.find({"week_start": {"$gte": today.isoformat()}}, {"_id": 0}).to_list(100)
        adapted_weeks = 0
        
        for week in current_plan:
            new_target_km = round(week.get("target_km", 40) * adjustment_factor, 1)
            # Cap maximum weekly volume at 65km
            new_target_km = min(new_target_km, 65)
            
            # Update sessions
            new_sessions = []
            for session in week.get("sessions", []):
                new_session = session.copy()
                if session.get("target_distance_km"):
                    new_dist = round(session["target_distance_km"] * adjustment_factor, 1)
                    new_session["target_distance_km"] = min(new_dist, 24)  # Max 24km for long runs
                
                # Adjust pace targets if improving significantly
                if improvement_detected and improvement_pct > 5 and session.get("target_pace"):
                    current_pace_secs = pace_to_secs(session["target_pace"])
                    new_pace_secs = current_pace_secs * 0.97  # 3% faster target
                    new_pace = f"{int(new_pace_secs // 60)}:{int(new_pace_secs % 60):02d}"
                    new_session["target_pace"] = new_pace
                
                new_sessions.append(new_session)
            
            await db.training_plan.update_one(
                {"id": week["id"]},
                {"$set": {"target_km": new_target_km, "sessions": new_sessions, "adapted": True}}
            )
            adapted_weeks += 1
    
    return {
        "adapted": recommendation != "standard",
        "recommendation": recommendation,
        "adjustment_factor": adjustment_factor if recommendation != "standard" else 1.0,
        "improvement_pct": improvement_pct,
        "recent_avg_pace_secs": round(avg_recent_pace),
        "recent_volume_km": round(recent_volume, 1),
        "weekly_avg_km": round(weekly_avg_km, 1),
        "message": message,
        "adapted_weeks": adapted_weeks if recommendation != "standard" else 0
    }

@api_router.get("/training-plan/adaptation-status")
async def get_adaptation_status():
    """Check current adaptation status and provide recommendation"""
    runs = await db.runs.find({}, {"_id": 0}).to_list(2000)
    today = date.today()
    
    # Calculate metrics for UI display
    four_weeks_ago = (today - timedelta(days=28)).isoformat()
    recent_runs = [r for r in runs if r.get("date", "") >= four_weeks_ago and r.get("avg_pace")]
    
    def pace_to_secs(pace_str):
        if not pace_str or ':' not in pace_str:
            return 999
        parts = pace_str.split(':')
        return int(parts[0]) * 60 + int(parts[1])
    
    if len(recent_runs) < 3:
        return {
            "can_adapt": False,
            "reason": "Servono almeno 3 corse nelle ultime 4 settimane",
            "recent_runs_count": len(recent_runs),
            "suggestion": None
        }
    
    recent_paces = [pace_to_secs(r["avg_pace"]) for r in recent_runs]
    avg_recent_pace = sum(recent_paces) / len(recent_paces)
    avg_pace_str = f"{int(avg_recent_pace // 60)}:{int(avg_recent_pace % 60):02d}"
    
    # Compare with older runs
    eight_weeks_ago = (today - timedelta(days=56)).isoformat()
    older_runs = [r for r in runs if eight_weeks_ago <= r.get("date", "") < four_weeks_ago and r.get("avg_pace")]
    
    improvement_pct = 0
    suggestion = "standard"
    
    if len(older_runs) >= 3:
        older_paces = [pace_to_secs(r["avg_pace"]) for r in older_runs]
        avg_older_pace = sum(older_paces) / len(older_paces)
        
        if avg_older_pace > 0:
            improvement_pct = round(((avg_older_pace - avg_recent_pace) / avg_older_pace) * 100, 1)
            
            if improvement_pct > 5:
                suggestion = "aggressive"
            elif improvement_pct > 2:
                suggestion = "moderate_increase"
            elif improvement_pct < -3:
                suggestion = "reduce"
    
    return {
        "can_adapt": True,
        "recent_runs_count": len(recent_runs),
        "avg_recent_pace": avg_pace_str,
        "improvement_pct": improvement_pct,
        "suggestion": suggestion,
        "suggestion_label": {
            "aggressive": "Aumenta intensità (+15%)",
            "moderate_increase": "Aumenta leggermente (+8%)",
            "reduce": "Riduci carico (-10%)",
            "standard": "Mantieni piano attuale"
        }.get(suggestion, "Mantieni piano attuale")
    }

@api_router.get("/vdot/paces")
async def get_vdot_paces():
    """Get current VDOT and all Daniels training paces."""
    vdot, best_effort = await calculate_current_vdot()
    if vdot is None:
        return {
            "vdot": None,
            "paces": None,
            "message": "Non ci sono abbastanza dati per calcolare il VDOT. Completa un test o una gara nel 2026."
        }
    paces = vdot_training_paces(vdot)
    based_on = ""
    if best_effort:
        dist = best_effort["distance_km"]
        pace = best_effort.get("avg_pace", "?")
        dt = best_effort.get("date", "?")
        dur = best_effort.get("duration_minutes", 0)
        mins = int(dur)
        secs = int((dur - mins) * 60)
        based_on = f"{dist}km in {mins}:{secs:02d} a {pace}/km ({dt})"
    return {
        "vdot": vdot,
        "paces": paces,
        "based_on": based_on,
    }

@api_router.post("/training-plan/recalculate-paces")
async def recalculate_plan_paces():
    """Recalculate all future training plan paces based on current VDOT."""
    vdot, best_effort = await calculate_current_vdot()
    if vdot is None:
        return {"recalculated": False, "message": "VDOT non disponibile. Completa un test o una gara."}

    paces = vdot_training_paces(vdot)
    today = date.today()
    future_weeks = await db.training_plan.find(
        {"week_start": {"$gte": today.isoformat()}}, {"_id": 0}
    ).to_list(200)

    updated_weeks = 0
    for week in future_weeks:
        new_sessions = []
        changed = False
        for session in week.get("sessions", []):
            new_session = session.copy()
            session_type = session.get("type", "")
            daniels_zone = SESSION_PACE_ZONE.get(session_type)

            if daniels_zone and session.get("target_pace") and session["target_pace"] != "max":
                new_pace = paces[daniels_zone]
                if new_session["target_pace"] != new_pace:
                    new_session["target_pace"] = new_pace
                    changed = True

            new_sessions.append(new_session)

        if changed:
            await db.training_plan.update_one(
                {"id": week["id"]},
                {"$set": {
                    "sessions": new_sessions,
                    "vdot_based": True,
                    "vdot_value": vdot,
                }}
            )
            updated_weeks += 1

    return {
        "recalculated": True,
        "vdot": vdot,
        "paces": paces,
        "updated_weeks": updated_weeks,
        "message": f"Ricalcolati i passi di {updated_weeks} settimane con VDOT {vdot}. Easy: {paces['easy']}, Threshold: {paces['threshold']}, Interval: {paces['interval']}/km.",
    }

@api_router.get("/profile")
async def get_profile_data():
    profile = await db.profile.find_one({}, {"_id": 0})
    return profile or {}

@api_router.patch("/profile")
async def update_profile(req: ProfileUpdateRequest):
    update_fields = {}
    if req.age is not None:
        update_fields["age"] = req.age
    if req.weight_kg is not None:
        update_fields["weight_kg"] = req.weight_kg
    if req.max_hr is not None:
        update_fields["max_hr"] = req.max_hr
    if req.max_weekly_km is not None:
        update_fields["max_weekly_km"] = req.max_weekly_km
    if not update_fields:
        raise HTTPException(400, "Nessun campo da aggiornare")
    await db.profile.update_one({}, {"$set": update_fields})
    profile = await db.profile.find_one({}, {"_id": 0})
    return profile or {}

@api_router.get("/medals")
async def get_medals():
    """Get medals with 6 levels: warmup, bronzo, argento, oro, platino, elite"""
    profile = await db.profile.find_one({}, {"_id": 0})
    medals = profile.get("medals", {}) if profile else {}
    runs = await db.runs.find({}, {"_id": 0}).to_list(2000)
    
    def time_str_to_secs(time_str):
        """Convert time string (mm:ss or h:mm:ss) to seconds"""
        if not time_str:
            return 99999
        parts = time_str.split(":")
        if len(parts) == 3:  # h:mm:ss
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:  # mm:ss
            return int(parts[0]) * 60 + int(parts[1])
        return 99999
    
    medal_levels = ["warmup", "bronzo", "argento", "oro", "platino", "elite"]
    
    for dist_key, medal_info in medals.items():
        dist_km = float(dist_key.replace("km", ""))
        targets = medal_info.get("targets", {})
        
        # Find best time for this distance
        best_time_secs = None
        best_run = None
        for run in runs:
            if abs(run.get("distance_km", 0) - dist_km) < 0.5:
                run_secs = run.get("duration_minutes", 9999) * 60
                if best_time_secs is None or run_secs < best_time_secs:
                    best_time_secs = run_secs
                    best_run = run
        
        if best_time_secs is None:
            medal_info["status"] = "locked"
            medal_info["next_target"] = targets.get("warmup")
            medal_info["best_time_str"] = None
            continue
        
        # Determine current medal level
        achieved_level = None
        next_level = None
        for i, level in enumerate(medal_levels):
            target = targets.get(level)
            if target:
                target_secs = time_str_to_secs(target.get("time"))
                if best_time_secs <= target_secs:
                    achieved_level = level
                elif achieved_level and not next_level:
                    next_level = level
        
        medal_info["status"] = achieved_level or "warmup"
        medal_info["best_time_secs"] = round(best_time_secs)
        medal_info["best_time_str"] = f"{int(best_time_secs//60)}:{int(best_time_secs%60):02d}" if best_time_secs < 3600 else f"{int(best_time_secs//3600)}:{int((best_time_secs%3600)//60):02d}:{int(best_time_secs%60):02d}"
        # Add pace from best run
        medal_info["best_pace"] = best_run.get("avg_pace") if best_run else None
        
        # Calculate gap to next level
        if next_level and targets.get(next_level):
            next_target_secs = time_str_to_secs(targets[next_level].get("time"))
            medal_info["gap_to_next_secs"] = round(best_time_secs - next_target_secs)
            medal_info["next_target"] = targets[next_level]
            medal_info["next_level"] = next_level
        elif achieved_level == "elite":
            medal_info["next_level"] = None
            medal_info["next_target"] = None
        else:
            # Find first unachieved level
            for level in medal_levels:
                target = targets.get(level)
                if target:
                    target_secs = time_str_to_secs(target.get("time"))
                    if best_time_secs > target_secs:
                        medal_info["next_level"] = level
                        medal_info["next_target"] = target
                        medal_info["gap_to_next_secs"] = round(best_time_secs - target_secs)
                        break
    
    return {"medals": medals, "levels": medal_levels}

# ====== STRAVA INTEGRATION ======

import httpx

class StravaCodeRequest(BaseModel):
    code: str

@api_router.get("/strava/auth-url")
async def get_strava_auth_url():
    """Return the Strava OAuth URL for authorizing with activity:read_all scope"""
    redirect_uri = "corralejo://strava-callback"
    url = (
        f"https://www.strava.com/oauth/authorize"
        f"?client_id={STRAVA_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={redirect_uri}"
        f"&approval_prompt=force"
        f"&scope=read,activity:read_all"
    )
    return {"url": url, "redirect_uri": redirect_uri}

@api_router.post("/strava/exchange-code")
async def exchange_strava_code(req: StravaCodeRequest):
    """Exchange authorization code for access/refresh tokens with activity:read_all scope"""
    logger.info(f"Exchanging Strava code: {req.code[:10]}...")
    async with httpx.AsyncClient() as http:
        resp = await http.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "code": req.code,
                "grant_type": "authorization_code",
            }
        )
        if resp.status_code != 200:
            logger.error(f"Strava code exchange failed: {resp.status_code} {resp.text}")
            raise HTTPException(resp.status_code, f"Scambio codice fallito: {resp.text}")

        data = resp.json()
        new_tokens = {
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "expires_at": data["expires_at"],
            "token_type": data.get("token_type", "Bearer"),
            "scope": "activity:read_all",
        }
        await db.strava_tokens.delete_many({})
        await db.strava_tokens.insert_one({**new_tokens})
        logger.info(f"Strava code exchanged successfully, new token expires_at={new_tokens['expires_at']}")

        athlete = data.get("athlete", {})
        return {
            "success": True,
            "athlete": f"{athlete.get('firstname', '')} {athlete.get('lastname', '')}",
            "scope": "activity:read_all",
            "message": "Autorizzazione completata! Ora puoi sincronizzare le attività."
        }

async def get_strava_tokens():
    """Get current Strava tokens from DB, or use initial ones from .env"""
    tokens = await db.strava_tokens.find_one({}, {"_id": 0})
    if tokens:
        return tokens
    return {
        "access_token": STRAVA_INITIAL_ACCESS_TOKEN,
        "refresh_token": STRAVA_INITIAL_REFRESH_TOKEN,
        "expires_at": 0
    }

async def refresh_strava_token():
    """Refresh Strava access token using refresh_token"""
    tokens = await get_strava_tokens()
    refresh_token = tokens.get("refresh_token", STRAVA_INITIAL_REFRESH_TOKEN)

    logger.info(f"Refreshing Strava token with client_id={STRAVA_CLIENT_ID}")
    async with httpx.AsyncClient() as http:
        resp = await http.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            }
        )
        if resp.status_code != 200:
            logger.error(f"Strava refresh failed: {resp.status_code} {resp.text}")
            raise HTTPException(401, f"Refresh token fallito: {resp.text}")

        data = resp.json()
        new_tokens = {
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "expires_at": data["expires_at"],
            "token_type": data.get("token_type", "Bearer"),
        }
        await db.strava_tokens.delete_many({})
        await db.strava_tokens.insert_one({**new_tokens})
        logger.info(f"Strava token refreshed, expires_at={new_tokens['expires_at']}")
        return new_tokens

async def get_valid_strava_token():
    """Get a valid (non-expired) Strava access token, refreshing if needed"""
    import time
    tokens = await get_strava_tokens()
    expires_at = tokens.get("expires_at", 0)

    if time.time() >= expires_at - 60:
        logger.info("Strava token expired or about to expire, refreshing...")
        tokens = await refresh_strava_token()

    return tokens["access_token"]

@api_router.get("/strava/profile")
async def get_strava_profile():
    try:
        token = await get_valid_strava_token()
        async with httpx.AsyncClient() as http:
            resp = await http.get(
                "https://www.strava.com/api/v3/athlete",
                headers={"Authorization": f"Bearer {token}"}
            )
            if resp.status_code == 401:
                token = (await refresh_strava_token())["access_token"]
                resp = await http.get(
                    "https://www.strava.com/api/v3/athlete",
                    headers={"Authorization": f"Bearer {token}"}
                )
            if resp.status_code != 200:
                raise HTTPException(resp.status_code, f"Errore Strava: {resp.text}")
            data = resp.json()
            return {
                "id": data.get("id"),
                "name": f"{data.get('firstname', '')} {data.get('lastname', '')}",
                "username": data.get("username"),
                "profile_image": data.get("profile"),
                "weight": data.get("weight"),
                "premium": data.get("premium"),
                "connected": True
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Strava profile error: {e}")
        raise HTTPException(500, f"Errore connessione Strava: {str(e)}")

@api_router.get("/strava/activities")
async def get_strava_activities(per_page: int = 200):
    try:
        token = await get_valid_strava_token()
        all_activities = []
        page = 1

        async with httpx.AsyncClient(timeout=30) as http:
            while True:
                resp = await http.get(
                    "https://www.strava.com/api/v3/athlete/activities",
                    headers={"Authorization": f"Bearer {token}"},
                    params={"per_page": per_page, "page": page}
                )
                if resp.status_code == 401:
                    token = (await refresh_strava_token())["access_token"]
                    resp = await http.get(
                        "https://www.strava.com/api/v3/athlete/activities",
                        headers={"Authorization": f"Bearer {token}"},
                        params={"per_page": per_page, "page": page}
                    )
                if resp.status_code != 200:
                    if not all_activities:
                        return {"activities": [], "error": f"Errore Strava: {resp.status_code} - {resp.text}", "needs_reauth": resp.status_code == 401}
                    break

                raw = resp.json()
                if not raw:
                    break

                for a in raw:
                    if a.get("type") != "Run":
                        continue
                    dist_km = round(a.get("distance", 0) / 1000, 2)
                    if dist_km < 0.5:
                        continue
                    time_min = round(a.get("moving_time", 0) / 60, 2)
                    pace_s = a.get("moving_time", 0) / max(dist_km, 0.01)
                    pace = f"{int(pace_s // 60)}:{int(pace_s % 60):02d}"
                    all_activities.append({
                        "strava_id": a.get("id"),
                        "name": a.get("name", ""),
                        "date": a.get("start_date_local", "")[:10],
                        "distance_km": dist_km,
                        "duration_minutes": time_min,
                        "avg_pace": pace,
                        "avg_hr": a.get("average_heartrate"),
                        "max_hr": a.get("max_heartrate"),
                        "elevation_gain": a.get("total_elevation_gain"),
                    })

                if len(raw) < per_page:
                    break
                page += 1

        logger.info(f"Strava: fetched {len(all_activities)} running activities across {page} pages")
        return {"activities": all_activities, "total": len(all_activities), "needs_reauth": False}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Strava activities error: {e}")
        return {"activities": [], "error": str(e), "needs_reauth": False}

@api_router.post("/strava/sync")
async def sync_strava_activities():
    strava_data = await get_strava_activities()
    if strava_data.get("needs_reauth"):
        return {"synced": 0, "message": strava_data.get("error"), "needs_reauth": True}

    activities = strava_data.get("activities", [])
    if not activities and strava_data.get("error"):
        return {"synced": 0, "message": strava_data.get("error"), "needs_reauth": False}

    synced = 0
    matched = 0
    for act in activities:
        existing = await db.runs.find_one({"strava_id": act.get("strava_id")})
        if existing:
            continue

        date_match = await db.runs.find_one({
            "date": act["date"],
            "distance_km": {"$gte": act["distance_km"] - 0.3, "$lte": act["distance_km"] + 0.3}
        })
        if date_match:
            await db.runs.update_one(
                {"id": date_match["id"]},
                {"$set": {"strava_id": act.get("strava_id"), "notes": (date_match.get("notes", "") or "") + f" [Strava: {act.get('name', '')}]"}}
            )
            matched += 1
            continue

        run_doc = {
            "id": make_id(),
            "date": act["date"],
            "distance_km": act["distance_km"],
            "duration_minutes": act["duration_minutes"],
            "avg_pace": act["avg_pace"],
            "avg_hr": round(act["avg_hr"]) if act.get("avg_hr") else None,
            "max_hr": round(act["max_hr"]) if act.get("max_hr") else None,
            "avg_hr_pct": round((act["avg_hr"] / 179) * 100) if act.get("avg_hr") else None,
            "max_hr_pct": round((act["max_hr"] / 179) * 100) if act.get("max_hr") else None,
            "run_type": "easy",
            "notes": f"Importata da Strava: {act.get('name', '')}",
            "location": None,
            "strava_id": act.get("strava_id")
        }
        await db.runs.insert_one(run_doc)
        synced += 1

    # ---- AUTO UPDATE PERSONAL BESTS AND MEDALS ----
    # This runs after every sync to ensure PBs and medals are always up to date
    adaptation_result = None
    if synced > 0 or matched > 0:
        await update_personal_bests_and_medals()
        # ---- AUTO ADAPT TRAINING PLAN ----
        try:
            adaptation_result = await auto_adapt_plan()
            if adaptation_result and adaptation_result.get("adapted"):
                logger.info(f"Auto-adaptation after sync: {adaptation_result.get('adaptation_type')} — {adaptation_result.get('message')}")
        except Exception as e:
            logger.error(f"Auto-adaptation error after sync: {e}")
            adaptation_result = {"adapted": False, "message": f"Errore durante l'adattamento: {str(e)}"}

    sync_message = f"Sincronizzate {synced} nuove corse, {matched} abbinate a corse esistenti"

    return {
        "synced": synced,
        "matched": matched,
        "total_strava": len(activities),
        "message": sync_message,
        "needs_reauth": False,
        "adaptation": adaptation_result,
    }

async def update_personal_bests_and_medals():
    """Update personal bests and medals based on current runs data"""
    runs = await db.runs.find({}, {"_id": 0}).to_list(2000)
    profile = await db.profile.find_one({}, {"_id": 0})
    if not profile:
        return
    
    # Distance targets for PBs
    pb_distances = {
        "4km": 4.0, "5km": 5.0, "6km": 6.0, "10km": 10.0, "15km": 15.0, "21.1km": 21.1
    }
    
    new_pbs = {}
    for dist_name, dist_km in pb_distances.items():
        best_run = None
        best_time = float('inf')
        for r in runs:
            run_dist = r.get("distance_km", 0)
            if abs(run_dist - dist_km) < 0.5:  # Within 500m of target
                run_time = r.get("duration_minutes", float('inf'))
                if run_time < best_time:
                    best_time = run_time
                    best_run = r
        
        if best_run:
            mins = int(best_time)
            secs = int((best_time - mins) * 60)
            if mins >= 60:
                hours = mins // 60
                mins = mins % 60
                time_str = f"{hours}:{mins:02d}:{secs:02d}"
            else:
                time_str = f"{mins}:{secs:02d}"
            
            new_pbs[dist_name] = {
                "time": time_str,
                "pace": best_run.get("avg_pace", "N/A"),
                "date": best_run.get("date", "N/A")
            }
    
    # Update profile with new PBs
    if new_pbs:
        await db.profile.update_one({}, {"$set": {"pbs": new_pbs}})
    
    logger.info(f"Updated {len(new_pbs)} personal bests after sync")


async def auto_adapt_plan():
    """Automatically adapt future training plan based on recent run performance vs targets.
    Called after every Strava sync that imports new runs."""

    def pace_to_secs(pace_str):
        if not pace_str or ':' not in pace_str:
            return None
        parts = pace_str.split(':')
        try:
            return int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            return None

    def secs_to_pace(secs):
        secs = max(int(round(secs)), 0)
        return f"{secs // 60}:{secs % 60:02d}"

    today = date.today()
    two_weeks_ago = (today - timedelta(days=14)).isoformat()

    # Step A: Get recent runs and all training weeks
    runs = await db.runs.find(
        {"date": {"$gte": two_weeks_ago}}, {"_id": 0}
    ).to_list(200)

    if not runs:
        return {"adapted": False, "adaptation_type": "none", "message": "Nessuna corsa recente da analizzare."}

    all_weeks = await db.training_plan.find({}, {"_id": 0}).to_list(200)

    # Build a lookup: date -> list of planned sessions (with their week and index)
    planned_by_date = {}
    for week in all_weeks:
        for idx, session in enumerate(week.get("sessions", [])):
            session_date = session.get("date", "")
            if session_date:
                planned_by_date.setdefault(session_date, []).append({
                    "session": session,
                    "week_id": week["id"],
                    "session_index": idx,
                })

    # Step B: Match runs to planned sessions and compute deviations
    comparisons = []
    for run in runs:
        run_date = run.get("date", "")
        run_pace_secs = pace_to_secs(run.get("avg_pace"))
        run_hr = run.get("avg_hr")
        if not run_date or run_pace_secs is None:
            continue

        planned_sessions = planned_by_date.get(run_date, [])
        if not planned_sessions:
            continue

        # Pick the first session with a target_pace for this date
        matched = None
        for p in planned_sessions:
            if p["session"].get("target_pace"):
                matched = p
                break
        if not matched:
            continue

        target_pace_secs = pace_to_secs(matched["session"]["target_pace"])
        if target_pace_secs is None or target_pace_secs == 0:
            continue

        # pace_diff_pct > 0 means runner was FASTER than target
        pace_diff_pct = ((target_pace_secs - run_pace_secs) / target_pace_secs) * 100

        # HR analysis: check if effort was appropriate for the session type
        session_type = matched["session"].get("type", "")
        hr_zone = SESSION_TYPE_HR_ZONES.get(session_type)
        hr_appropriate = True  # default if no HR data
        if run_hr and hr_zone:
            # HR is appropriate if within zone or below zone+5bpm tolerance
            hr_appropriate = run_hr <= (hr_zone["max_hr"] + 5)

        comparisons.append({
            "run_date": run_date,
            "run_pace": run.get("avg_pace"),
            "target_pace": matched["session"]["target_pace"],
            "pace_diff_pct": pace_diff_pct,
            "run_hr": run_hr,
            "hr_appropriate": hr_appropriate,
            "session_type": session_type,
        })

    # Need at least 3 matched comparisons to make a decision
    if len(comparisons) < 3:
        return {
            "adapted": False,
            "adaptation_type": "none",
            "message": f"Solo {len(comparisons)} corse abbinate a sessioni con target. Servono almeno 3 per adattare.",
            "comparisons_count": len(comparisons),
        }

    # Step C: Calculate weighted average deviation
    avg_pace_diff = sum(c["pace_diff_pct"] for c in comparisons) / len(comparisons)
    hr_ok_count = sum(1 for c in comparisons if c["hr_appropriate"])
    hr_ok_ratio = hr_ok_count / len(comparisons)

    # Decision
    pace_factor = 1.0      # multiplier for target_pace (< 1 = faster)
    volume_factor = 1.0    # multiplier for target_km and distances
    adaptation_type = "none"
    message_parts = []

    if avg_pace_diff > 5 and hr_ok_ratio >= 0.7:
        # Strong improvement: ran >5% faster with appropriate HR
        pace_factor = 0.97       # 3% faster targets
        volume_factor = 1.10     # 10% more volume
        adaptation_type = "strong_improvement"
        pace_change_secs = round(avg_pace_diff / 100 * 270)  # approx change in secs for a ~4:30 pace
        message_parts.append(f"Ottimi progressi! Corri in media il {avg_pace_diff:.1f}% più veloce del target con FC nella norma.")
        message_parts.append(f"I passi target sono stati abbassati di ~{pace_change_secs} sec/km e il volume aumentato del 10%.")

    elif avg_pace_diff > 3 and hr_ok_ratio >= 0.6:
        # Moderate improvement
        pace_factor = 0.98       # 2% faster targets
        volume_factor = 1.05     # 5% more volume
        adaptation_type = "moderate_improvement"
        message_parts.append(f"Buoni progressi! Corri in media il {avg_pace_diff:.1f}% più veloce del target.")
        message_parts.append("I passi target sono stati leggermente abbassati e il volume aumentato del 5%.")

    elif avg_pace_diff < -3 or (hr_ok_ratio < 0.4 and avg_pace_diff < 0):
        # Regression or excessive effort
        pace_factor = 1.02       # 2% slower targets
        volume_factor = 0.95     # 5% less volume
        adaptation_type = "regression"
        if hr_ok_ratio < 0.4:
            message_parts.append(f"La FC risulta troppo alta rispetto alle zone target in {int((1-hr_ok_ratio)*100)}% delle corse.")
        else:
            message_parts.append(f"Il passo è in media il {abs(avg_pace_diff):.1f}% più lento del target.")
        message_parts.append("I passi target sono stati alzati e il volume ridotto del 5% per favorire il recupero.")

    else:
        return {
            "adapted": False,
            "adaptation_type": "none",
            "message": "Le performance sono in linea con il piano. Nessun adattamento necessario.",
            "avg_pace_diff_pct": round(avg_pace_diff, 1),
            "comparisons_count": len(comparisons),
        }

    # Step D: Apply to all future weeks using VDOT-based paces
    # Try to get current VDOT and adjust it based on performance
    current_vdot, _ = await calculate_current_vdot()
    new_vdot_paces = None

    if current_vdot:
        # Adjust VDOT based on adaptation type
        vdot_delta = {
            "strong_improvement": 1.5,
            "moderate_improvement": 0.7,
            "regression": -1.0,
        }.get(adaptation_type, 0)
        adjusted_vdot = current_vdot + vdot_delta
        new_vdot_paces = vdot_training_paces(adjusted_vdot)
        message_parts.append(f"VDOT aggiornato: {current_vdot} → {adjusted_vdot} (Daniels).")

    future_weeks = [w for w in all_weeks if w.get("week_start", "") >= today.isoformat()]
    adapted_weeks = 0
    example_changes = []

    for week in future_weeks:
        new_target_km = round(week.get("target_km", 40) * volume_factor, 1)
        new_target_km = min(new_target_km, 65)  # cap

        new_sessions = []
        for session in week.get("sessions", []):
            new_session = session.copy()

            # Adjust distance
            if session.get("target_distance_km"):
                new_dist = round(session["target_distance_km"] * volume_factor, 1)
                new_session["target_distance_km"] = min(new_dist, 24)  # cap long runs

            # Adjust pace: prefer VDOT-based paces, fallback to % factor
            if session.get("target_pace") and session["target_pace"] != "max":
                old_pace = session["target_pace"]
                session_type = session.get("type", "")
                daniels_zone = SESSION_PACE_ZONE.get(session_type)

                if new_vdot_paces and daniels_zone and daniels_zone in new_vdot_paces:
                    # Use VDOT-derived pace
                    new_pace = new_vdot_paces[daniels_zone]
                else:
                    # Fallback: apply % factor
                    old_secs = pace_to_secs(old_pace)
                    if old_secs and old_secs > 0:
                        new_secs = max(old_secs * pace_factor, 210)
                        new_pace = secs_to_pace(new_secs)
                    else:
                        new_pace = old_pace

                new_session["target_pace"] = new_pace

                # Collect example for message (first 2 changes)
                if len(example_changes) < 2 and old_pace != new_pace:
                    example_changes.append(
                        f"{session.get('title', session.get('type', ''))}: {old_pace} → {new_pace}/km"
                    )

            new_sessions.append(new_session)

        await db.training_plan.update_one(
            {"id": week["id"]},
            {"$set": {
                "target_km": new_target_km,
                "sessions": new_sessions,
                "auto_adapted": True,
                "adaptation_date": today.isoformat(),
                "vdot_based": True if new_vdot_paces else False,
                "vdot_value": (current_vdot + vdot_delta) if current_vdot else None,
            }}
        )
        adapted_weeks += 1

    # Step E: Build summary message
    if example_changes:
        message_parts.append("Esempi: " + "; ".join(example_changes) + ".")

    return {
        "adapted": True,
        "adaptation_type": adaptation_type,
        "avg_pace_diff_pct": round(avg_pace_diff, 1),
        "hr_ok_ratio": round(hr_ok_ratio, 2),
        "pace_factor": pace_factor,
        "volume_factor": volume_factor,
        "adapted_weeks": adapted_weeks,
        "comparisons_count": len(comparisons),
        "message": " ".join(message_parts),
    }


@api_router.get("/weekly-history")
async def get_weekly_history():
    history = await db.weekly_history.find({}, {"_id": 0}).sort("week_start", 1).to_list(200)
    return {"history": history}

# Include router + middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
