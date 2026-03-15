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
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
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

def _generate_enhanced_analysis(run, planned_session, planned_week, profile=None, vdot=None, vdot_paces=None, recent_runs=None):
    """Generate a detailed coach-style analysis without AI."""
    lines = []
    run_type = run.get('run_type', 'unknown')
    dist = run.get('distance_km', 0) or 0
    pace = run.get('avg_pace', '')
    avg_hr = run.get('avg_hr', 0) or 0
    max_hr = run.get('max_hr', 0) or 0
    duration = run.get('duration_minutes', 0) or 0
    max_hr_profile = profile.get('max_hr', 180) if profile else 180

    # Calculate HR percentages
    hr_pct = round(avg_hr / max_hr_profile * 100) if avg_hr and max_hr_profile else 0
    max_hr_pct = round(max_hr / max_hr_profile * 100) if max_hr and max_hr_profile else 0

    # Determine HR zone
    hr_zone = "N/D"
    if avg_hr:
        if avg_hr <= 117: hr_zone = "Z1 (Recupero)"
        elif avg_hr <= 146: hr_zone = "Z2 (Resistenza)"
        elif avg_hr <= 160: hr_zone = "Z3 (Ritmo)"
        elif avg_hr <= 175: hr_zone = "Z4 (Soglia)"
        else: hr_zone = "Z5 (Anaerobico)"

    if planned_session:
        # ===== CORSA PIANIFICATA =====
        planned_type = planned_session.get('type', '')
        target_dist = planned_session.get('target_distance_km', 0) or 0
        target_pace = planned_session.get('target_pace', '')

        lines.append("📊 **VERDETTO:** ")

        # Distance check
        dist_ok = True
        if target_dist > 0 and dist > 0:
            dist_diff_pct = round((dist - target_dist) / target_dist * 100, 1)
            if abs(dist_diff_pct) <= 15:
                dist_ok = True
            else:
                dist_ok = False

        # Pace check
        pace_ok = True
        t_secs = _pace_to_seconds(target_pace)
        a_secs = _pace_to_seconds(pace)
        pace_diff = 0
        if t_secs > 0 and a_secs > 0:
            pace_diff = a_secs - t_secs
            if abs(pace_diff) <= 15:
                pace_ok = True
            else:
                pace_ok = False

        # HR zone check for session type
        hr_ok = True
        expected_zone = SESSION_TYPE_HR_ZONES.get(planned_type, {})
        if avg_hr and expected_zone:
            if avg_hr < expected_zone.get('min_hr', 0) - 10:
                hr_ok = False  # too low
            elif avg_hr > expected_zone.get('max_hr', 200) + 10:
                hr_ok = False  # too high

        if dist_ok and pace_ok and hr_ok:
            lines[0] += "Allenamento centrato ✅"
        elif pace_diff < -20:
            lines[0] += "Troppo intenso ⚠️"
        elif pace_diff > 20:
            lines[0] += "Troppo blando ⚠️"
        else:
            lines[0] += "Deviazione dal piano ⚠️"

        lines.append("")
        lines.append("📋 **PIANO VS REALTÀ:**")
        if target_dist > 0:
            dist_diff_pct = round((dist - target_dist) / target_dist * 100, 1)
            lines.append(f"- Distanza: {dist}km vs {target_dist}km target ({'+' if dist_diff_pct > 0 else ''}{dist_diff_pct}%)")
        if target_pace:
            if pace_diff != 0:
                direction = "più lento" if pace_diff > 0 else "più veloce"
                lines.append(f"- Passo: {pace}/km vs {target_pace}/km target ({abs(pace_diff)}s/km {direction})")
            else:
                lines.append(f"- Passo: {pace}/km vs {target_pace}/km target")
        if avg_hr and expected_zone:
            zone_name = expected_zone.get('zone', '?')
            lines.append(f"- FC media: {avg_hr} bpm ({hr_pct}% FCmax) — Zona attesa: {zone_name} ({expected_zone.get('min_hr')}-{expected_zone.get('max_hr')} bpm)")

        lines.append("")
        lines.append("💪 **PUNTI POSITIVI:**")
        if dist_ok:
            lines.append("- Distanza centrata rispetto al piano")
        if pace_ok and pace:
            lines.append("- Passo coerente con l'obiettivo della sessione")
        if hr_ok and avg_hr:
            lines.append("- Frequenza cardiaca nella zona corretta")
        if duration > 30:
            lines.append(f"- Buon volume di lavoro ({round(duration)} minuti)")

        lines.append("")
        lines.append("⚠️ **ATTENZIONE:**")
        if not pace_ok and pace_diff < -15:
            lines.append("- Attenzione a non esagerare con l'intensità. Corri troppo forte rischi overtraining.")
        elif not pace_ok and pace_diff > 15:
            lines.append("- Il passo è più lento del target. Assicurati di non trascinarti.")
        if not hr_ok and avg_hr and expected_zone:
            if avg_hr > expected_zone.get('max_hr', 200):
                lines.append(f"- FC troppo alta per questo tipo di sessione ({planned_type}). Rischio sovraccarico.")
            else:
                lines.append(f"- FC più bassa del previsto. Potrebbe indicare scarsa intensità o buon adattamento.")
        if not dist_ok and target_dist > 0:
            if dist < target_dist:
                lines.append(f"- Hai tagliato {round(target_dist - dist, 1)}km. Completa la distanza per ottenere l'adattamento previsto.")
        if dist_ok and pace_ok and hr_ok:
            lines.append("- Nessun punto critico. Ottimo lavoro!")

    else:
        # ===== CORSA EXTRA =====
        lines.append("📊 **VERDETTO:** Corsa extra fuori dal piano")
        lines.append("")
        lines.append("📋 **ANALISI CORSA:**")
        lines.append(f"- Distanza: {dist}km in {round(duration)} minuti")
        lines.append(f"- Passo medio: {pace}/km")
        if avg_hr:
            lines.append(f"- FC media: {avg_hr} bpm ({hr_pct}% FCmax) — Zona: {hr_zone}")
        if max_hr:
            lines.append(f"- FC max: {max_hr} bpm ({max_hr_pct}% FCmax)")

        lines.append("")
        lines.append("💪 **VALUTAZIONE:**")

        # Check pace vs VDOT zones
        if vdot_paces and pace:
            a_secs = _pace_to_seconds(pace)
            easy_secs = _pace_to_seconds(vdot_paces.get('easy', ''))
            tempo_secs = _pace_to_seconds(vdot_paces.get('threshold', ''))
            interval_secs = _pace_to_seconds(vdot_paces.get('interval', ''))

            if a_secs > 0 and easy_secs > 0:
                if a_secs >= easy_secs - 10:
                    lines.append(f"- Passo da corsa lenta (Easy: {vdot_paces.get('easy')}/km). ✅ Buona zona aerobica.")
                    if avg_hr and avg_hr > 146:
                        lines.append("- ⚠️ Ma la FC è troppo alta per un lento. Rallenta o controlla lo stress.")
                elif tempo_secs > 0 and a_secs >= tempo_secs - 10:
                    lines.append(f"- Passo da ritmo soglia (Threshold: {vdot_paces.get('threshold')}/km).")
                    if avg_hr and avg_hr < 155:
                        lines.append("- ✅ FC coerente con la soglia anaerobica.")
                    elif avg_hr and avg_hr > 175:
                        lines.append("- ⚠️ FC molto alta. Stai spingendo più della soglia.")
                elif interval_secs > 0 and a_secs <= interval_secs + 10:
                    lines.append(f"- Passo veloce, zona interval (Interval: {vdot_paces.get('interval')}/km).")
                else:
                    lines.append(f"- Passo intermedio tra easy e soglia.")

        if dist < 3:
            lines.append("- Corsa breve. Va bene per defaticamento o riscaldamento.")
        elif dist >= 10:
            lines.append("- Buon volume di corsa. Attento al recupero nei prossimi giorni.")

        lines.append("")
        lines.append("⚠️ **NOTE:**")
        lines.append("- Questa corsa non era nel piano. Assicurati di non accumulare troppo volume non pianificato.")
        if avg_hr and avg_hr > 160:
            lines.append("- FC elevata. Se non era una sessione di qualità, stai attento a non esagerare.")

    # Common section
    lines.append("")
    lines.append("🎯 **PROSSIMA SESSIONE:**")
    if planned_week:
        phase = planned_week.get('phase', '')
        lines.append(f"- Fase attuale: {phase} — Settimana {planned_week.get('week_number', '?')}")
        if planned_week.get('is_recovery_week'):
            lines.append("- Settimana di scarico: mantieni i ritmi bassi e recupera.")
        lines.append("- Segui il piano della prossima sessione per costruire progressivamente la base.")
    else:
        lines.append("- Continua con il piano di allenamento previsto. Non saltare le sessioni di recupero.")

    return "\n".join(lines)


def _generate_basic_analysis(run, planned_session, planned_week):
    """Generate a basic run analysis without AI."""
    lines = [f"**Analisi corsa del {run.get('date', 'N/D')}**\n"]
    lines.append(f"Distanza: {run.get('distance_km', 0)} km a {run.get('avg_pace', 'N/D')}/km")
    if planned_session:
        target_dist = planned_session.get('target_distance_km', 0) or 0
        actual_dist = run.get('distance_km', 0) or 0
        target_pace = planned_session.get('target_pace', '')
        actual_pace = run.get('avg_pace', '')
        if target_dist > 0 and actual_dist > 0:
            diff_pct = round((actual_dist - target_dist) / target_dist * 100, 1)
            if abs(diff_pct) < 10:
                lines.append(f"\n✅ Distanza in linea col piano ({target_dist}km target)")
            elif diff_pct > 0:
                lines.append(f"\n⚠️ Hai corso {diff_pct}% più del previsto ({target_dist}km target)")
            else:
                lines.append(f"\n⚠️ Hai corso {abs(diff_pct)}% meno del previsto ({target_dist}km target)")
        t_secs = _pace_to_seconds(target_pace)
        a_secs = _pace_to_seconds(actual_pace)
        if t_secs > 0 and a_secs > 0:
            diff = a_secs - t_secs
            if abs(diff) <= 10:
                lines.append(f"✅ Passo in linea col piano ({target_pace}/km target)")
            elif diff > 0:
                lines.append(f"⚠️ Passo più lento di {diff}s/km rispetto al piano ({target_pace}/km target)")
            else:
                lines.append(f"🚀 Passo più veloce di {abs(diff)}s/km rispetto al piano ({target_pace}/km target)")
    else:
        lines.append("\nCorsa extra fuori dal piano settimanale.")
    if planned_week:
        lines.append(f"\nFase: {planned_week.get('phase', 'N/D')} — Settimana {planned_week.get('week_number', '?')}")
    return "\n".join(lines)


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

class PushTokenRequest(BaseModel):
    token: str

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
    """Generate complete training plan from March 23, 2026 to December 12, 2026.
    Pre-March 22 runs (incl. Roma relay 10km) are synced via Strava.
    If vdot_paces dict is provided, session paces are derived from VDOT instead of hardcoded."""
    race_date = date(2026, 12, 12)
    start_date = date(2026, 3, 23)

    phases = [
        {"name": "Ripresa", "weeks": 4, "km_range": (25, 35), "desc": "Ritorno graduale post-staffetta Roma 10km"},
        {"name": "Base Aerobica", "weeks": 8, "km_range": (35, 45), "desc": "Costruzione della base aerobica"},
        {"name": "Sviluppo", "weeks": 8, "km_range": (42, 52), "desc": "Sviluppo della resistenza specifica"},
        {"name": "Preparazione Specifica", "weeks": 8, "km_range": (48, 58), "desc": "Lavori specifici per la mezza maratona"},
        {"name": "Picco", "weeks": 7, "km_range": (50, 57), "desc": "Fase di picco e rifinitura"},
        {"name": "Tapering", "weeks": 3, "km_range": (40, 25), "desc": "Scarico pre-gara"},
    ]
    
    # Recovery weeks every 4 weeks - reduce km by 30-40%
    recovery_weeks = {4, 8, 12, 16, 20, 24, 28, 32, 36}

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
        ("2026-02-09", "2026-02-15", 13.02, 2026), ("2026-02-16", "2026-02-22", 0.0, 2026),
        ("2026-02-23", "2026-03-01", 13.02, 2026),
        ("2026-03-02", "2026-03-08", 21.03, 2026), ("2026-03-09", "2026-03-15", 8.19, 2026),
    ]
    result = []
    for i, (ws, we, km, yr) in enumerate(data):
        result.append({"id": make_id(), "week_start": ws, "week_end": we, "total_km": km, "year": yr, "week_number": i + 1})
    return result

