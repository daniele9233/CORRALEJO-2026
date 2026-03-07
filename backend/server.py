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

            sessions = generate_week_sessions(phase["name"], week_num, target_km, week_start, i, phase["weeks"])

            weeks.append({
                "id": make_id(),
                "week_number": week_num,
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "phase": phase["name"],
                "phase_description": phase["desc"],
                "target_km": target_km,
                "sessions": sessions,
                "notes": get_week_notes(phase["name"], week_num, i)
            })

            current_date += timedelta(days=7)
            week_num += 1

    return weeks

def generate_week_sessions(phase, week_num, target_km, week_start, phase_week, total_phase_weeks):
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
        {"id": make_id(), "date": "2025-09-20", "distance_km": 5.0, "duration_minutes": 20.58, "avg_pace": "4:07", "avg_hr": 165, "max_hr": 176, "avg_hr_pct": 92, "max_hr_pct": 98, "run_type": "race", "notes": "PB 5km - 20:35", "location": "Roma"},
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
            "5km": {"time": "20:35", "date": "2025-09-20", "pace": "4:07"},
            "6km": {"time": "26:00", "date": "2025-11-21", "pace": "4:20"},
            "10km": {"time": "45:31", "date": "2025-10-15", "pace": "4:33"},
            "15km": {"time": "1:13:38", "date": "2025-10-28", "pace": "4:54"}
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
- 5km: 20:35 (4:07/km)
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
        ).with_model("openai", "gpt-5.2")

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

@api_router.get("/profile")
async def get_profile_data():
    profile = await db.profile.find_one({}, {"_id": 0})
    return profile or {}

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
