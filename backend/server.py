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

def generate_training_plan():
    """Generate complete training plan from March 9, 2026 to December 12, 2026"""
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

            sessions = generate_week_sessions(phase["name"], week_num, target_km, week_start, i, phase["weeks"], is_recovery)

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

def generate_week_sessions(phase, week_num, target_km, week_start, phase_week, total_phase_weeks, is_recovery=False):
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
        templates = [
            {"day": 0, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Recupero attivo", "km": round(target_km * 0.13, 1), "pace": "5:25", "dur": None},
            {"day": 1, "type": "ripetute", "title": "Ripetute Medie", "desc": "2km riscaldamento + 5x2000m a 4:35 (rec 2:30) + defaticamento", "km": round(target_km * 0.22, 1), "pace": "4:35", "dur": None},
            {"day": 2, "type": "cyclette", "title": "Cyclette Recupero", "desc": "45min cyclette + core stability", "km": 0, "pace": None, "dur": 45},
            {"day": 3, "type": "progressivo", "title": "Medio Progressivo", "desc": "8km progressivo da 5:15 a 4:40", "km": round(target_km * 0.18, 1), "pace": "4:55", "dur": None},
            {"day": 4, "type": "rinforzo", "title": "Rinforzo + Riposo", "desc": "Rinforzo muscolare specifico runner", "km": 0, "pace": None, "dur": 45},
            {"day": 5, "type": "corsa_lenta", "title": "Corsa Pre-Lungo", "desc": "Corsa facile + allunghi", "km": round(target_km * 0.14, 1), "pace": "5:20", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo Progressivo", "desc": "Lungo con ultimi 3km a ritmo gara", "km": round(target_km * 0.33, 1), "pace": "5:10", "dur": None},
        ]
    elif phase == "Preparazione Specifica":
        templates = [
            {"day": 0, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Recupero", "km": round(target_km * 0.12, 1), "pace": "5:20", "dur": None},
            {"day": 1, "type": "ripetute", "title": "Ripetute Gara", "desc": "2km riscaldamento + 4x3000m a 4:30 (rec 3min) + defaticamento", "km": round(target_km * 0.24, 1), "pace": "4:30", "dur": None},
            {"day": 2, "type": "cyclette", "title": "Cyclette + Core", "desc": "50min cyclette moderata + core stability", "km": 0, "pace": None, "dur": 50},
            {"day": 3, "type": "progressivo", "title": "Tempo Run", "desc": "10km a ritmo medio-veloce 4:40-4:35", "km": round(target_km * 0.2, 1), "pace": "4:38", "dur": None},
            {"day": 4, "type": "riposo", "title": "Riposo", "desc": "Recupero completo + stretching", "km": 0, "pace": None, "dur": 0},
            {"day": 5, "type": "corsa_lenta", "title": "Corsa Facile", "desc": "Corsa facile + 8 allunghi", "km": round(target_km * 0.13, 1), "pace": "5:15", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo Specifico", "desc": "Lungo con ultimi 5km a ritmo gara 4:30", "km": round(target_km * 0.31, 1), "pace": "5:00", "dur": None},
        ]
    elif phase == "Picco":
        templates = [
            {"day": 0, "type": "corsa_lenta", "title": "Corsa Lenta", "desc": "Recupero attivo", "km": round(target_km * 0.12, 1), "pace": "5:15", "dur": None},
            {"day": 1, "type": "ripetute", "title": "Ripetute Veloci", "desc": "2km riscaldamento + 8x1000m a 4:15 (rec 2min) + defaticamento", "km": round(target_km * 0.22, 1), "pace": "4:15", "dur": None},
            {"day": 2, "type": "cyclette", "title": "Cyclette Recupero", "desc": "40min cyclette leggera", "km": 0, "pace": None, "dur": 40},
            {"day": 3, "type": "progressivo", "title": "Simulazione Gara", "desc": "12km progressivo chiudendo a 4:30", "km": round(target_km * 0.22, 1), "pace": "4:45", "dur": None},
            {"day": 4, "type": "rinforzo", "title": "Rinforzo Leggero", "desc": "Rinforzo muscolare mantenimento", "km": 0, "pace": None, "dur": 35},
            {"day": 5, "type": "corsa_lenta", "title": "Corsa Pre-Lungo", "desc": "Corsa facile + allunghi", "km": round(target_km * 0.12, 1), "pace": "5:15", "dur": None},
            {"day": 6, "type": "lungo", "title": "Lungo di Picco", "desc": "Lungo fino a 20km con ritmo gara negli ultimi 6km", "km": round(target_km * 0.32, 1), "pace": "4:55", "dur": None},
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
        sessions.append({
            "day": DAYS_IT[t["day"]],
            "date": session_date.isoformat(),
            "type": t["type"],
            "title": t["title"],
            "description": t["desc"],
            "target_distance_km": t["km"],
            "target_pace": t["pace"],
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
    await db.runs.insert_many(get_seed_runs())

    plan = generate_training_plan()
    if plan:
        await db.training_plan.insert_many(plan)

    await db.supplements.insert_many(get_supplements())
    await db.exercises.insert_many(get_exercises())
    await db.test_schedule.insert_many(get_test_schedule())

    return {"status": "ok", "message": "Dati inizializzati con successo", "weeks": len(plan)}

@api_router.get("/dashboard")
async def get_dashboard():
    profile = await db.profile.find_one({}, {"_id": 0})
    today = date.today().isoformat()

    current_week = await db.training_plan.find_one(
        {"week_start": {"$lte": today}, "week_end": {"$gte": today}},
        {"_id": 0}
    )

    recent_runs = await db.runs.find({}, {"_id": 0}).sort("date", -1).limit(5).to_list(5)
    total_runs = await db.runs.count_documents({})

    all_runs = await db.runs.find({}, {"_id": 0, "distance_km": 1}).to_list(1000)
    total_km = sum(r.get("distance_km", 0) for r in all_runs)

    history = await db.weekly_history.find({}, {"_id": 0}).sort("week_start", -1).limit(12).to_list(12)

    race_date = date(2026, 12, 12)
    days_to_race = (race_date - date.today()).days

    next_test = await db.test_schedule.find_one(
        {"scheduled_date": {"$gte": today}, "completed": False},
        {"_id": 0}
    )

    return {
        "profile": profile,
        "current_week": current_week,
        "recent_runs": recent_runs,
        "total_runs": total_runs,
        "total_km_logged": round(total_km, 1),
        "days_to_race": max(days_to_race, 0),
        "weekly_history": list(reversed(history)),
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
    return {"run": run, "analysis": analysis}

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
    today = date.today().isoformat()
    current_week = await db.training_plan.find_one(
        {"week_start": {"$lte": today}, "week_end": {"$gte": today}},
        {"_id": 0}
    )

    recent_runs = await db.runs.find({}, {"_id": 0}).sort("date", -1).limit(10).to_list(10)

    system_msg = """Sei un Head Coach di Mezzofondo esperto, specializzato nella preparazione per la Mezza Maratona.

PROFILO ATLETA:
- Età: 40 anni, Peso: 68kg
- FC massima: 179 bpm
- Ha iniziato a correre a Febbraio 2025 (~1400km totali)
- INFORTUNIO: Tendinopatia inserzionale achillea destra (26 Nov 2025), fermo 2 mesi
- Rientro in corsa: Febbraio 2026
- Stato attuale: leggerissima rigidità mattutina che sparisce in 10 secondi

OBIETTIVO: Mezza Maratona Fuerteventura Corralejo, 12 Dicembre 2026
- Passo obiettivo: 4:30/km
- Tempo obiettivo: 1h 35m

PERSONAL BEST PRE-INFORTUNIO:
- 4km: 16:08 (4:01/km)
- 6km: 26:00 (4:20/km) FC media 149
- 10km: 45:31 (4:33/km)
- 15km: 1:13:38 (4:54/km)

INTEGRATORI ATTUALI: Collagene GELITA + Vitamina C pre-corsa, Creatina, Magnesio, Omega-3, Vitamina D3

ISTRUZIONI:
1. Analizza la corsa fornita confrontandola con il piano di allenamento
2. Valuta FC, passo, distanza rispetto agli obiettivi
3. Fornisci feedback specifico e motivante IN ITALIANO
4. Se necessario, suggerisci modifiche al piano
5. Considera l'infortunio al tendine d'Achille nelle raccomandazioni
6. Usa un tono da coach: diretto, motivante, tecnico ma comprensibile
7. Rispondi in formato strutturato con sezioni chiare"""

    run_info = f"""CORSA DA ANALIZZARE:
- Data: {run.get('date')}
- Distanza: {run.get('distance_km')} km
- Durata: {run.get('duration_minutes')} min
- Passo medio: {run.get('avg_pace')}/km
- FC media: {run.get('avg_hr', 'N/D')} bpm ({run.get('avg_hr_pct', 'N/D')}% max)
- FC max: {run.get('max_hr', 'N/D')} bpm ({run.get('max_hr_pct', 'N/D')}% max)
- Tipo: {run.get('run_type')}
- Note: {run.get('notes', 'Nessuna')}
- Luogo: {run.get('location', 'N/D')}"""

    if current_week:
        run_info += f"\n\nPIANO SETTIMANA CORRENTE: Fase {current_week.get('phase', 'N/D')}, Target {current_week.get('target_km', 'N/D')}km"

    if recent_runs:
        run_info += "\n\nULTIME CORSE:"
        for r in recent_runs[:5]:
            run_info += f"\n- {r.get('date')}: {r.get('distance_km')}km a {r.get('avg_pace')}/km, FC {r.get('avg_hr', 'N/D')}bpm"

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

    # ---- VO2MAX ESTIMATION (Jack Daniels) ----
    # Find best efforts at different distances
    best_efforts = {}
    for r in valid_runs:
        dist = r.get("distance_km", 0)
        pace_secs = pace_str_to_secs(r.get("avg_pace", "9:99"))
        time_secs = r.get("duration_minutes", 0) * 60

        for target_dist in [4, 5, 6, 10, 15, 21.1]:
            if abs(dist - target_dist) < 0.5:
                key = f"{target_dist}km"
                if key not in best_efforts or pace_secs < pace_str_to_secs(best_efforts[key]["avg_pace"]):
                    best_efforts[key] = r

    # VO2max from best 10km or best effort using Daniels formula
    vo2max = None
    best_race = None
    for key in ["10km", "6km", "5km", "15km", "4km"]:
        if key in best_efforts:
            best_race = best_efforts[key]
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

    # ---- RACE PREDICTIONS (Riegel formula) ----
    race_predictions = {}
    ref_run = best_efforts.get("10km") or best_efforts.get("6km") or best_efforts.get("5km") or best_efforts.get("4km")
    if ref_run:
        ref_dist = ref_run["distance_km"]
        ref_time_min = ref_run["duration_minutes"]
        for target_name, target_km in [("5km", 5), ("10km", 10), ("21.1km", 21.1)]:
            pred_time = ref_time_min * (target_km / ref_dist) ** 1.06
            pred_pace_s = (pred_time * 60) / target_km
            pred_pace = f"{int(pred_pace_s // 60)}:{int(pred_pace_s % 60):02d}"
            race_predictions[target_name] = {
                "predicted_time_min": round(pred_time, 1),
                "predicted_time_str": f"{int(pred_time // 60)}:{int(pred_time % 60):02d}:{int((pred_time % 1) * 60):02d}",
                "predicted_pace": pred_pace,
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

    # ---- HR ZONE DISTRIBUTION with BPM ranges based on max_hr=180 ----
    user_max_hr = 180  # User's actual max HR
    zone_definitions = [
        {"zone": "Z1", "name": "Recupero", "pct_min": 50, "pct_max": 60},
        {"zone": "Z2", "name": "Aerobica", "pct_min": 60, "pct_max": 70},
        {"zone": "Z3", "name": "Tempo", "pct_min": 70, "pct_max": 80},
        {"zone": "Z4", "name": "Soglia", "pct_min": 80, "pct_max": 90},
        {"zone": "Z5", "name": "Max", "pct_min": 90, "pct_max": 100},
    ]
    
    zone_counts = {"Z1": 0, "Z2": 0, "Z3": 0, "Z4": 0, "Z5": 0}
    total_hr_runs = 0
    for r in valid_runs:
        hr_pct = r.get("avg_hr_pct") or (round((r["avg_hr"] / user_max_hr) * 100) if r.get("avg_hr") else None)
        if hr_pct:
            total_hr_runs += 1
            if hr_pct < 60:
                zone_counts["Z1"] += 1
            elif hr_pct < 70:
                zone_counts["Z2"] += 1
            elif hr_pct < 80:
                zone_counts["Z3"] += 1
            elif hr_pct < 90:
                zone_counts["Z4"] += 1
            else:
                zone_counts["Z5"] += 1

    zone_distribution = []
    for zdef in zone_definitions:
        z = zdef["zone"]
        count = zone_counts[z]
        pct = round((count / max(total_hr_runs, 1)) * 100)
        bpm_min = round(user_max_hr * zdef["pct_min"] / 100)
        bpm_max = round(user_max_hr * zdef["pct_max"] / 100)
        zone_distribution.append({
            "zone": z, 
            "name": zdef["name"],
            "count": count, 
            "percentage": pct,
            "bpm_min": bpm_min,
            "bpm_max": bpm_max,
            "pct_range": f"{zdef['pct_min']}-{zdef['pct_max']}%"
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
            "pre_injury": pre_injury_at
        },
        "best_efforts": {k: {"distance": v["distance_km"], "pace": v["avg_pace"], "time": v["duration_minutes"], "date": v["date"], "avg_hr": v.get("avg_hr"), "max_hr": v.get("max_hr")} for k, v in best_efforts.items()},
        "totals": {"total_km": total_km, "total_time_hours": round(total_time / 60, 1), "total_runs": total_runs, "recent_30d_km": recent_km},
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
    url = (
        f"https://www.strava.com/oauth/authorize"
        f"?client_id={STRAVA_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri=http://localhost/exchange_token"
        f"&approval_prompt=force"
        f"&scope=read,activity:read_all"
    )
    return {"url": url, "instructions": "Apri questo URL nel browser, autorizza, e copia il parametro 'code' dall'URL di redirect."}

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

    return {
        "synced": synced,
        "matched": matched,
        "total_strava": len(activities),
        "message": f"Sincronizzate {synced} nuove corse, {matched} abbinate a corse esistenti",
        "needs_reauth": False
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