def get_seed_runs():
    """No seed runs — only Strava-imported runs are used."""
    return []

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
    # No seed runs — only Strava-imported runs are real data
    # Use default VDOT from profile PBs for initial plan generation
    vdot_paces = None
    best_vdot = None
    profile = get_profile()
    pbs = profile.get("pbs", {})
    for dist_str, pb_data in pbs.items():
        dist_km = float(dist_str.replace("km", ""))
        time_str = pb_data.get("time", "")
        if ":" in time_str:
            parts = time_str.split(":")
            if len(parts) == 3:
                mins = int(parts[0]) * 60 + int(parts[1]) + int(parts[2]) / 60
            else:
                mins = int(parts[0]) + int(parts[1]) / 60
            vdot = calculate_vdot_from_race(dist_km, mins)
            if vdot and (best_vdot is None or vdot > best_vdot):
                best_vdot = vdot
    if best_vdot:
        vdot_paces = vdot_training_paces(best_vdot)
        logger.info(f"Seed: VDOT {best_vdot} from PBs → paces {vdot_paces}")

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
    analysis = await db.ai_analyses.find_one({"run_id": run_id}, {"_id": 0}, sort=[("created_at", -1)])

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

    # Calculate weeks to race
    from datetime import date as date_cls
    race_date = date_cls(2026, 12, 12)
    weeks_to_race = max(0, (race_date - date.today()).days // 7)

    system_msg = f"""Sei Renato Canova — allenatore italiano di fama mondiale di mezzofondo e maratona.
Parli in italiano, tono diretto e schietto come un vero coach. Non sei un chatbot, sei un allenatore.
Ogni tua analisi deve essere UNICA — mai template, mai risposte generiche.

IL TUO ATLETA:
- Nome: {p_name}, uomo di {p_age} anni, alto 172cm, peso {p_weight}kg
- FC massima: {p_max_hr} bpm
- VDOT attuale: {vdot_val or 'non calcolato'}{injury_block}
{pbs_block}
{vdot_block}

OBIETTIVO: Mezza Maratona di Corralejo (Fuerteventura), 12 Dicembre 2026
- Mancano {weeks_to_race} settimane alla gara
- Passo obiettivo: {p_target_pace}/km → Tempo obiettivo: {p_target_time}

COME ANALIZZARE OGNI CORSA:
1. Guarda i NUMERI REALI della corsa (passo, FC, distanza, durata) e confrontali con la sessione pianificata
2. Valuta se l'allenamento è stato PRODUTTIVO per l'obiettivo finale:
   - Era un easy? Il passo e la FC erano davvero da easy (Z1-Z2, <80% FCmax)?
   - Era un tempo/soglia? Ha mantenuto la zona anaerobica corretta?
   - Era un lungo? Come ha gestito il pacing nella seconda metà?
   - Era un interval? I recuperi erano giusti? L'intensità sufficiente?
3. Inserisci la corsa nel CONTESTO del piano settimanale e della fase di allenamento
4. Considera le ultime corse fornite per identificare TREND (miglioramento, stagnazione, sovrallenamento)
5. Dai 1-2 consigli SPECIFICI e AZIONABILI per la prossima sessione
6. Se l'atleta sta facendo troppo o troppo poco, dillo chiaramente

REGOLE ASSOLUTE:
- Parla come un coach vero, non come un software. Usa "tu", dai del tu.
- Varia il tono: entusiasta se va bene, preoccupato se vedi segnali di sovrallenamento, motivante se è in calo
- Cita i passi Daniels/VDOT quando parli di zone e ritmi
- NON usare format rigidi con emoji e titoloni. Scrivi un'analisi fluida, come se parlassi all'atleta dopo l'allenamento
- Sii SPECIFICO: "hai corso a 5:15 ma il tuo passo easy Daniels è 5:40-6:00, stavi spingendo troppo" — non "buon allenamento, continua così"
- Menziona quante settimane mancano alla gara quando è rilevante per il contesto
- Lunghezza: 150-250 parole. Conciso ma sostanzioso."""

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
        # Corsa extra: analizza comunque in base al tipo, passo, FC
        run_type = run.get("run_type", "unknown")
        run_info += f"""

CORSA EXTRA (fuori dal piano di allenamento).
Analizzala comunque in base a:
- Tipo corsa: {run_type}
- Se è un "easy" / "lento": valuta se il passo e la FC sono coerenti con Z2 (FC <80% max)
- Se sono "ripetute" / "interval": valuta l'esecuzione, recuperi, coerenza dei parziali
- Se è un "progressive" / "progressivo": valuta la progressione del passo
- Se è un "tempo" / "soglia": valuta se è rimasto vicino alla soglia anaerobica
- Confronta sempre con i PASSI DANIELS del VDOT attuale
- Dai feedback su come questa corsa extra si inserisce nel piano complessivo"""

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

    response = None

    # Try Google Gemini via REST API (no SDK needed)
    try:
        if GEMINI_API_KEY:
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
            gemini_payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": system_msg + "\n\n" + run_info}
                        ]
                    }
                ],
                "generationConfig": {
                    "maxOutputTokens": 3000,
                    "temperature": 0.85,
                }
            }
            async with httpx.AsyncClient(timeout=60) as http_ai:
                gemini_resp = await http_ai.post(gemini_url, json=gemini_payload)
                if gemini_resp.status_code == 200:
                    gemini_data = gemini_resp.json()
                    candidates = gemini_data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            response = parts[0].get("text", "")
                            logger.info("AI analysis generated via Google Gemini REST API")
                else:
                    logger.warning(f"Gemini API error {gemini_resp.status_code}: {gemini_resp.text[:200]}")
    except Exception as e:
        logger.warning(f"Gemini AI unavailable: {e}")

    # Fallback: enhanced analysis without AI
    if not response:
        response = _generate_enhanced_analysis(run, planned_session, planned_week, profile, vdot_val, vdot_paces, recent_runs)
        logger.info("AI analysis generated via fallback template (Gemini unavailable)")

    ai_source = "gemini" if response and not response.startswith("**Analisi corsa") else "fallback"

    # Delete any previous analysis for this run so the new one is always used
    await db.ai_analyses.delete_many({"run_id": req.run_id})

    analysis_doc = {
        "id": make_id(),
        "run_id": req.run_id,
        "analysis": response,
        "ai_source": ai_source,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.ai_analyses.insert_one(analysis_doc)
    analysis_doc.pop("_id", None)
    return analysis_doc

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

    # After cleanup, recalculate VDOT history from remaining Strava runs
    await _rebuild_vo2max_history()

    return {"deleted": total, "remaining": remaining}


async def _rebuild_vo2max_history():
    """Rebuild vo2max_history collection from validated post-injury runs (2026+, ≥4km, HR≥85%)."""
    await db.vo2max_history.delete_many({})
    runs = await db.runs.find({}, {"_id": 0}).sort("date", 1).to_list(2000)
    profile = await db.profile.find_one({}, {"_id": 0}) or {}
    max_hr = profile.get("max_hr", 180)

    best_vdot_so_far = None
    for run in runs:
        dist = run.get("distance_km", 0)
        dur = run.get("duration_minutes", 0)
        run_date = run.get("date", "")
        hr = run.get("avg_hr")

        # Only post-injury (2026+), validated efforts (≥4km)
        if not run_date.startswith("2026") or dist < 4 or dur <= 0:
            continue
        # HR validation: ≥85% HRmax or no HR data
        if hr and max_hr > 0 and (hr / max_hr) < 0.85:
            continue

        vdot = calculate_vdot_from_race(dist, dur)
        if vdot:
            vdot = round(vdot, 1)
            if best_vdot_so_far is None or vdot > best_vdot_so_far:
                best_vdot_so_far = vdot
            await db.vo2max_history.insert_one({
                "id": make_id(),
                "date": run_date,
                "vdot": vdot,
                "training_vdot": best_vdot_so_far,
                "based_on": f"{dist}km ({run.get('avg_pace', '?')}/km)"
            })

    # Also update profile with current best VDOT
    if best_vdot_so_far:
        await db.profile.update_one({}, {"$set": {"current_vdot": best_vdot_so_far}})

    return best_vdot_so_far


@api_router.post("/vo2max-history/rebuild")
async def rebuild_vo2max_history():
    """Rebuild VO2max history from all valid runs."""
    vdot = await _rebuild_vo2max_history()
    count = await db.vo2max_history.count_documents({})
    return {"rebuilt": True, "points": count, "current_vdot": vdot}


@api_router.post("/push-token")
async def register_push_token(req: PushTokenRequest):
    """Store Expo push token for notifications."""
    await db.push_tokens.update_one(
        {"token": req.token},
        {"$set": {"token": req.token, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"status": "ok"}


async def send_push_notification(title: str, body: str):
    """Send push notification to all registered Expo push tokens."""
    import httpx
    tokens = await db.push_tokens.find({}, {"_id": 0, "token": 1}).to_list(10)
    if not tokens:
        return
    messages = [{"to": t["token"], "title": title, "body": body, "sound": "default"} for t in tokens]
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={"Content-Type": "application/json"},
            )
    except Exception as e:
        logger.error(f"Push notification error: {e}")


async def generate_weekly_report() -> dict:
    """Generate weekly training report data.
    Compares completed week vs plan targets, tracks VDOT trend,
    and previews next week."""
    today = date.today()
    profile = await db.profile.find_one({}, {"_id": 0}) or {}
    current_vdot = profile.get("current_vdot")

    # Find the week that just ended (last Monday to Sunday)
    last_monday = today - timedelta(days=today.weekday() + 7)
    last_sunday = last_monday + timedelta(days=6)

    # Get completed week from plan
    completed_week = await db.training_plan.find_one(
        {"week_start": {"$gte": last_monday.isoformat(), "$lte": last_sunday.isoformat()}},
        {"_id": 0}
    )
    if not completed_week:
        # Try to find any week that overlaps
        all_weeks = await db.training_plan.find({}, {"_id": 0}).to_list(200)
        for w in all_weeks:
            ws = w.get("week_start", "")
            if last_monday.isoformat() <= ws <= last_sunday.isoformat():
                completed_week = w
                break

    # Get actual runs for that week
    runs = await db.runs.find(
        {"date": {"$gte": last_monday.isoformat(), "$lte": last_sunday.isoformat()}},
        {"_id": 0}
    ).to_list(50)

    actual_km = round(sum(r.get("distance_km", 0) for r in runs), 1)
    actual_runs_count = len(runs)
    target_km = completed_week.get("target_km", 0) if completed_week else 0
    phase = completed_week.get("phase", "?") if completed_week else "?"
    week_num = completed_week.get("week_number", "?") if completed_week else "?"

    # Adherence: sessions completed vs total
    total_sessions = 0
    completed_sessions = 0
    if completed_week:
        sessions = completed_week.get("sessions", [])
        total_sessions = len([s for s in sessions if s.get("type") not in ("riposo",)])
        completed_sessions = len([s for s in sessions if s.get("completed")])

    adherence_pct = round(completed_sessions / total_sessions * 100) if total_sessions > 0 else 0
    km_pct = round(actual_km / target_km * 100) if target_km > 0 else 0

    # Average pace and HR
    paces = []
    hrs = []
    for r in runs:
        p = r.get("avg_pace", "")
        if p and ":" in p:
            parts = p.split(":")
            try:
                paces.append(int(parts[0]) * 60 + int(parts[1]))
            except ValueError:
                pass
        if r.get("avg_hr"):
            hrs.append(r["avg_hr"])

    avg_pace_str = ""
    if paces:
        avg_secs = sum(paces) / len(paces)
        avg_pace_str = f"{int(avg_secs)//60}:{int(avg_secs)%60:02d}/km"

    avg_hr = round(sum(hrs) / len(hrs)) if hrs else None

    # VDOT history — check change from last week
    vdot_history = await db.vo2max_history.find(
        {}, {"_id": 0}
    ).sort("date", -1).to_list(5)
    vdot_change = None
    if len(vdot_history) >= 2:
        vdot_change = round(vdot_history[0].get("vdot", 0) - vdot_history[1].get("vdot", 0), 1)

    # Next week preview
    next_monday = today - timedelta(days=today.weekday())
    next_sunday = next_monday + timedelta(days=6)
    next_week = await db.training_plan.find_one(
        {"week_start": {"$gte": next_monday.isoformat(), "$lte": next_sunday.isoformat()}},
        {"_id": 0}
    )
    if not next_week:
        all_weeks = await db.training_plan.find({}, {"_id": 0}).to_list(200)
        for w in all_weeks:
            ws = w.get("week_start", "")
            if next_monday.isoformat() <= ws <= next_sunday.isoformat():
                next_week = w
                break

    next_week_km = next_week.get("target_km", 0) if next_week else 0
    next_week_phase = next_week.get("phase", "?") if next_week else "?"
    next_week_sessions = []
    if next_week:
        for s in next_week.get("sessions", []):
            if s.get("type") not in ("riposo",):
                next_week_sessions.append(f"{s.get('title', s.get('type', '?'))}")

    # Race countdown
    race_date = date(2026, 12, 12)
    days_to_race = (race_date - today).days

    return {
        "week_number": week_num,
        "phase": phase,
        "actual_km": actual_km,
        "target_km": target_km,
        "km_pct": km_pct,
        "actual_runs": actual_runs_count,
        "completed_sessions": completed_sessions,
        "total_sessions": total_sessions,
        "adherence_pct": adherence_pct,
        "avg_pace": avg_pace_str,
        "avg_hr": avg_hr,
        "vdot": current_vdot,
        "vdot_change": vdot_change,
        "next_week_km": next_week_km,
        "next_week_phase": next_week_phase,
        "next_week_sessions": next_week_sessions,
        "days_to_race": days_to_race,
    }


@api_router.get("/weekly-report")
async def get_weekly_report():
    """Get weekly training report data."""
    return await generate_weekly_report()


@api_router.post("/weekly-report/send")
async def send_weekly_report():
    """Generate and send weekly report via push notification."""
    report = await generate_weekly_report()

    # Build notification message
    lines = []
    lines.append(f"Settimana {report['week_number']} — {report['phase']}")
    lines.append(f"KM: {report['actual_km']}/{report['target_km']} ({report['km_pct']}%)")
    lines.append(f"Aderenza: {report['adherence_pct']}% ({report['completed_sessions']}/{report['total_sessions']} sessioni)")

    if report['avg_pace']:
        lines.append(f"Passo medio: {report['avg_pace']}")
    if report['avg_hr']:
        lines.append(f"FC media: {report['avg_hr']} bpm")

    if report['vdot']:
        vdot_str = f"VDOT: {report['vdot']}"
        if report['vdot_change'] and report['vdot_change'] != 0:
            sign = "+" if report['vdot_change'] > 0 else ""
            vdot_str += f" ({sign}{report['vdot_change']})"
        lines.append(vdot_str)

    lines.append(f"Prossima: {report['next_week_phase']} — {report['next_week_km']}km")
    lines.append(f"Gara tra {report['days_to_race']} giorni")

    title = f"Report Sett. {report['week_number']}: {report['actual_km']}km ({report['adherence_pct']}%)"
    body = "\n".join(lines)

    await send_push_notification(title, body)

    # Save report to DB for history
    await db.weekly_reports.insert_one({
        "id": str(uuid.uuid4()),
        "date": date.today().isoformat(),
        **report,
        "sent": True,
    })

    return {"sent": True, "title": title, "body": body, "report": report}


# ══════════════════════════════════════════════════════════════════
# BACKGROUND SCHEDULER — Weekly Report (every Sunday 20:00 UTC)
# ══════════════════════════════════════════════════════════════════
import asyncio

_weekly_report_task = None

async def _weekly_report_scheduler():
    """Background task: sends weekly report every Sunday at 20:00 UTC."""
    while True:
        now = datetime.now(timezone.utc)
        # Calculate seconds until next Sunday 20:00 UTC
        days_ahead = 6 - now.weekday()  # 6 = Sunday
        if days_ahead < 0 or (days_ahead == 0 and now.hour >= 20):
            days_ahead += 7
        next_sunday = now.replace(hour=20, minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)
        wait_seconds = (next_sunday - now).total_seconds()
        logger.info(f"Weekly report scheduler: next report in {wait_seconds/3600:.1f} hours ({next_sunday.isoformat()})")
        await asyncio.sleep(wait_seconds)
        try:
            report = await generate_weekly_report()
            # Only send if there was actual training data
            if report["actual_runs"] > 0:
                await send_weekly_report()
                logger.info(f"Weekly report sent: {report['actual_km']}km, {report['adherence_pct']}% adherence")
            else:
                logger.info("Weekly report skipped: no runs this week")
        except Exception as e:
            logger.error(f"Weekly report error: {e}")


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

    # ---- HR ZONE DISTRIBUTION (last 4 weeks, Seiler 2010) ----
    four_weeks_ago_date = (date.today() - timedelta(days=28)).isoformat()
    recent_hr_runs = [r for r in valid_runs if r.get("avg_hr") and r.get("date", "") >= four_weeks_ago_date]

    hr_zone_counts_4w = {"z1": 0, "z2": 0, "z3": 0, "z4": 0, "z5": 0}
    for r in recent_hr_runs:
        avg_hr = r["avg_hr"]
        hr_pct = (avg_hr / user_max_hr) * 100
        if hr_pct < 70:
            hr_zone_counts_4w["z1"] += 1
        elif hr_pct < 80:
            hr_zone_counts_4w["z2"] += 1
        elif hr_pct < 87:
            hr_zone_counts_4w["z3"] += 1
        elif hr_pct < 93:
            hr_zone_counts_4w["z4"] += 1
        else:
            hr_zone_counts_4w["z5"] += 1

    total_4w_hr = len(recent_hr_runs)
    hr_zone_distribution = {
        "z1_pct": round((hr_zone_counts_4w["z1"] / max(total_4w_hr, 1)) * 100),
        "z2_pct": round((hr_zone_counts_4w["z2"] / max(total_4w_hr, 1)) * 100),
        "z3_pct": round((hr_zone_counts_4w["z3"] / max(total_4w_hr, 1)) * 100),
        "z4_pct": round((hr_zone_counts_4w["z4"] / max(total_4w_hr, 1)) * 100),
        "z5_pct": round((hr_zone_counts_4w["z5"] / max(total_4w_hr, 1)) * 100),
        "total_runs_with_hr": total_4w_hr,
        "polarization_score": round(((hr_zone_counts_4w["z1"] + hr_zone_counts_4w["z2"]) / max(total_4w_hr, 1)) * 100),
        "is_polarized": round(((hr_zone_counts_4w["z1"] + hr_zone_counts_4w["z2"]) / max(total_4w_hr, 1)) * 100) >= 80,
    }

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
    # Always include pre-injury reference point
    at_history = [{
        "period_start": "2025-11-17",
        "period_end": "2025-11-23",
        "avg_hr": 149,
        "avg_pace": "4:20",
        "best_pace": "4:20",
        "pace_secs": 260,
        "runs_count": 1,
        "label": "Pre-Inf."
    }]
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

    # ---- TRAINING PACES from current VDOT ----
    current_training_paces = vdot_training_paces(vo2max) if vo2max else None

    # ---- PACE PROGRESSION BY WEEK (actual run paces grouped by week) ----
    # Shows how easy/fast runs evolve over time
    weekly_pace_data = {}
    for r in valid_runs:
        if not r.get("date") or not r.get("avg_pace"):
            continue
        # Get ISO week
        try:
            from datetime import datetime as dt
            rd = dt.strptime(r["date"], "%Y-%m-%d").date()
            week_start = (rd - timedelta(days=rd.weekday())).isoformat()
        except Exception:
            continue
        pace_s = pace_str_to_secs(r["avg_pace"])
        dist = r.get("distance_km", 0)
        hr = r.get("avg_hr", 0)
        if week_start not in weekly_pace_data:
            weekly_pace_data[week_start] = {"easy": [], "tempo": [], "fast": []}
        # Classify by HR zone or pace
        if hr and hr < 150:
            weekly_pace_data[week_start]["easy"].append(pace_s)
        elif hr and hr < 168:
            weekly_pace_data[week_start]["tempo"].append(pace_s)
        elif hr and hr >= 168:
            weekly_pace_data[week_start]["fast"].append(pace_s)
        elif pace_s > 330:  # slower than 5:30 = easy
            weekly_pace_data[week_start]["easy"].append(pace_s)
        elif pace_s > 280:  # 4:40-5:30 = tempo
            weekly_pace_data[week_start]["tempo"].append(pace_s)
        else:
            weekly_pace_data[week_start]["fast"].append(pace_s)

    pace_progression = []
    for week in sorted(weekly_pace_data.keys()):
        d = weekly_pace_data[week]
        entry = {"week": week}
        for zone in ["easy", "tempo", "fast"]:
            if d[zone]:
                avg = sum(d[zone]) / len(d[zone])
                entry[f"{zone}_pace_secs"] = round(avg)
                entry[f"{zone}_pace"] = f"{int(avg // 60)}:{int(avg % 60):02d}"
        if len(entry) > 1:  # has at least one zone
            pace_progression.append(entry)

    # ---- VO2max history (computed dynamically from validated efforts, ALL runs) ----
    # Shows every validated effort's VDOT to track true progression
    # ---- VO2max history: group by week, pick best effort per week ----
    # This avoids showing every single run and gives a cleaner progression
    vo2max_history = []
    running_best_vdot = None
    weekly_vdot = {}
    for r in sorted(valid_runs, key=lambda x: x.get("date", "")):
        dist = r.get("distance_km", 0)
        dur = r.get("duration_minutes", 0)
        if dist < 3 or dur <= 0:
            continue
        # Accept runs with HR ≥ 75% HRmax OR runs without HR data (broader filter)
        hr = r.get("avg_hr")
        if hr and max_hr > 0 and (hr / max_hr) < 0.75:
            continue
        vdot_val_hist = calculate_vdot_from_race(dist, dur)
        if vdot_val_hist:
            vdot_rounded = round(vdot_val_hist, 1)
            # Group by week
            try:
                from datetime import datetime as dt_parse
                rd = dt_parse.strptime(r["date"], "%Y-%m-%d").date()
                week_key = (rd - timedelta(days=rd.weekday())).isoformat()
            except Exception:
                week_key = r.get("date", "")[:7]
            if week_key not in weekly_vdot or vdot_rounded > weekly_vdot[week_key]["vdot"]:
                weekly_vdot[week_key] = {
                    "date": r.get("date", ""),
                    "vdot": vdot_rounded,
                    "based_on": f"{dist}km ({r.get('avg_pace', '?')}/km)"
                }

    for week_key in sorted(weekly_vdot.keys()):
        entry = weekly_vdot[week_key]
        if running_best_vdot is None or entry["vdot"] > running_best_vdot:
            running_best_vdot = entry["vdot"]
        vo2max_history.append({
            "date": entry["date"],
            "vdot": entry["vdot"],
            "training_vdot": running_best_vdot,
            "based_on": entry["based_on"]
        })

    return {
        "vo2max": vo2max,
        "vo2max_target": vo2max_target,
        "vo2max_history": vo2max_history,
        "user_max_hr": user_max_hr,
        "race_predictions": race_predictions,
        "goal_gap_min": goal_gap_min,
        "goal_progress_pct": goal_progress_pct,
        "target_hm_time_str": "1:35:00",
        "current_hm_pred_str": race_predictions.get("21.1km", {}).get("predicted_time_str", "N/D"),
        "weekly_volume": weekly_volume,
        "zone_distribution": zone_distribution,
        "hr_zone_distribution": hr_zone_distribution,
        "anaerobic_threshold": {
            "current": current_at,
            "pre_injury": pre_injury_at,
            "history": at_history
        },
        "best_efforts": {k: {"distance": v["distance_km"], "pace": v["avg_pace"], "time": v["duration_minutes"], "date": v["date"], "avg_hr": v.get("avg_hr"), "max_hr": v.get("max_hr")} for k, v in best_efforts.items()},
        "totals": {"total_km": total_km, "total_time_hours": round(total_time / 60, 1), "total_runs": total_runs, "recent_30d_km": recent_km},
        "current_training_paces": current_training_paces,
        "pace_progression": pace_progression,
        "pace_trend": pace_trend,
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
    """Return current scientific training metrics and last adaptation decision.

    Shows separate acute/chronic loads (Impellizzeri 2020, NOT ACWR ratio),
    monotony/strain (Foster), polarization (Seiler), and last adaptation log."""
    profile = await db.profile.find_one({}, {"_id": 0}) or {}
    max_hr = profile.get("max_hr", 180)
    current_vdot = profile.get("current_vdot")
    today = date.today()

    # Load runs
    eight_weeks_ago = (today - timedelta(days=56)).isoformat()
    runs = await db.runs.find(
        {"date": {"$gte": eight_weeks_ago}}, {"_id": 0}
    ).sort("date", 1).to_list(500)

    if len(runs) < 3:
        return {
            "can_adapt": False,
            "reason": f"Solo {len(runs)} corse nelle ultime 8 settimane. Servono almeno 5.",
            "recent_runs_count": len(runs),
            "vdot": current_vdot,
        }

    # Compute daily training loads
    daily_loads = {}
    for run in runs:
        d = run.get("date", "")
        dist = run.get("distance_km", 0)
        hr = run.get("avg_hr")
        intensity = (hr / max_hr) if (hr and max_hr > 0) else 0.72
        daily_loads[d] = daily_loads.get(d, 0) + dist * intensity

    # Weekly loads for last 4 weeks (separate acute/chronic, Impellizzeri 2020)
    weekly_data = []
    for w in range(4):
        wk_start = today - timedelta(days=(w + 1) * 7)
        wk_end = today - timedelta(days=w * 7)
        wk_load = 0.0
        wk_km = 0.0
        c = wk_start
        while c < wk_end:
            d = c.isoformat()
            wk_load += daily_loads.get(d, 0)
            for r in runs:
                if r.get("date", "") == d:
                    wk_km += r.get("distance_km", 0)
            c += timedelta(days=1)
        weekly_data.append({"load": round(wk_load, 2), "km": round(wk_km, 1)})

    acute_load = weekly_data[0]["load"]
    acute_km = weekly_data[0]["km"]
    chronic_loads = [w["load"] for w in weekly_data if w["load"] > 0]
    chronic_avg = round(sum(chronic_loads) / len(chronic_loads), 2) if chronic_loads else acute_load
    chronic_avg_km = round(sum(w["km"] for w in weekly_data) / max(len([w for w in weekly_data if w["km"] > 0]), 1), 1)

    # Week-over-week change (primary spike metric)
    prev_km = weekly_data[1]["km"] if len(weekly_data) > 1 else acute_km
    wow_pct = round(((acute_km - prev_km) / prev_km) * 100, 1) if prev_km > 0 else 0.0

    # Load status interpretation
    if wow_pct > 30:
        load_status = "danger"
        load_label = f"⚠️ Spike +{wow_pct}% WoW — Rischio elevato"
    elif wow_pct > 20:
        load_status = "caution"
        load_label = f"⚡ Aumento +{wow_pct}% WoW — Cautela"
    elif wow_pct < -25:
        load_status = "detraining_risk"
        load_label = f"💡 Calo {wow_pct}% WoW — Rischio detraining"
    else:
        load_status = "optimal"
        load_label = f"✅ Carico stabile ({wow_pct:+.1f}% WoW)"

    # Monotony & Strain (Foster 1998)
    last_7 = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    wk = [daily_loads.get(d, 0) for d in last_7]
    wk_total = sum(wk)
    mean_l = wk_total / 7
    sd_l = math.sqrt(sum((l - mean_l) ** 2 for l in wk) / 7) or 0.01
    monotony = round(mean_l / sd_l, 2)
    strain = round(wk_total * monotony, 1)

    # Polarization (Seiler 2010)
    four_weeks_ago = (today - timedelta(days=28)).isoformat()
    recent = [r for r in runs if r.get("date", "") >= four_weeks_ago]
    z1 = z2 = z3 = hr_n = 0
    for r in recent:
        hr = r.get("avg_hr")
        if not hr:
            continue
        hr_n += 1
        pct = hr / max_hr
        if pct < 0.80:
            z1 += 1
        elif pct < 0.88:
            z2 += 1
        else:
            z3 += 1
    easy_pct = round(z1 / hr_n * 100) if hr_n >= 3 else None

    # Last adaptation log
    last_log = await db.adaptation_log.find_one(
        {}, {"_id": 0}, sort=[("date", -1)]
    )

    # Current phase
    future = await db.training_plan.find(
        {"week_start": {"$gte": today.isoformat()}}, {"_id": 0}
    ).sort("week_start", 1).limit(1).to_list(1)
    phase = future[0].get("phase", "?") if future else "?"

    # Weekly km
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    this_week_runs = [r for r in runs if r.get("date", "") >= week_start]
    this_week_km = round(sum(r.get("distance_km", 0) for r in this_week_runs), 1)

    return {
        "can_adapt": True,
        "recent_runs_count": len(recent),
        "vdot": current_vdot,
        "phase": phase,
        "this_week_km": this_week_km,
        "metrics": {
            "acute_load": round(acute_load, 1),
            "chronic_load": chronic_avg,
            "acute_km": acute_km,
            "chronic_avg_km": chronic_avg_km,
            "wow_change_pct": wow_pct,
            "load_status": load_status,
            "load_label": load_label,
            "monotony": monotony,
            "monotony_warning": monotony > 2.0,
            "strain": strain,
            "polarization_easy_pct": easy_pct,
            "polarization_ok": easy_pct is None or easy_pct >= 75,
            "z1_runs": z1,
            "z2_runs": z2,
            "z3_runs": z3,
        },
        "last_adaptation": {
            "date": last_log.get("date") if last_log else None,
            "adapted": last_log.get("adapted") if last_log else None,
            "decisions": last_log.get("decisions", []) if last_log else [],
        },
        "science_references": [
            "Impellizzeri et al. (2020) Int J Sports Physiol Perform — Carichi acuto/cronico monitorati separatamente, NO ratio ACWR",
            "BMC Sports Medicine (2025) meta-analisi — ACWR associato a rischio ma con cautela (eterogeneità, mathematical coupling)",
            "ACSM (2013) — Regola del 10%/settimana come guardrail primario",
            "Foster (1998) Med Sci Sports Exerc — Monotony >2.0 = overtraining risk",
            "Seiler (2010) Int J Sports Physiol Perform — Polarized 80/20 distribution",
            "Daniels (2014) Running Formula — VDOT 2/3 rule, pace zones",
            "Mujika & Padilla (2003) — Tapering: volume -40/60%, intensità mantenuta",
        ],
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
    redirect_uri = "https://corralejo-backend.onrender.com/api/strava/callback"
    url = (
        f"https://www.strava.com/oauth/authorize"
        f"?client_id={STRAVA_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={redirect_uri}"
        f"&approval_prompt=force"
        f"&scope=read,activity:read_all"
    )
    return {"url": url, "redirect_uri": redirect_uri}

@api_router.get("/strava/callback")
async def strava_callback(code: str = None, error: str = None, scope: str = None):
    """Strava OAuth callback - exchanges code and redirects to app"""
    from starlette.responses import RedirectResponse
    if error:
        return RedirectResponse(url=f"corralejo://strava-callback?error={error}")
    if code:
        # Exchange the code server-side
        try:
            async with httpx.AsyncClient() as http:
                resp = await http.post(
                    "https://www.strava.com/oauth/token",
                    data={
                        "client_id": STRAVA_CLIENT_ID,
                        "client_secret": STRAVA_CLIENT_SECRET,
                        "code": code,
                        "grant_type": "authorization_code",
                    }
                )
                if resp.status_code == 200:
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
                    athlete = data.get("athlete", {})
                    name = f"{athlete.get('firstname', '')} {athlete.get('lastname', '')}".strip()
                    logger.info(f"Strava OAuth callback success for {name}")
                    return RedirectResponse(url=f"corralejo://strava-callback?success=true&athlete={name}")
                else:
                    logger.error(f"Strava callback exchange failed: {resp.text}")
                    return RedirectResponse(url=f"corralejo://strava-callback?error=exchange_failed")
        except Exception as e:
            logger.error(f"Strava callback error: {e}")
            return RedirectResponse(url=f"corralejo://strava-callback?error=server_error")
    return RedirectResponse(url="corralejo://strava-callback?error=no_code")

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
                        "avg_cadence": a.get("average_cadence"),  # Strava gives half-cadence (one foot)
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
            update_fields = {
                "strava_id": act.get("strava_id"),
                "notes": (date_match.get("notes", "") or "") + f" [Strava: {act.get('name', '')}]",
            }
            if act.get("avg_cadence") and not date_match.get("avg_cadence"):
                update_fields["avg_cadence"] = round(act["avg_cadence"] * 2)
            if act.get("elevation_gain") and not date_match.get("elevation_gain"):
                update_fields["elevation_gain"] = act["elevation_gain"]
            await db.runs.update_one(
                {"id": date_match["id"]},
                {"$set": update_fields}
            )
            matched += 1
            continue

        # ---- MATCH RUN TO PLANNED SESSION ----
        plan_feedback = await _compare_run_to_plan(act)

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
            "run_type": plan_feedback.get("matched_type", "easy"),
            "notes": f"Importata da Strava: {act.get('name', '')}",
            "location": None,
            "strava_id": act.get("strava_id"),
            "plan_feedback": plan_feedback,
            "avg_cadence": round(act["avg_cadence"] * 2) if act.get("avg_cadence") else None,
            "elevation_gain": act.get("elevation_gain"),
        }
        await db.runs.insert_one(run_doc)
        synced += 1

        # ---- FETCH DETAILED ACTIVITY (splits + best efforts) ----
        try:
            token = await get_valid_strava_token()
            async with httpx.AsyncClient(timeout=30) as http:
                detail_resp = await http.get(
                    f"https://www.strava.com/api/v3/activities/{act['strava_id']}",
                    headers={"Authorization": f"Bearer {token}"},
                    params={"include_all_efforts": "true"}
                )
                if detail_resp.status_code == 200:
                    detail = detail_resp.json()

                    # --- Splits per km ---
                    splits_metric = detail.get("splits_metric", [])
                    if splits_metric:
                        splits = []
                        for idx, sp in enumerate(splits_metric):
                            sp_dist = sp.get("distance", 0)
                            sp_time = sp.get("elapsed_time", 0)
                            sp_hr = sp.get("average_heartrate")
                            if sp_dist > 0 and sp_time > 0:
                                sp_pace_s = sp_time / (sp_dist / 1000)
                                sp_pace = f"{int(sp_pace_s // 60)}:{int(sp_pace_s % 60):02d}"
                            else:
                                sp_pace = "0:00"
                            splits.append({
                                "km": idx + 1,
                                "pace": sp_pace,
                                "hr": round(sp_hr) if sp_hr else None,
                                "distance": round(sp_dist, 1),
                                "elapsed_time": sp_time,
                            })
                        await db.runs.update_one(
                            {"id": run_doc["id"]},
                            {"$set": {"splits": splits}}
                        )

                    # --- Best efforts ---
                    best_efforts_raw = detail.get("best_efforts", [])
                    if best_efforts_raw:
                        await _process_best_efforts(best_efforts_raw, run_doc)
        except Exception as e:
            logger.error(f"Error fetching detailed activity {act['strava_id']}: {e}")

        # Auto-complete matching planned session
        if plan_feedback.get("week_id") and plan_feedback.get("session_index") is not None:
            try:
                week = await db.training_plan.find_one({"id": plan_feedback["week_id"]})
                if week:
                    sessions = week.get("sessions", [])
                    si = plan_feedback["session_index"]
                    if 0 <= si < len(sessions):
                        sessions[si]["completed"] = True
                        await db.training_plan.update_one({"id": plan_feedback["week_id"]}, {"$set": {"sessions": sessions}})
            except Exception as e:
                logger.error(f"Auto-complete session error: {e}")

    # ---- AUTO UPDATE PERSONAL BESTS AND MEDALS ----
    adaptation_result = None
    vdot_update = None
    if synced > 0 or matched > 0:
        await update_personal_bests_and_medals()
        # ---- AUTO RECALCULATE VDOT ----
        try:
            vdot_update = await auto_recalculate_vdot()
        except Exception as e:
            logger.error(f"Auto VDOT recalc error: {e}")
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
        "vdot_update": vdot_update,
    }

async def _compare_run_to_plan(activity: dict) -> dict:
    """Compare a Strava activity against the planned session for that day.
    Returns feedback: matched_type, pace_diff, distance_diff, verdict."""
    run_date = activity.get("date", "")
    feedback = {"matched": False, "matched_type": "easy", "verdict": "extra", "week_id": None, "session_index": None}

    # Find the week containing this date
    week = await db.training_plan.find_one({"week_start": {"$lte": run_date}, "week_end": {"$gte": run_date}})
    if not week:
        return feedback

    # Find the session for this exact date
    sessions = week.get("sessions", [])
    for i, s in enumerate(sessions):
        if s.get("date") == run_date and s.get("type") not in ("riposo", "rinforzo"):
            feedback["matched"] = True
            feedback["matched_type"] = s.get("type", "easy")
            feedback["week_id"] = week.get("id")
            feedback["session_index"] = i
            feedback["planned_title"] = s.get("title", "")
            feedback["planned_km"] = s.get("target_distance_km", 0)
            feedback["planned_pace"] = s.get("target_pace", "")

            # Distance comparison
            planned_km = s.get("target_distance_km", 0) or 0
            actual_km = activity.get("distance_km", 0) or 0
            if planned_km > 0 and actual_km > 0:
                dist_diff_pct = round((actual_km - planned_km) / planned_km * 100, 1)
                feedback["distance_diff_pct"] = dist_diff_pct

            # Pace comparison
            planned_pace = s.get("target_pace", "")
            actual_pace = activity.get("avg_pace", "")
            p_secs = _pace_to_seconds(planned_pace)
            a_secs = _pace_to_seconds(actual_pace)
            if p_secs > 0 and a_secs > 0:
                pace_diff = a_secs - p_secs
                feedback["pace_diff_secs"] = pace_diff
                if abs(pace_diff) <= 10:
                    feedback["verdict"] = "perfetto"
                elif pace_diff > 15:
                    feedback["verdict"] = "troppo_lento"
                elif pace_diff < -15:
                    feedback["verdict"] = "troppo_veloce"
                else:
                    feedback["verdict"] = "ok"
            else:
                feedback["verdict"] = "ok"
            break

    if not feedback["matched"]:
        feedback["verdict"] = "extra"

    return feedback


async def auto_recalculate_vdot() -> dict:
    """Recalculate VDOT from best validated efforts and update plan paces.

    Scientific basis — Daniels' Running Formula (2014, 4th ed.):
    ──────────────────────────────────────────────────────────────
    1. Only "validated efforts" count for VDOT: distance ≥ 4km,
       avg_hr ≥ 85% HRmax (true race/test effort). If no HR data,
       the run is still considered (conservative fallback).

    2. The 2/3 rule: when a new measured VDOT exceeds the current
       training VDOT, only credit 2/3 of the improvement.
       → Prevents overreacting to a single great race day.
       → Example: current 40.6, measured 43.0 →
         new = 40.6 + (43.0 - 40.6) × 0.67 = 42.2 (not 43.0)

    3. Max +1 VDOT per mesocycle (4 weeks): even with the 2/3 rule,
       cap total increase at 1.0 VDOT since last update.
       → Ensures training paces don't outpace physiological adaptation.

    4. Regression is applied in full (no dampening): if the athlete's
       best validated VDOT drops below current, reduce immediately
       to prevent training at unsustainable paces.
    ──────────────────────────────────────────────────────────────
    """
    VDOT_DAMPENING = 2 / 3                 # Daniels' 2/3 rule
    VDOT_MAX_INCREASE_PER_MESOCYCLE = 1.0  # Max +1 VDOT per 4-week block
    VDOT_MIN_DISTANCE_KM = 4.0            # Minimum distance for valid effort
    VDOT_MIN_HR_PCT = 0.85                 # 85% HRmax = race effort threshold

    profile = await db.profile.find_one({}, {"_id": 0}) or {}
    max_hr = profile.get("max_hr", 180)
    current_vdot = profile.get("current_vdot")
    last_vdot_update = profile.get("last_vdot_update")  # ISO date string

    runs = await db.runs.find({}, {"_id": 0}).sort("date", -1).to_list(500)

    # Find best VDOT from validated efforts
    best_vdot = None
    best_run_info = None
    for run in runs:
        dist = run.get("distance_km", 0)
        dur = run.get("duration_minutes", 0)
        hr = run.get("avg_hr")

        if dist < VDOT_MIN_DISTANCE_KM or dur <= 0:
            continue

        # Validate effort: either HR ≥ 85% HRmax or no HR data (conservative)
        if hr and max_hr > 0:
            hr_pct = hr / max_hr
            if hr_pct < VDOT_MIN_HR_PCT:
                continue  # Not a race effort — skip

        vdot = calculate_vdot_from_race(dist, dur)
        if vdot and (best_vdot is None or vdot > best_vdot):
            best_vdot = vdot
            best_run_info = f"{dist}km del {run.get('date', '?')} ({run.get('avg_pace', '?')}/km)"

    if not best_vdot:
        return {"updated": False, "message": "Nessuna corsa valida (≥4km, sforzo race-like) per calcolare il VDOT"}

    best_vdot = round(best_vdot, 1)
    result = {"updated": False, "measured_vdot": best_vdot, "based_on": best_run_info}

    # Calculate the training VDOT using Daniels' rules
    if current_vdot is None:
        # First calculation ever — use measured VDOT directly
        new_vdot = best_vdot
    elif best_vdot > current_vdot:
        # IMPROVEMENT: apply 2/3 rule (Daniels)
        raw_improvement = best_vdot - current_vdot
        dampened = raw_improvement * VDOT_DAMPENING
        # Cap at +1 per mesocycle (4 weeks)
        if last_vdot_update:
            days_since = (date.today() - date.fromisoformat(last_vdot_update)).days
            if days_since < 28:
                dampened = min(dampened, VDOT_MAX_INCREASE_PER_MESOCYCLE)
        new_vdot = round(current_vdot + dampened, 1)
    elif best_vdot < current_vdot - 1.0:
        # REGRESSION (>1 VDOT drop): apply in full for safety
        new_vdot = best_vdot
    else:
        # Within ±1 of current — no change needed
        new_vdot = current_vdot

    result["training_vdot"] = new_vdot

    if new_vdot != current_vdot:
        # Store new VDOT and update timestamp
        await db.profile.update_one({}, {"$set": {
            "current_vdot": new_vdot,
            "last_vdot_update": date.today().isoformat(),
        }})

        # Save VO2max history point
        await db.vo2max_history.insert_one({
            "id": make_id(),
            "date": date.today().isoformat(),
            "vdot": new_vdot,
            "measured_vdot": best_vdot,
            "based_on": best_run_info,
            "dampened": new_vdot != best_vdot,
        })

        # Recalculate training paces from new VDOT
        new_paces = vdot_training_paces(new_vdot)
        if new_paces:
            # Update all FUTURE weeks using SESSION_PACE_ZONE mapping
            today_str = date.today().isoformat()
            future_weeks = await db.training_plan.find({"week_start": {"$gte": today_str}}).to_list(100)
            weeks_updated = 0
            for week in future_weeks:
                sessions = week.get("sessions", [])
                updated = False
                for s in sessions:
                    stype = s.get("type", "")
                    daniels_zone = SESSION_PACE_ZONE.get(stype)
                    if daniels_zone and daniels_zone in new_paces:
                        old_pace = s.get("target_pace")
                        new_pace = new_paces[daniels_zone]
                        if old_pace != new_pace:
                            s["target_pace"] = new_pace
                            updated = True
                if updated:
                    await db.training_plan.update_one(
                        {"id": week["id"]},
                        {"$set": {"sessions": sessions, "vdot_based": True, "vdot_value": new_vdot}}
                    )
                    weeks_updated += 1

            result["updated"] = True
            result["new_paces"] = new_paces
            result["weeks_updated"] = weeks_updated

            if current_vdot is not None and new_vdot > current_vdot:
                improvement = round(new_vdot - current_vdot, 1)
                result["message"] = (
                    f"VDOT aggiornato: {current_vdot} → {new_vdot} (+{improvement}) "
                    f"[Daniels 2/3 rule: misurato {best_vdot}, applicato 67%]. "
                    f"Ritmi aggiornati per {weeks_updated} settimane."
                )
                # Push notification
                threshold_pace = new_paces.get("threshold", "")
                await send_push_notification(
                    f"VO2max migliorato! {current_vdot} → {new_vdot} (+{improvement})",
                    f"Nuova soglia: {threshold_pace}/km. Ritmi aggiornati (Daniels' Running Formula)."
                )
            elif new_vdot < current_vdot:
                result["message"] = (
                    f"VDOT ridotto: {current_vdot} → {new_vdot} "
                    f"(regressione rilevata). Ritmi adeguati per {weeks_updated} settimane."
                )
            else:
                result["message"] = f"VDOT impostato a {new_vdot}. Ritmi aggiornati per {weeks_updated} settimane."

            logger.info(result["message"])
        else:
            result["message"] = f"VDOT {new_vdot} calcolato ma impossibile derivare i ritmi"
    else:
        result["message"] = f"VDOT invariato a {new_vdot}"

    return result


async def _process_best_efforts(best_efforts_raw: list, run_doc: dict):
    """Process best efforts from a Strava detailed activity response.
    Compares with stored bests, updates if PR, sends push notification."""
    STANDARD_DISTANCES = ["400m", "1/2 mile", "1k", "1 mile", "2 mile", "5k", "10k", "Half-Marathon"]

    for effort in best_efforts_raw:
        name = effort.get("name", "")
        if name not in STANDARD_DISTANCES:
            continue

        elapsed = effort.get("elapsed_time", 0)
        pr_rank = effort.get("pr_rank")
        distance = effort.get("distance", 0)
        start_date = effort.get("start_date_local", "")[:10]

        if elapsed <= 0 or distance <= 0:
            continue

        # Format time
        if elapsed >= 3600:
            hours = elapsed // 3600
            mins = (elapsed % 3600) // 60
            secs = elapsed % 60
            time_str = f"{hours}:{mins:02d}:{secs:02d}"
        else:
            mins = elapsed // 60
            secs = elapsed % 60
            time_str = f"{mins}:{secs:02d}"

        # Calculate pace per km
        pace_s_per_km = elapsed / (distance / 1000)
        pace_str = f"{int(pace_s_per_km // 60)}:{int(pace_s_per_km % 60):02d}"

        effort_doc = {
            "distance_name": name,
            "distance_m": distance,
            "elapsed_time": elapsed,
            "time_str": time_str,
            "pace": pace_str,
            "date": start_date or run_doc.get("date", ""),
            "run_id": run_doc.get("id"),
            "strava_id": run_doc.get("strava_id"),
            "pr_rank": pr_rank,
        }

        # Check existing best for this distance
        existing = await db.best_efforts.find_one({"distance_name": name}, {"_id": 0})

        is_new_pr = False
        if not existing:
            is_new_pr = True
        elif elapsed < existing.get("elapsed_time", float('inf')):
            is_new_pr = True
        elif pr_rank == 1:
            is_new_pr = True

        if is_new_pr:
            effort_doc["id"] = make_id()
            effort_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.best_efforts.update_one(
                {"distance_name": name},
                {"$set": effort_doc},
                upsert=True,
            )

            # Send push notification for new PR
            old_time = existing.get("time_str", "") if existing else None
            if old_time:
                improvement = existing.get("elapsed_time", 0) - elapsed
                imp_str = f" (-{improvement}s)" if improvement > 0 else ""
                await send_push_notification(
                    f"Nuovo record {name}! {time_str}{imp_str}",
                    f"Hai battuto il tuo PR su {name}: {old_time} -> {time_str}. Passo: {pace_str}/km"
                )
            else:
                await send_push_notification(
                    f"Primo record {name}: {time_str}",
                    f"Registrato il tuo primo best effort su {name}. Passo: {pace_str}/km"
                )

    logger.info(f"Processed best efforts for run {run_doc.get('id')}")


@api_router.get("/best-efforts")
async def get_best_efforts():
    """Return all best efforts with dates."""
    efforts = await db.best_efforts.find({}, {"_id": 0}).to_list(50)
    # Sort by distance
    distance_order = {"400m": 400, "1/2 mile": 805, "1k": 1000, "1 mile": 1609, "2 mile": 3219, "5k": 5000, "10k": 10000, "Half-Marathon": 21097}
    efforts.sort(key=lambda e: distance_order.get(e.get("distance_name", ""), 99999))
    return {"best_efforts": efforts}


@api_router.get("/cadence-history")
async def get_cadence_history():
    """Get cadence data points for the Progressi chart.
    Groups runs by month, picks 3-4 easy runs per month (avg_hr < 80% max_hr
    or type contains easy/lenta), returns [{date, cadence_spm, pace, distance_km}]."""
    MAX_HR = 180
    HR_THRESHOLD = int(MAX_HR * 0.80)  # 144 bpm

    runs = await db.runs.find(
        {"avg_cadence": {"$exists": True, "$ne": None}},
        {"_id": 0, "date": 1, "avg_cadence": 1, "avg_pace": 1, "avg_hr": 1,
         "run_type": 1, "distance_km": 1}
    ).sort("date", 1).to_list(2000)

    if not runs:
        return {"cadence_history": []}

    # Group by month
    from collections import defaultdict
    monthly = defaultdict(list)
    for r in runs:
        run_date = r.get("date", "")
        if len(run_date) >= 7:
            month_key = run_date[:7]  # "YYYY-MM"
            monthly[month_key].append(r)

    cadence_history = []
    for month, month_runs in sorted(monthly.items()):
        # Prefer easy-pace runs for cadence trend (most consistent)
        easy_runs = [
            r for r in month_runs
            if r.get("run_type") in ("corsa_lenta", "lungo", "easy")
            or (r.get("avg_hr") and r["avg_hr"] < HR_THRESHOLD)
        ]
        sample = easy_runs if easy_runs else month_runs

        # Aggregate monthly average
        cadences = [r["avg_cadence"] for r in sample if r.get("avg_cadence")]
        if cadences:
            cadence_history.append({
                "month": month,
                "avg_cadence": round(sum(cadences) / len(cadences)),
                "runs_count": len(cadences),
            })

    return {"cadence_history": cadence_history}


@api_router.get("/runs/{run_id}/splits")
async def get_run_splits(run_id: str):
    """Return the per-km splits for a specific run."""
    run = await db.runs.find_one({"id": run_id}, {"_id": 0, "id": 1, "date": 1, "splits": 1, "distance_km": 1, "avg_pace": 1})
    if not run:
        raise HTTPException(404, "Corsa non trovata")
    splits = run.get("splits", [])
    return {
        "run_id": run_id,
        "date": run.get("date", ""),
        "distance_km": run.get("distance_km", 0),
        "avg_pace": run.get("avg_pace", ""),
        "splits": splits,
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
    """Scientifically-grounded auto-adaptation of the training plan.

    Called after every Strava sync. Adjusts VOLUME only (paces are handled
    by auto_recalculate_vdot via Daniels' VDOT).

    Scientific references:
    ──────────────────────────────────────────────────────────────────────
    [1] Daniels, J. (2014). Daniels' Running Formula, 4th ed. Human Kinetics.
        → VDOT-based pace zones. Conservative updates: 2/3 of improvement,
          max +1 VDOT per mesocycle (4-6 weeks). Paces handled separately.

    [2] Impellizzeri, F.M. et al. (2020). Int J Sports Physiol Perform, 15(5).
        "Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls"
        → Il ratio ACWR soffre di mathematical coupling (il carico acuto è
          già incluso nel cronico), producendo artefatti statistici spuri.
          Raccomandazione: monitorare carico acuto e cronico SEPARATAMENTE,
          non come ratio. Il ratio non è validato per decisioni di training.
        Supportato da: BMC Sports Medicine meta-analisi (2025) — l'ACWR è
        associato al rischio infortuni ma va usato con cautela data
        l'eterogeneità degli studi.

    [3] ACSM (2013). Guidelines for Exercise Testing and Prescription, 9th ed.
        → Weekly volume increase ≤ 10%. Il guardrail pratico più robusto
          per la progressione del carico, non dipende da ratio spuri.

    [4] Seiler, S. (2010). Int J Sports Physiol Perform, 5(3), 276-291.
        "What is best practice for training intensity and duration distribution?"
        → Polarized model: ≥80% training in Zone 1 (< VT1 = 80% HRmax),
          ≤5% Zone 2, ~15-20% Zone 3 (> VT2 = 88% HRmax).

    [5] Foster, C. (1998). Med Sci Sports Exerc, 30(7), 1164-1168.
        "Monitoring training in athletes with reference to overtraining syndrome"
        → Monotony = mean(daily_load) / SD(daily_load). Threshold: >2.0.
          Strain = weekly_load × monotony.

    [6] Mujika, I. & Padilla, S. (2003). Med Sci Sports Exerc, 35(7), 1182-1187.
        "Scientific bases for precompetition tapering strategies"
        → Optimal taper: reduce volume 40-60%, maintain intensity, 2-3 weeks.

    NOTA METODOLOGICA: Questo sistema NON usa il ratio ACWR come decisore.
    Come evidenziato da Impellizzeri et al. (2020), il ratio soffre di
    mathematical coupling e produce artefatti. Al suo posto usiamo:
    - Monitoraggio SEPARATO del carico acuto (7gg) e cronico (28gg)
    - Regola del 10%/settimana come guardrail primario (ACSM)
    - Spike detection: variazione settimana-su-settimana in valore assoluto
    ──────────────────────────────────────────────────────────────────────
    """

    # ══════════════════════════════════════════════════════════════════
    # CONSTANTS
    # ══════════════════════════════════════════════════════════════════
    MONOTONY_THRESHOLD = 2.0              # Foster 1998
    MIN_RUNS_FOR_ADAPTATION = 5           # need sufficient data
    DEFAULT_INTENSITY = 0.72              # midpoint Z2 easy running (~130/180)
    # Spike thresholds (Impellizzeri 2020: monitor loads separately)
    WEEKLY_SPIKE_DANGER_PCT = 30          # >30% week-over-week = spike pericoloso
    WEEKLY_SPIKE_CAUTION_PCT = 20         # >20% = cautela

    # Phase-specific volume caps (Daniels periodization + ACSM 10% rule)
    PHASE_CAPS = {
        "Ripresa":                 {"max_km": 35,  "max_increase": 0.08, "max_long_km": 12},
        "Base Aerobica":           {"max_km": 48,  "max_increase": 0.10, "max_long_km": 18},
        "Sviluppo":                {"max_km": 55,  "max_increase": 0.10, "max_long_km": 22},
        "Preparazione Specifica":  {"max_km": 60,  "max_increase": 0.10, "max_long_km": 24},
        "Picco":                   {"max_km": 58,  "max_increase": 0.05, "max_long_km": 22},
        "Tapering":                {"max_km": 40,  "max_increase": 0.00, "max_long_km": 16},
    }

    # ══════════════════════════════════════════════════════════════════
    # STEP 1 — DATA COLLECTION
    # ══════════════════════════════════════════════════════════════════
    today = date.today()
    profile = await db.profile.find_one({}, {"_id": 0}) or {}
    max_hr = profile.get("max_hr", 180)

    # Load 8 weeks of runs
    eight_weeks_ago = (today - timedelta(days=56)).isoformat()
    runs = await db.runs.find(
        {"date": {"$gte": eight_weeks_ago}}, {"_id": 0}
    ).sort("date", 1).to_list(500)

    if len(runs) < MIN_RUNS_FOR_ADAPTATION:
        return {
            "adapted": False,
            "adaptation_type": "insufficient_data",
            "message": f"Solo {len(runs)} corse nelle ultime 8 settimane. "
                       f"Servono almeno {MIN_RUNS_FOR_ADAPTATION} per un'analisi affidabile.",
            "science": "Servono ≥4 settimane di dati per stabilizzare il carico cronico."
        }

    all_weeks = await db.training_plan.find({}, {"_id": 0}).to_list(200)
    future_weeks = [w for w in all_weeks if w.get("week_start", "") >= today.isoformat()]
    if not future_weeks:
        return {"adapted": False, "adaptation_type": "none", "message": "Nessuna settimana futura nel piano."}

    current_phase = future_weeks[0].get("phase", "Base Aerobica")
    phase_cap = PHASE_CAPS.get(current_phase, PHASE_CAPS["Base Aerobica"])

    # ══════════════════════════════════════════════════════════════════
    # STEP 2 — WEEKLY LOAD TRACKING (Impellizzeri 2020: separate monitoring)
    # ══════════════════════════════════════════════════════════════════
    # Instead of ACWR ratio (mathematically coupled, produces spurious
    # correlations), we track acute and chronic loads INDEPENDENTLY
    # and detect spikes via week-over-week absolute change.

    # Build daily training loads: simplified TRIMP = distance × (avg_hr / max_hr)
    daily_loads = {}
    for run in runs:
        d = run.get("date", "")
        dist = run.get("distance_km", 0)
        hr = run.get("avg_hr")
        intensity = (hr / max_hr) if (hr and max_hr > 0) else DEFAULT_INTENSITY
        load = dist * intensity
        daily_loads[d] = daily_loads.get(d, 0) + load

    # Compute weekly load totals for last 8 weeks
    weekly_loads = []
    for w in range(8):
        wk_start = today - timedelta(days=(w + 1) * 7)
        wk_end = today - timedelta(days=w * 7)
        wk_total = 0.0
        wk_km = 0.0
        cursor = wk_start
        while cursor < wk_end:
            d = cursor.isoformat()
            wk_total += daily_loads.get(d, 0)
            # Also track raw km
            for run in runs:
                if run.get("date", "") == d:
                    wk_km += run.get("distance_km", 0)
            cursor += timedelta(days=1)
        weekly_loads.append({"load": round(wk_total, 2), "km": round(wk_km, 1)})

    # weekly_loads[0] = most recent complete week, [1] = week before, etc.
    current_week_load = weekly_loads[0]["load"]
    current_week_km = weekly_loads[0]["km"]
    prev_week_load = weekly_loads[1]["load"] if len(weekly_loads) > 1 else current_week_load
    prev_week_km = weekly_loads[1]["km"] if len(weekly_loads) > 1 else current_week_km

    # Chronic load = average of weeks 1-4 (28 days)
    chronic_loads = [w["load"] for w in weekly_loads[:4] if w["load"] > 0]
    chronic_avg = sum(chronic_loads) / len(chronic_loads) if chronic_loads else current_week_load
    chronic_km = sum(w["km"] for w in weekly_loads[:4]) / max(len([w for w in weekly_loads[:4] if w["km"] > 0]), 1)

    # Week-over-week change (the primary spike detector)
    if prev_week_km > 0:
        wow_change_pct = round(((current_week_km - prev_week_km) / prev_week_km) * 100, 1)
    else:
        wow_change_pct = 0.0

    # ══════════════════════════════════════════════════════════════════
    # STEP 3 — INTENSITY DISTRIBUTION (Seiler 2010)
    # ══════════════════════════════════════════════════════════════════
    # Classify each run by avg_hr zone (acknowledged limitation: avg_hr
    # is a proxy for time-in-zone, which Strava summary data doesn't provide)
    four_weeks_ago = (today - timedelta(days=28)).isoformat()
    recent_runs = [r for r in runs if r.get("date", "") >= four_weeks_ago]

    z1_count = z2_count = z3_count = runs_with_hr = 0
    for run in recent_runs:
        hr = run.get("avg_hr")
        if not hr:
            continue
        runs_with_hr += 1
        hr_pct = hr / max_hr
        if hr_pct < 0.80:       # Zone 1: below VT1 (easy)
            z1_count += 1
        elif hr_pct < 0.88:     # Zone 2: VT1-VT2 (threshold/tempo)
            z2_count += 1
        else:                   # Zone 3: above VT2 (interval/VO2max)
            z3_count += 1

    polarization_easy_pct = (z1_count / runs_with_hr) if runs_with_hr >= 5 else 0.80
    polarization_alert = None
    if runs_with_hr >= 5:
        if polarization_easy_pct < 0.70:
            polarization_alert = "troppa_intensita"
        elif polarization_easy_pct > 0.92:
            polarization_alert = "poca_intensita"

    # ══════════════════════════════════════════════════════════════════
    # STEP 4 — TRAINING MONOTONY & STRAIN (Foster 1998)
    # ══════════════════════════════════════════════════════════════════
    last_7_days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    week_loads_daily = [daily_loads.get(d, 0) for d in last_7_days]
    weekly_total = sum(week_loads_daily)
    mean_load = weekly_total / 7.0
    variance = sum((l - mean_load) ** 2 for l in week_loads_daily) / 7.0
    sd_load = math.sqrt(variance) if variance > 0 else 0.01
    monotony = round(mean_load / sd_load, 2) if sd_load > 0.01 else 0.0
    strain = round(weekly_total * monotony, 1)

    # ══════════════════════════════════════════════════════════════════
    # STEP 5 — LAST COMPLETED WEEK VOLUME (for ACSM 10% cap)
    # ══════════════════════════════════════════════════════════════════
    last_week_start = (today - timedelta(days=today.weekday() + 7)).isoformat()
    last_week_end = (today - timedelta(days=today.weekday() + 1)).isoformat()
    last_week_runs = [r for r in runs if last_week_start <= r.get("date", "") <= last_week_end]
    last_week_km = sum(r.get("distance_km", 0) for r in last_week_runs)

    # ══════════════════════════════════════════════════════════════════
    # STEP 6 — DECISION ENGINE
    # ══════════════════════════════════════════════════════════════════
    volume_multiplier = 1.0
    alerts = []
    science_notes = []
    adaptation_type = "none"

    # A) LOAD SPIKE DETECTION (Impellizzeri 2020: separate monitoring)
    #    Instead of ACWR ratio (mathematical coupling problem), we detect
    #    dangerous week-over-week spikes directly.
    if wow_change_pct > WEEKLY_SPIKE_DANGER_PCT:
        volume_multiplier = 0.85  # reduce 15%
        adaptation_type = "load_spike_reduction"
        alerts.append(
            f"⚠️ Spike di carico: +{wow_change_pct}% settimana-su-settimana "
            f"(>{WEEKLY_SPIKE_DANGER_PCT}%). Volume ridotto del 15%."
        )
        science_notes.append(
            "Impellizzeri et al. (2020): spike di carico >30% settimana-su-settimana "
            "associati a rischio infortunio elevato. Monitoraggio separato del carico "
            "acuto e cronico (non come ratio ACWR, che soffre di mathematical coupling)."
        )
    elif wow_change_pct > WEEKLY_SPIKE_CAUTION_PCT:
        volume_multiplier = 0.92  # reduce 8%
        adaptation_type = "load_spike_caution"
        alerts.append(
            f"⚡ Aumento carico rapido: +{wow_change_pct}% settimana-su-settimana. "
            f"Volume ridotto dell'8% per evitare spike."
        )
        science_notes.append(
            "Aumento >20% settimanale: si applica cautela. "
            "ACSM (2013): la regola del 10% è il guardrail più robusto."
        )
    elif wow_change_pct < -25 and current_phase not in ["Tapering", "Ripresa"]:
        # Big drop = potential detraining or missed sessions
        alerts.append(
            f"💡 Calo carico: {wow_change_pct}% settimana-su-settimana. "
            f"Assicurati di non saltare troppe sessioni."
        )
        science_notes.append(
            "Calo significativo del carico: rischio perdita adattamenti se prolungato. "
            "La continuità del carico è più importante dell'intensità occasionale."
        )
    else:
        science_notes.append(
            f"Carico settimanale stabile ({wow_change_pct:+.1f}% WoW). "
            f"Acuto: {current_week_load:.1f}, Cronico medio: {chronic_avg:.1f} "
            f"(monitorati separatamente, Impellizzeri 2020)."
        )

    # B) Monotony guard (Foster 1998)
    if monotony > MONOTONY_THRESHOLD:
        alerts.append(
            f"⚠️ Monotonia allenamento: {monotony} (>{MONOTONY_THRESHOLD}). "
            f"Troppa uniformità nei carichi giornalieri."
        )
        science_notes.append(
            "Foster (1998): monotonia >2.0 associata a rischio overtraining. "
            "Consigliato variare l'intensità tra i giorni e inserire riposo attivo."
        )
        # Small additional volume reduction
        volume_multiplier = min(volume_multiplier, volume_multiplier * 0.95)

    # C) Polarization check (Seiler 2010)
    if runs_with_hr >= 5:
        if polarization_alert == "troppa_intensita":
            alerts.append(
                f"⚠️ Solo {polarization_easy_pct*100:.0f}% corse facili "
                f"(Seiler: target ≥80%). Troppa intensità — rischio overtraining."
            )
            science_notes.append(
                "Seiler (2010): distribuzione polarizzata (≥80% easy) ottimizza "
                "gli adattamenti aerobici e riduce il rischio di sovrallenamento."
            )
        elif polarization_alert == "poca_intensita":
            alerts.append(
                f"💡 {polarization_easy_pct*100:.0f}% corse facili. "
                f"Servono più stimoli ad alta intensità (15-20% del volume)."
            )
            science_notes.append(
                "Seiler (2010): almeno 15-20% del volume deve essere ad alta intensità "
                "per stimolare adattamenti periferici e centrali."
            )

    # D) Phase-specific volume cap (Daniels periodization)
    if current_phase == "Tapering":
        # Mujika & Padilla 2003: progressive taper
        taper_weeks = [w for w in all_weeks if w.get("phase") == "Tapering"]
        taper_week_nums = sorted([w.get("week_number", 0) for w in taper_weeks])
        current_week_num = future_weeks[0].get("week_number", 0) if future_weeks else 0

        if current_week_num in taper_week_nums:
            taper_idx = taper_week_nums.index(current_week_num)
            # Progressive non-linear taper: week 1 → -20%, week 2 → -40%, week 3 → -55%
            taper_reductions = [0.80, 0.60, 0.45]
            taper_mult = taper_reductions[min(taper_idx, len(taper_reductions) - 1)]
            volume_multiplier = min(volume_multiplier, taper_mult)
            science_notes.append(
                f"Mujika & Padilla (2003): taper settimana {taper_idx + 1} — "
                f"volume al {taper_mult*100:.0f}% del picco, intensità mantenuta."
            )
        adaptation_type = "taper_mujika"
    else:
        science_notes.append(
            f"Fase '{current_phase}': volume max {phase_cap['max_km']}km/sett, "
            f"incremento max {phase_cap['max_increase']*100:.0f}% (ACSM 2013), "
            f"lungo max {phase_cap['max_long_km']}km."
        )

    # E) If no adjustments needed
    if volume_multiplier == 1.0 and not alerts:
        await db.adaptation_log.insert_one({
            "id": str(uuid.uuid4()),
            "date": today.isoformat(),
            "adapted": False,
            "acute_load": current_week_load,
            "chronic_load": chronic_avg,
            "wow_change_pct": wow_change_pct,
            "monotony": monotony,
            "strain": strain,
            "polarization_z1_pct": round(polarization_easy_pct * 100),
            "phase": current_phase,
            "volume_multiplier": 1.0,
            "decisions": ["Nessun adattamento necessario — piano in linea."],
        })
        return {
            "adapted": False,
            "adaptation_type": "none",
            "message": "Piano in linea con le performance. Nessun adattamento necessario.",
            "metrics": {
                "acute_load": round(current_week_load, 1),
                "chronic_load": round(chronic_avg, 1),
                "wow_change_pct": wow_change_pct,
                "current_week_km": round(current_week_km, 1),
                "chronic_avg_km": round(chronic_km, 1),
                "monotony": monotony,
                "strain": strain,
                "polarization_easy_pct": round(polarization_easy_pct * 100),
                "weekly_km": round(last_week_km, 1),
            },
            "science": science_notes,
        }

    # ══════════════════════════════════════════════════════════════════
    # STEP 7 — APPLY VOLUME ADJUSTMENTS TO FUTURE WEEKS
    # ══════════════════════════════════════════════════════════════════
    adapted_weeks = 0
    decisions = []

    for week in future_weeks:
        old_km = week.get("target_km", 40)
        new_km = round(old_km * volume_multiplier, 1)

        # ACSM 10% rule: cap increase relative to last completed week
        if last_week_km > 0 and new_km > last_week_km:
            acsm_cap = round(last_week_km * (1 + phase_cap["max_increase"]), 1)
            new_km = min(new_km, acsm_cap)

        # Phase cap
        new_km = min(new_km, phase_cap["max_km"])

        # Don't reduce below 15km (minimum viable training)
        new_km = max(new_km, 15.0)

        new_sessions = []
        for session in week.get("sessions", []):
            new_session = session.copy()

            # Adjust session distance proportionally
            if session.get("target_distance_km") and session["target_distance_km"] > 0:
                ratio = new_km / old_km if old_km > 0 else 1.0
                new_dist = round(session["target_distance_km"] * ratio, 1)
                # Long run cap from phase
                if session.get("type") == "lungo":
                    new_dist = min(new_dist, phase_cap["max_long_km"])
                # General single-run cap
                new_dist = max(new_dist, 2.0)
                new_session["target_distance_km"] = new_dist

            # NOTE: paces are NOT modified here.
            # Pace updates are handled by auto_recalculate_vdot() using
            # Daniels' VDOT with the 2/3 improvement rule.

            new_sessions.append(new_session)

        await db.training_plan.update_one(
            {"id": week["id"]},
            {"$set": {
                "target_km": new_km,
                "sessions": new_sessions,
                "auto_adapted": True,
                "adaptation_date": today.isoformat(),
                "adaptation_type": adaptation_type,
                "adaptation_metrics": {
                    "acute_load": round(current_week_load, 2),
                    "chronic_load": round(chronic_avg, 2),
                    "wow_change_pct": wow_change_pct,
                    "monotony": monotony,
                    "volume_multiplier": round(volume_multiplier, 3),
                },
            }}
        )
        adapted_weeks += 1

    # ══════════════════════════════════════════════════════════════════
    # STEP 8 — LOG & RETURN
    # ══════════════════════════════════════════════════════════════════
    vol_change_pct = round((volume_multiplier - 1) * 100)
    decisions = alerts.copy()
    if vol_change_pct != 0:
        direction = "aumentato" if vol_change_pct > 0 else "ridotto"
        decisions.append(f"Volume {direction} del {abs(vol_change_pct)}%.")

    # Persist adaptation log for trend analysis
    await db.adaptation_log.insert_one({
        "id": str(uuid.uuid4()),
        "date": today.isoformat(),
        "adapted": True,
        "acute_load": current_week_load,
        "chronic_load": chronic_avg,
        "wow_change_pct": wow_change_pct,
        "monotony": monotony,
        "strain": strain,
        "polarization_z1_pct": round(polarization_easy_pct * 100),
        "phase": current_phase,
        "volume_multiplier": round(volume_multiplier, 3),
        "adapted_weeks": adapted_weeks,
        "decisions": decisions,
    })

    # Build message
    msg_parts = []
    if vol_change_pct != 0:
        direction = "aumentato" if vol_change_pct > 0 else "ridotto"
        msg_parts.append(f"Volume {direction} del {abs(vol_change_pct)}% per {adapted_weeks} settimane.")
    msg_parts.extend(alerts)

    return {
        "adapted": True,
        "adaptation_type": adaptation_type,
        "volume_multiplier": round(volume_multiplier, 3),
        "adapted_weeks": adapted_weeks,
        "metrics": {
            "acute_load": round(current_week_load, 1),
            "chronic_load": round(chronic_avg, 1),
            "wow_change_pct": wow_change_pct,
            "current_week_km": round(current_week_km, 1),
            "chronic_avg_km": round(chronic_km, 1),
            "monotony": monotony,
            "strain": strain,
            "polarization_easy_pct": round(polarization_easy_pct * 100),
            "z1_runs": z1_count,
            "z2_runs": z2_count,
            "z3_runs": z3_count,
            "weekly_km": round(last_week_km, 1),
        },
        "alerts": alerts,
        "science": science_notes,
        "message": " ".join(msg_parts) if msg_parts else "Piccoli aggiustamenti applicati.",
    }


@api_router.get("/weekly-history")
async def get_weekly_history():
    history = await db.weekly_history.find({}, {"_id": 0}).sort("week_start", 1).to_list(200)
    return {"history": history}

@api_router.get("/injury-risk")
async def get_injury_risk():
    """Calculate injury risk score based on training load, intensity, and injury history."""
    runs = await db.runs.find({}, {"_id": 0}).sort("date", 1).to_list(2000)
    profile = await db.profile.find_one({}, {"_id": 0}) or {}
    today = date.today()
    max_hr = profile.get("max_hr", 180)

    valid_runs = [r for r in runs if r.get("distance_km", 0) > 0.5 and r.get("date")]

    # ---- Weekly load history (last 12 weeks) ----
    weekly_load = []
    for w in range(11, -1, -1):
        week_start = today - timedelta(days=today.weekday() + 7 * w)
        week_end = week_start + timedelta(days=6)
        ws = week_start.isoformat()
        we = week_end.isoformat()
        week_runs = [r for r in valid_runs if ws <= r.get("date", "") <= we]
        km = sum(r.get("distance_km", 0) for r in week_runs)
        avg_pace_secs = 0
        if week_runs:
            paces = [_pace_to_seconds(r.get("avg_pace", "")) for r in week_runs if _pace_to_seconds(r.get("avg_pace", "")) > 0]
            avg_pace_secs = sum(paces) / len(paces) if paces else 0
        avg_hr = 0
        hr_runs = [r for r in week_runs if r.get("avg_hr")]
        if hr_runs:
            avg_hr = round(sum(r["avg_hr"] for r in hr_runs) / len(hr_runs))
        weekly_load.append({
            "week_start": ws,
            "week_label": f"{week_start.day}/{week_start.month}",
            "km": round(km, 1),
            "runs": len(week_runs),
            "avg_pace_secs": round(avg_pace_secs),
            "avg_hr": avg_hr,
            "increase_pct": None,
        })

    # Calculate week-over-week increase percentages
    for i in range(1, len(weekly_load)):
        prev_km = weekly_load[i - 1]["km"]
        curr_km = weekly_load[i]["km"]
        if prev_km > 0:
            weekly_load[i]["increase_pct"] = round((curr_km - prev_km) / prev_km * 100, 1)
        elif curr_km > 0:
            weekly_load[i]["increase_pct"] = 100.0

    # ---- RISK FACTORS ----
    factors = []
    alerts = []
    recommendations = []

    # 1. ACWR (Acute:Chronic Workload Ratio)
    # Acute = last 1 week, Chronic = average of last 4 weeks
    acute_km = weekly_load[-1]["km"] if weekly_load else 0
    chronic_km = sum(w["km"] for w in weekly_load[-4:]) / 4 if len(weekly_load) >= 4 else acute_km
    acwr = round(acute_km / max(chronic_km, 0.1), 2)
    acwr_score = 0
    if acwr <= 0.8:
        acwr_score = 15  # undertrained
        factors.append({"name": "Carico acuto/cronico (ACWR)", "score": acwr_score,
                        "description": f"ACWR {acwr} — Sottoccarico. Potresti aumentare gradualmente."})
    elif acwr <= 1.3:
        acwr_score = 10  # sweet spot
        factors.append({"name": "Carico acuto/cronico (ACWR)", "score": acwr_score,
                        "description": f"ACWR {acwr} — Zona ottimale (0.8-1.3). Ottimo bilanciamento."})
    elif acwr <= 1.5:
        acwr_score = 50
        factors.append({"name": "Carico acuto/cronico (ACWR)", "score": acwr_score,
                        "description": f"ACWR {acwr} — Zona di attenzione. Carico in aumento rapido."})
        alerts.append({"level": "medium", "message": f"ACWR a {acwr}: il carico questa settimana è significativamente più alto della media. Monitora i segnali del corpo."})
    else:
        acwr_score = 85
        factors.append({"name": "Carico acuto/cronico (ACWR)", "score": acwr_score,
                        "description": f"ACWR {acwr} — Zona critica (>1.5). Rischio infortunio elevato!"})
        alerts.append({"level": "critical", "message": f"ACWR a {acwr}: il carico è troppo alto rispetto alle ultime settimane! Riduci il volume o l'intensità."})

    # 2. Week-over-week increase >20%
    last_increase = weekly_load[-1].get("increase_pct") if weekly_load else None
    overload_score = 0
    if last_increase is not None:
        if last_increase > 30:
            overload_score = 80
            alerts.append({"level": "high", "message": f"Aumento del {round(last_increase)}% questa settimana! La regola del 10% suggerisce incrementi più graduali."})
            recommendations.append(f"Riduci il lungo di questa settimana di {round(acute_km * 0.15, 1)}km per restare sotto il +20%.")
        elif last_increase > 20:
            overload_score = 55
            alerts.append({"level": "medium", "message": f"Aumento del {round(last_increase)}% questa settimana. Al limite della soglia sicura."})
        elif last_increase > 10:
            overload_score = 25
        else:
            overload_score = 10
    factors.append({"name": "Incremento settimanale", "score": overload_score,
                    "description": f"Variazione: {'+' if last_increase and last_increase > 0 else ''}{round(last_increase or 0)}% rispetto alla settimana precedente."})

    # 3. Injury history factor (always elevated for post-injury runner)
    injury = profile.get("injury", {})
    injury_score = 40  # baseline elevated for post-injury
    if injury:
        injury_type = injury.get("type", "")
        if "tendine" in injury_type.lower() or "achille" in injury_type.lower():
            injury_score = 55
        factors.append({"name": "Storico infortuni", "score": injury_score,
                        "description": f"Post-infortunio: {injury_type}. Rischio sempre elevato in fase di ritorno."})
        recommendations.append("Mantieni sempre una progressione graduale. Il tendine ha bisogno di mesi per adattarsi ai carichi.")
    else:
        injury_score = 10
        factors.append({"name": "Storico infortuni", "score": injury_score,
                        "description": "Nessun infortunio recente registrato."})

    # 4. Intensity factor (avg HR of recent runs)
    recent_runs_hr = [r for r in valid_runs if r.get("avg_hr") and r.get("date", "") >= (today - timedelta(days=14)).isoformat()]
    intensity_score = 10
    if recent_runs_hr:
        avg_recent_hr = sum(r["avg_hr"] for r in recent_runs_hr) / len(recent_runs_hr)
        hr_pct = avg_recent_hr / max_hr * 100
        if hr_pct > 85:
            intensity_score = 70
            alerts.append({"level": "high", "message": f"FC media delle ultime 2 settimane al {round(hr_pct)}% della FCmax. Troppa intensità."})
        elif hr_pct > 78:
            intensity_score = 45
        elif hr_pct > 70:
            intensity_score = 25
        factors.append({"name": "Intensità recente", "score": intensity_score,
                        "description": f"FC media ultime 2 settimane: {round(avg_recent_hr)} bpm ({round(hr_pct)}% FCmax)."})
    else:
        factors.append({"name": "Intensità recente", "score": intensity_score,
                        "description": "Dati FC insufficienti per valutare l'intensità."})

    # 5. Recovery days
    dates_last_14 = set()
    for r in valid_runs:
        if r.get("date", "") >= (today - timedelta(days=14)).isoformat():
            dates_last_14.add(r["date"])
    run_days = len(dates_last_14)
    rest_days = 14 - run_days
    recovery_score = 10
    if rest_days < 3:
        recovery_score = 65
        alerts.append({"level": "medium", "message": f"Solo {rest_days} giorni di riposo negli ultimi 14. Serve più recupero."})
        recommendations.append("Inserisci almeno 2 giorni di riposo completo a settimana.")
    elif rest_days < 5:
        recovery_score = 35
    factors.append({"name": "Giorni di recupero", "score": recovery_score,
                    "description": f"{rest_days} giorni di riposo negli ultimi 14 giorni ({run_days} giorni di corsa)."})

    # ---- OVERALL SCORE ----
    weights = [0.30, 0.25, 0.20, 0.15, 0.10]  # ACWR, overload, injury, intensity, recovery
    scores = [acwr_score, overload_score, injury_score, intensity_score, recovery_score]
    overall_score = round(sum(w * s for w, s in zip(weights, scores)))

    # General recommendations
    if overall_score <= 30:
        recommendations.append("Il tuo carico è ben bilanciato. Continua così!")
    elif overall_score <= 55:
        recommendations.append("Carico moderato. Ascolta il tuo corpo e non saltare i giorni di recupero.")
    else:
        recommendations.append("Rischio elevato: considera una settimana di scarico con -30% di volume.")
        recommendations.append("Priorità al sonno (8+ ore) e all'alimentazione per favorire il recupero.")

    return {
        "overall_score": overall_score,
        "factors": factors,
        "alerts": alerts,
        "recommendations": recommendations,
        "weekly_load_history": weekly_load,
    }


# Include router + middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint — also used by keep-alive pinger."""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


_keep_alive_task = None

async def _keep_alive_pinger():
    """Self-ping every 14 minutes to prevent Render free tier from sleeping.
    Render sleeps after 15 min inactivity — this keeps the server warm."""
    import httpx
    backend_url = os.environ.get("RENDER_EXTERNAL_URL", "https://corralejo-backend.onrender.com")
    while True:
        await asyncio.sleep(14 * 60)  # 14 minutes
        try:
            async with httpx.AsyncClient(timeout=30) as client_http:
                resp = await client_http.get(f"{backend_url}/health")
                logger.info(f"Keep-alive ping: {resp.status_code}")
        except Exception as e:
            logger.warning(f"Keep-alive ping failed: {e}")


@app.on_event("startup")
async def startup_scheduler():
    global _weekly_report_task, _keep_alive_task
    _weekly_report_task = asyncio.create_task(_weekly_report_scheduler())
    _keep_alive_task = asyncio.create_task(_keep_alive_pinger())
    logger.info("Weekly report scheduler and keep-alive pinger started")


@app.on_event("shutdown")
async def shutdown_db_client():
    global _weekly_report_task, _keep_alive_task
    if _weekly_report_task:
        _weekly_report_task.cancel()
    if _keep_alive_task:
        _keep_alive_task.cancel()
    client.close()
