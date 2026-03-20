# 🏃 CORRALEJO 2026 — Half Marathon Training App

App completa di allenamento per la **Mezza Maratona di Fuerteventura (Corralejo)**, Dicembre 2026.
Progettata per un runner in fase di ritorno post-infortunio con obiettivo tempo **1:35:00** (passo 4:30/km).

---

## 📋 Indice

- [Stack Tecnologico](#-stack-tecnologico)
- [Repository & Branch](#-repository--branch)
- [Architettura](#-architettura)
- [Backend](#-backend)
- [Frontend](#-frontend)
- [Schermate dell'App](#-schermate-dellapp)
- [Funzionalità Principali](#-funzionalità-principali)
- [API Endpoints](#-api-endpoints)
- [Sistema VDOT (Jack Daniels)](#-sistema-vdot-jack-daniels)
- [Integrazione Strava](#-integrazione-strava)
- [Sistema Medaglie](#-sistema-medaglie)
- [Piano di Allenamento](#-piano-di-allenamento)
- [Deploy & Build](#-deploy--build)
- [Variabili d'Ambiente](#-variabili-dambiente)
- [Come Avviare in Locale](#-come-avviare-in-locale)

---

## 🛠 Stack Tecnologico

### Frontend
| Tecnologia | Versione | Ruolo |
|---|---|---|
| React Native | 0.81.5 | Framework mobile cross-platform |
| Expo SDK | 54.0.33 | Toolchain React Native |
| Expo Router | 5.x | File-based routing |
| TypeScript | 5.9.3 | Tipizzazione statica |
| React | 19.1.0 | UI library |
| React Navigation | 7.x | Bottom tabs navigation |
| @expo/vector-icons | Ionicons | Icone |
| react-native-reanimated | 4.x | Animazioni |
| react-native-gesture-handler | 2.x | Gesture recognition |
| expo-blur | - | Effetti blur |

### Backend
| Tecnologia | Versione | Ruolo |
|---|---|---|
| Python | 3.11.11 | Runtime |
| FastAPI | 0.110.1 | Web framework async |
| Uvicorn | 0.25.0 | ASGI server |
| Motor | 3.3.1 | MongoDB async driver |
| PyMongo | 4.5.0 | MongoDB driver |
| Pydantic | 2.12.5 | Data validation |
| httpx | 0.28.1 | HTTP client (Strava API) |
| Google Gemini | 2.0 Flash | AI Coach (API gratuita) |
| python-dotenv | 1.2.1 | Env variables |

### Database
| Tecnologia | Piano | Ruolo |
|---|---|---|
| MongoDB Atlas | M0 Free | Database cloud NoSQL |

### Hosting
| Servizio | Piano | Ruolo |
|---|---|---|
| Render.com | Free | Backend hosting |
| EAS Build (Expo) | Free | Build APK cloud |

---

## 📦 Repository & Branch

| Campo | Valore |
|---|---|
| **Repository** | https://github.com/daniele9233/CORRALEJO-2026.git |
| **Branch principale** | `main` |
| **Visibilità** | Public |
| **Package Android** | `com.kikkoderiso.corralejo` |
| **URL Scheme** | `corralejo://` |
| **EAS Project ID** | `a48df678-6b21-4c17-9033-76216bd17940` (account daniele9233, da ritrasferire a kikkoderiso dopo 01/04/2026) |

### Struttura Repository
```
CORRALEJO-2026/
├── backend/
│   ├── server.py              # Server FastAPI (tutto in un file)
│   ├── requirements.txt       # Dipendenze Python (20 pacchetti)
│   └── .env                   # Variabili d'ambiente locali
├── frontend/
│   ├── app/
│   │   ├── (tabs)/            # Tab principali (bottom navigation)
│   │   │   ├── index.tsx      # Dashboard
│   │   │   ├── corse.tsx      # Lista corse
│   │   │   ├── piano.tsx      # Piano allenamento
│   │   │   ├── statistiche.tsx# Statistiche
│   │   │   └── profilo.tsx    # Profilo utente
│   │   ├── _layout.tsx        # Root layout + Stack navigator
│   │   ├── add-run.tsx        # Aggiungi corsa (modal)
│   │   ├── add-test.tsx       # Aggiungi test (modal)
│   │   ├── run-detail.tsx     # Dettaglio corsa + analisi AI
│   │   ├── workout-detail.tsx # Dettaglio sessione pianificata
│   │   ├── periodizzazione.tsx# Grafico periodizzazione
│   │   ├── progressi.tsx      # Storico VO2max/soglia/previsioni
│   │   ├── calcolatore.tsx    # Calcolatore passi e previsioni
│   │   ├── injury-risk.tsx    # Injury Risk Score (analisi predittiva)
│   │   └── strava-callback.tsx# OAuth callback Strava
│   ├── src/
│   │   ├── api.ts             # Client API (tutte le chiamate)
│   │   └── theme.ts           # Tema colori, spacing, font
│   ├── app.json               # Configurazione Expo
│   ├── eas.json               # Configurazione EAS Build
│   ├── package.json           # Dipendenze Node
│   └── tsconfig.json          # Config TypeScript
└── render.yaml                # Blueprint Render.com
```

---

## 🏗 Architettura

```
┌──────────────┐     HTTPS/JSON     ┌──────────────────┐     MongoDB Driver     ┌─────────────┐
│  App Mobile  │ ◄────────────────▶ │  FastAPI Backend  │ ◄───────────────────▶ │ MongoDB Atlas│
│  (Expo/RN)   │                    │  (Render.com)     │                       │  (M0 Free)  │
└──────────────┘                    └──────────────────┘                       └─────────────┘
       │                                    │
       │ Deep Link                          │ httpx
       ▼                                    ▼
┌──────────────┐                    ┌──────────────────┐
│  Strava App  │                    │   Strava API v3  │
│  (OAuth)     │                    │   Google Gemini API  │
└──────────────┘                    └──────────────────┘
```

- **Frontend** → App React Native con Expo Router, 5 tab principali + schermate modali
- **Backend** → Single-file FastAPI (`server.py`), async, tutte le route sotto `/api`
- **Database** → MongoDB Atlas cluster gratuito, 6 collezioni
- **AI** → Google Gemini (gratuito) per analisi corse (con fallback a analisi algoritmica)
- **Strava** → OAuth 2.0 con deep linking per sync attività

---

## ⚙ Backend

### URL Produzione
```
https://corralejo-backend.onrender.com
```

### Collezioni MongoDB
| Collezione | Descrizione |
|---|---|
| `profile` | Profilo atleta (singolo documento) |
| `training_weeks` | Settimane del piano di allenamento (38 settimane) |
| `runs` | Corse registrate (manuali + Strava) |
| `tests` | Test fisici programmati e completati |
| `supplements` | Piano integratori |
| `exercises` | Protocollo esercizi di rinforzo |
| `vo2max_history` | Storico andamento VDOT nel tempo |
| `adaptation_log` | Log decisioni auto-adattamento piano |

### Logica Principale nel Backend

#### Generazione Piano di Allenamento
- 38 settimane dal 23 Marzo 2026 al 6 Dicembre 2026
- 6 fasi di periodizzazione: Ripresa → Base Aerobica → Sviluppo → Prep. Specifica → Picco → Tapering
- Settimane di recupero ogni 3-4 settimane (-30% volume)
- KM settimanali progressivi: da 20km a ~65km al picco
- Ogni settimana ha 5-7 sessioni con tipo, distanza target, passo, durata

#### Calcolo VDOT (Jack Daniels)
- Stima VO2max dai migliori risultati su distanze 4-21km
- Formula di Daniels inversa per calcolare i passi di allenamento
- 5 zone: Easy, Marathon, Threshold, Interval, Repetition
- I passi nel piano vengono derivati automaticamente dal VDOT

#### Confronto Strava vs Piano
- Ogni corsa sincronizzata da Strava viene confrontata con la sessione pianificata
- Calcola deviazione di passo e distanza
- Verdetto automatico: perfetto / troppo_lento / troppo_veloce / ok / extra

#### Auto-adattamento Piano (Base Scientifica Rigorosa)
Dopo ogni sync Strava, il sistema esegue due funzioni:

**1. `auto_recalculate_vdot()` — Aggiornamento Passi (Daniels 2014)**
- Ricalcola VDOT solo da **sforzi validati**: distanza ≥4km, FC ≥85% FCmax
- Applica la **regola dei 2/3 di Daniels**: solo il 67% del miglioramento misurato viene applicato
- **Cap +1 VDOT per mesociclo** (4 settimane): evita che i passi superino l'adattamento fisiologico
- In caso di regressione, il VDOT viene ridotto integralmente per sicurezza
- Aggiorna automaticamente tutti i passi futuri tramite `SESSION_PACE_ZONE`

**2. `auto_adapt_plan()` — Gestione Volume (5 modelli peer-reviewed)**

| Modello | Riferimento | Cosa controlla |
|---|---|---|
| **Spike Detection** | Impellizzeri et al. (2020) Int J Sports Physiol Perform | Carico acuto e cronico monitorati **separatamente** (NON come ratio ACWR, che soffre di mathematical coupling). Spike >30% WoW → volume -15% |
| **Regola del 10%** | ACSM (2013) Guidelines, 9th ed. | Incremento settimanale max 10% — guardrail primario |
| **Monotonia** | Foster (1998) Med Sci Sports Exerc | Se monotonia >2.0 → rischio overtraining, volume -5% |
| **Polarizzazione 80/20** | Seiler (2010) Int J Sports Physiol Perform | Se <75% corse facili → avviso troppa intensità |
| **Tapering** | Mujika & Padilla (2003) Med Sci Sports Exerc | Settimane 1/2/3 → -20%/-40%/-55% volume, intensità mantenuta |

**Nota metodologica**: Il ratio ACWR (Gabbett 2016) è stato deliberatamente escluso.
Impellizzeri et al. (2020) hanno dimostrato che il mathematical coupling (il carico acuto è già incluso nel cronico) produce correlazioni spurie. La meta-analisi BMC Sports Medicine (2025) conferma che l'ACWR va usato con estrema cautela. Al suo posto, il sistema monitora i carichi separatamente e usa lo spike detection settimana-su-settimana.

- Auto-completa sessioni corrispondenti alle corse sincronizzate
- Ogni decisione viene salvata in `adaptation_log` per tracciabilità

---

## 📱 Frontend

### Tema e Design
- **Dark theme** con sfondo `#09090b`
- **Accent color**: Lime `#bef264`
- **Card**: `#18181b` con bordi arrotondati 12-16px
- **Font**: System default, dimensioni 10-40px
- **Spacing**: multipli di 4px (4, 8, 12, 16, 20, 24, 32)

### Colori Tipi Sessione
| Tipo | Colore | Hex |
|---|---|---|
| Corsa Lenta | Blu | `#3b82f6` |
| Lungo | Viola | `#a855f7` |
| Ripetute | Rosso | `#ef4444` |
| Ripetute Salita | Ambra | `#f59e0b` |
| Progressivo | Arancione | `#f97316` |
| Rinforzo | Verde | `#22c55e` |
| Cyclette | Ciano | `#06b6d4` |
| Riposo | Grigio | `#71717a` |
| Test | Lime | `#bef264` |
| Gara | Oro | `#eab308` |

---

## 📲 Schermate dell'App

### 1. 🏠 Dashboard (Home)
La schermata principale con panoramica completa:
- **Countdown gara**: giorni/ore/minuti alla Mezza Maratona di Fuerteventura
- **Card sessione di oggi**: tipo, titolo, descrizione, distanza/passo/durata target
- **Bottone "SEGNA FATTO"**: completa la sessione di oggi con un tap
- **Timeline settimanale**: 7 giorni con pallini colorati per tipo sessione
- **Barra progresso settimana**: sessioni completate / totale
- **Statistiche rapide**: KM settimanali, KM totali, passo target
- **Grafico KM 12 settimane**: barre colorate per fase con valori
- **Corse recenti**: ultime 3 corse con distanza, passo, durata
- **Prossimo test**: data e tipo del prossimo test in programma

### 2. 🏃 Corse
Lista completa delle corse registrate:
- **Statistiche in alto**: numero corse, KM totali, passo medio
- **Card corsa**: data, luogo, tipo (badge colorato), distanza, passo, durata, FC
- **Ordinamento**: dalla più recente
- **Note**: visibili se presenti
- **Tap**: apre il dettaglio con analisi AI
- **FAB (+)**: aggiunge nuova corsa manualmente

### 3. 📅 Piano di Allenamento
Vista completa del piano di 38 settimane:
- **Barra fasi**: 6 fasi colorate con indicatore settimana corrente
- **Doppia vista** (toggle):
  - **Lista**: navigatore settimane, strip 7 giorni, lista sessioni
  - **Calendario**: vista mese con pallini colorati e legenda
- **Card sessione**: icona tipo, titolo, descrizione, target (distanza/passo/durata)
- **Badge**: "Oggi", "Saltata", settimana di recupero
- **Checkbox**: completa/incompleta per ogni sessione
- **Stato adattamento**: suggerisce quando adattare il piano
- **Link**: periodizzazione e progressi

### 4. 📊 Statistiche
Analytics avanzate sulle prestazioni:
- **Gauge VO2max**: valore corrente vs target (per passo 4:30/km)
- **Card obiettivo mezza**: tempo target 1:35:00, tempo predetto attuale, gap, % progresso
- **Previsioni gara**: 5km, 10km, 15km, 21.1km, 42.2km
- **Soglia anaerobica**: dati correnti
- **Best efforts**: migliori prestazioni per distanza
- **Volume settimanale**: distribuzione km per zona
- **Link a Progressi**: storico dettagliato

### 5. 👤 Profilo
5 tab scorrevoli orizzontalmente:

#### Tab Profilo
- **Connessione Strava**: bottoni Connetti/Sync + input manuale codice
- **Dati personali** (modificabili): età, peso, FC max, km max settimanali
- **Personal Best**: griglia migliori tempi per distanza

#### Tab Medaglie
- **6 livelli** per ogni distanza (5km, 10km, 15km, 21.1km):
  - 🏃 Warm-up → 🥉 Bronzo → 🥈 Argento → 🥇 Oro → 💎 Platino → 👑 Elite
- Tempo attuale, tutti i target, gap al livello successivo

#### Tab Integratori
- Piano integratori per recupero infortunio e performance
- Card: categoria, nome, dosaggio, timing, scopo

#### Tab Esercizi
- Protocollo rinforzo muscolare (4x/settimana)
- Card: nome, serie x ripetizioni, tempo, recupero, priorità, note

#### Tab Test
- Test programmati con data e tipo
- Test completati con risultati
- Bottone aggiungi test

### 6. ➕ Aggiungi Corsa (Modal)
Form per registrare una corsa manualmente:
- Selettore data
- Distanza (km)
- Durata (minuti + secondi) OPPURE passo (min:sec/km)
- Frequenza cardiaca (media e massima)
- Tipo corsa (selettore)
- Luogo
- Note
- Calcolo automatico dei valori mancanti

### 7. ➕ Aggiungi Test (Modal)
Form per aggiungere risultati test:
- Tipo test (selettore)
- Data, distanza, tempo
- Calcolo passo automatico

### 8. 🔍 Dettaglio Corsa
Analisi completa di una corsa:
- Tutte le metriche (distanza, passo, durata, FC, tipo)
- **Piano vs Realtà**: confronto distanza/passo/durata con sessione pianificata
- **Splits per km**: barre colorate con passo dentro la barra e HR a destra, subtitle passo medio
- **Zone di passo**: distribuzione % per zone con barre colorate
- **Efficienza Aerobica (Pa:Hr)**: decoupling cardiaco tra 1ª e 2ª metà corsa (solo corse a passo costante, CV<10%)
- **Rilevamento ripetute**: banner automatico quando la variabilità del passo è alta (CV >15%)
- **Cadenza e dislivello**: dati da Strava
- **Analisi AI** (generata da Google Gemini o algoritmo interno):
  - 9 sezioni strutturate: intro, dati corsa, classificazione, utilità per obiettivo, positivi, lacune, reality check con tempi stimati, consigli tecnici, voto/10
  - Tono naturale da allenatore esperto (non template)
  - Raccomandazioni con workout specifici

### 9. 📋 Dettaglio Sessione
Dettagli di una sessione pianificata:
- Tipo, titolo, descrizione completa
- Target: distanza, passo, durata
- Fase e settimana del piano
- Toggle completamento

### 10. 📈 Periodizzazione
Grafico a barre del piano di allenamento:
- 38 barre colorate per fase (una per settimana)
- Altezza barra = KM target settimanali
- Settimana corrente evidenziata
- Legenda fasi con intervalli settimane
- Statistiche per fase: settimane, km totali, km/settimana, settimane completate

### 11. 📉 Progressi
Storico evoluzione prestazioni:
- **VO2max**: valore corrente vs target con barra progresso + grafico andamento (touch tooltip)
- **Soglia anaerobica**: confronto pre-infortunio vs attuale + storico passi
- **Andamento paces**: line chart settimanale per zona Easy/Tempo/Fast (touch tooltip con drag)
- **Cadenza**: grafico mensile con target 180 spm da Strava (touch tooltip con drag)
- **Efficienza Aerobica (trend)**: grafico decoupling settimanale con zone colorate (verde/giallo/arancione/rosso), target 5%
- **Distribuzione zone HR**: barre Z1-Z5 con soglie assolute BPM (Z1<117, Z2 117-146, Z3 147-160, Z4 161-175, Z5>175), barre allineate con percentuali fisse a destra
- **Previsioni gara (VDOT Daniels)**: 5km, 10km, 21.1km, 42.2km basate su VDOT calcolato SOLO da corse complete (NO segmenti/splits per evitare VDOT gonfiati). Validazione pace 2:30-9:00/km, cap VDOT 65. Tabella storica **mese per mese** (da Apr 2025 a oggi) con tempo, passo, VDOT e trend. Filtri per periodo (Oggi/1M/3M/6M) con visualizzazione tempo/pace reale del periodo passato. Tabs distanza. Rolling window 8 settimane con decay 0.4/settimana
- **Best efforts**: migliori prestazioni per distanza con passo e FC

### 12. 🏆 Badge e Trofei
Sistema gamification con **100+ badge** in 8 categorie:
- **🏃‍♂️ Milestone distanza** (11): da 100km a 10.000km + Giro del mondo (40.075km)
- **📅 Costanza** (16): Primi 10/25/50/100/200 corse, Settimana perfetta, Streak 3/5 settimane, Mese d'oro, Fedeltà, Runner instancabile, 365 giorni, Sveglia presto, Notturno, Guerriero weekend
- **📈 Miglioramenti** (21): VDOT +1/+2/+3/+5/+8/+10, VDOT 45/50/55, PB 5K/10K/Mezza, Sub 25/22/20 min 5K, Sub 50/45 min 10K, Sub 1:45/1:40 Mezza, Doppio record, Passo migliorato
- **🏋️ Allenamento** (16): Re/Maestro ripetute, Lungo 20+/25km/30km, Scalatore, Progressivo, Negative split, Volume sett 40/60/80km, Back to back, Doppia giornata, Forza, Cross-training
- **🎯 Mezza maratona** (10): 15km, 18km, 20km, Ritmo gara, Piano rispettato, Tapering, Sub 2h, Giorno gara, Obiettivo centrato, Corralejo Finisher
- **🧠 Scienza** (11): Zona ideale 80/20, Cuore efficiente, Mese polarizzato, Varietà perfetta, Maestro recupero, FC Max trovata, Data Nerd, Rilevatore ripetute, Injury Risk, Cadenza 180
- **💨 Velocità lampo** (10): 200m → 10km con soglie passo specifiche
- **🎉 Fun & Speciali** (7): Primo passo, Prima settimana, Il Ritorno, Maratona mensile, Mese da 100km, Corsa 1h/2h

Badge azzerati e ricominciati dal **23 marzo 2026**. Schermata dedicata (`badges.tsx`) accessibile da Profilo → Medaglie, con progress bar, categorie espandibili, stati locked/unlocked.
Ricalcolo automatico dopo ogni sync Strava.

### 13. 🧮 Calcolatore
Strumenti di calcolo per il runner:
- **Passi da VDOT**: mostra VDOT corrente e i 5 passi di Daniels
- **Previsioni gara** (VDOT Daniels + Riegel): inserisci un PB e predice gli altri tempi
- **Convertitore passo/velocità**: min:sec/km ↔ km/h

### 13. 🔗 Strava Callback
Gestione OAuth Strava:
- Riceve il codice di autorizzazione via deep link (`corralejo://strava-callback`)
- Lo scambia per access token
- Redirect alla pagina profilo

---

## 🌟 Funzionalità Principali

### 1. Piano di Allenamento Scientifico
- 6 fasi di periodizzazione con progressione controllata
- Settimane di recupero automatiche
- Passi calcolati dalle formule di Jack Daniels (VDOT)
- Auto-adattamento basato su 5 modelli scientifici peer-reviewed
- Volume caps fase-specifici (Daniels + ACSM 10% rule)
- Tapering progressivo (Mujika & Padilla 2003)

### 2. VDOT Dinamico (Jack Daniels)
- Calcolo automatico del VDOT solo da **sforzi validati** (≥4km, FC ≥85% HRmax)
- **Regola dei 2/3**: applica solo il 67% del miglioramento misurato
- **Cap +1 VDOT per mesociclo** (4 settimane)
- 5 zone di allenamento derivate: Easy, Marathon, Threshold, Interval, Repetition
- Ricalcolo automatico dopo ogni sync Strava
- Aggiornamento di tutti i passi futuri nel piano

### 3. Sync Strava con Feedback
- Connessione OAuth 2.0 con deep linking
- Sincronizzazione automatica attività
- Confronto automatico corsa reale vs sessione pianificata
- Verdetto: perfetto / troppo lento / troppo veloce / ok / extra
- Auto-completamento sessioni corrispondenti
- Trigger ricalcolo VDOT dopo sync

### 4. Analisi AI delle Corse
- Analisi tramite Google Gemini (gratuito) con fallback algoritmico avanzato
- Confronto dettagliato con la sessione pianificata
- Analisi FC vs zone VDOT, passo vs target, distanza
- Raccomandazioni personalizzate per la prossima sessione
- Funziona anche per corse extra fuori dal piano

### 4b. Injury Risk Score
- Analisi predittiva del rischio infortunio
- Fattori: carico settimanale, incremento WoW, intensità media, giorni recupero
- Gauge visuale con score 0-100 e codice colore (verde/giallo/arancione/rosso)
- Grafico storico carico settimanale con evidenziazione spike
- Raccomandazioni e alert personalizzati

### 4c. Pace & Race Predictor (Calcolatore)
- Previsioni gara dalla formula di Riegel
- Calcolo VDOT e zone di allenamento da un risultato race
- Input: distanza + tempo → output: previsioni per 5K/10K/15K/HM/M

### 5. Sistema Medaglie a 6 Livelli
Per ogni distanza (5km, 10km, 15km, 21.1km):
| Livello | Emoji | Esempio 10km |
|---|---|---|
| Warm-up | 🏃 | > 60:00 |
| Bronzo | 🥉 | 55:00 |
| Argento | 🥈 | 50:00 |
| Oro | 🥇 | 46:00 |
| Platino | 💎 | 43:00 |
| Elite | 👑 | 40:00 |

### 6. Dashboard con Sessione del Giorno
- Card hero con la sessione di oggi
- Bottone "SEGNA FATTO" per completare con un tap
- Countdown alla gara in tempo reale

### 7. Gestione Infortunio e Recupero
- Piano integratori specifico per recupero
- Protocollo esercizi di rinforzo muscolare
- Fase "Ripresa" iniziale nel piano di allenamento
- Monitoraggio progressi post-infortunio

### 8. Previsioni Gara
- Formula di Riegel per predizioni tempi
- Predizioni per: 5km, 10km, 15km, 21.1km, 42.2km
- Tracking progresso verso obiettivo 1:35:00

### 9. Periodizzazione Visuale
- Grafico a barre completo del piano 38 settimane
- Colori per fase con legenda
- Statistiche aggregate per fase

### 10. Doppia Vista Piano
- **Vista Lista**: navigazione per settimana con dettaglio sessioni
- **Vista Calendario**: panoramica mese con pallini colorati

---

## 🔌 API Endpoints

Base URL: `https://corralejo-backend.onrender.com/api`

### Inizializzazione
| Metodo | Endpoint | Descrizione |
|---|---|---|
| POST | `/seed` | Popola database con dati iniziali (profilo, corse, piano, integratori, esercizi, test) |

### Dashboard
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/dashboard` | Dati dashboard: profilo, settimana corrente, corse recenti, storico, prossimo test, countdown |

### Piano di Allenamento
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/training-plan` | Tutte le settimane del piano con sessioni |
| GET | `/training-plan/current` | Settimana corrente (basata su data odierna) |
| GET | `/training-plan/week/{week_id}` | Dettaglio singola settimana |
| PATCH | `/training-plan/session/complete` | Segna sessione completata/non completata |
| PUT | `/training-plan/week-sessions` | Aggiorna tutte le sessioni di una settimana |
| POST | `/training-plan/adapt` | Auto-adatta volume (spike detection, Foster, Seiler, Mujika, ACSM 10%) |
| GET | `/training-plan/adaptation-status` | Metriche scientifiche: carico acuto/cronico, WoW%, monotonia, polarizzazione |
| POST | `/training-plan/recalculate-paces` | Ricalcola passi futuri dal VDOT aggiornato |

### Corse
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/runs` | Tutte le corse (ordinate per data, più recenti prima) |
| GET | `/runs/{run_id}` | Singola corsa con analisi AI e confronto piano |
| POST | `/runs` | Crea nuova corsa manualmente |
| POST | `/runs/cleanup` | Rimuovi corse duplicate |

### Analytics e VDOT
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/analytics` | Stats complete: VO2max, previsioni gara, zone, best efforts, volume settimanale |
| GET | `/vdot/paces` | VDOT corrente + 5 passi di Daniels (Easy/Marathon/Threshold/Interval/Repetition) |
| GET | `/weekly-history` | Storico KM settimanali (52 settimane) |
| GET | `/vo2max-history` | Storico andamento VDOT nel tempo |
| POST | `/vo2max-history/rebuild` | Ricostruisce storico VDOT da tutte le corse ≥3km |
| GET | `/injury-risk` | Injury Risk Score: ACWR, carico, intensità, recupero, raccomandazioni |
| GET | `/cadence-history` | Storico cadenza mensile (spm) per grafico trend |
| GET | `/best-efforts` | Migliori prestazioni per distanza |
| GET | `/runs/{run_id}/splits` | Splits per km di una corsa specifica |
| GET | `/decoupling-history` | Storico decoupling cardiaco settimanale (solo corse steady, CV<10%) |
| GET | `/badges` | 100+ badge gamification con progresso, stato unlock, categorie |

### AI
| Metodo | Endpoint | Descrizione |
|---|---|---|
| POST | `/ai/analyze-run` | Analisi AI (Google Gemini + fallback algoritmico avanzato) |

### Test
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/tests` | Test programmati e completati |
| POST | `/tests` | Crea nuovo risultato test |
| GET | `/test-schedule` | Calendario test futuri |

### Profilo
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/profile` | Profilo utente (età, peso, FC max, target, PB, infortunio) |
| PATCH | `/profile` | Aggiorna campi profilo |

### Medaglie
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/medals` | Medaglie per distanza (6 livelli ciascuna) |

### Integratori & Esercizi
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/supplements` | Piano integratori |
| GET | `/exercises` | Protocollo esercizi rinforzo |

### Strava
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/strava/auth-url` | URL autorizzazione OAuth Strava |
| POST | `/strava/exchange-code` | Scambia codice auth per access token |
| GET | `/strava/profile` | Profilo Strava (se connesso) |
| GET | `/strava/activities` | Attività da Strava |
| POST | `/strava/sync` | Sync attività Strava + auto-adatta piano + ricalcola VDOT |
| POST | `/strava/resync-details` | Re-fetch dettagli Strava (cadenza, splits, best efforts) per corse esistenti |

---

## 📐 Sistema VDOT (Jack Daniels)

Il VDOT viene calcolato automaticamente dai migliori risultati dell'atleta su distanze da 4 a 21km, usando le formule inverse di Daniels.

### Come funziona
1. **Input**: migliore prestazione su una distanza (es. 10km in 46:30)
2. **Calcolo VO2**: dalla formula `VO2 = -4.60 + 0.182258*v + 0.000104*v²`
3. **% VO2max**: dalla formula del costo % in funzione del tempo
4. **VDOT** = VO2 / % → es. VDOT 48.7

### Zone di allenamento derivate
| Zona | % VO2max | Uso | Esempio (VDOT 48.7) |
|---|---|---|---|
| Easy (E) | ~65% | Corsa lenta, lungo | 5:32/km |
| Marathon (M) | ~79% | Lungo progressivo, ritmo gara | 4:44/km |
| Threshold (T) | ~88% | Progressivo, ripetute medie | 4:20/km |
| Interval (I) | ~98% | Ripetute | 3:58/km |
| Repetition (R) | ~105% | Sprint brevi | 3:45/km |

### Mapping Sessione → Zona
| Tipo Sessione | Zona Daniels |
|---|---|
| Corsa Lenta | Easy |
| Lungo | Easy (ultimi km a Marathon) |
| Progressivo | Threshold |
| Ripetute | Interval |
| Ripetute Salita | Nessun pace (max effort) |
| Test | Nessun pace (max effort) |

---

## 🔗 Integrazione Strava

### Flusso OAuth
1. L'utente preme "Connetti Strava" nel Profilo
2. L'app chiama `GET /strava/auth-url` per ottenere l'URL OAuth
3. Si apre il browser con la pagina di autorizzazione Strava
4. L'utente autorizza e viene reindirizzato a `corralejo://strava-callback?code=XXX`
5. L'app cattura il deep link e chiama `POST /strava/exchange-code` con il codice
6. Il backend scambia il codice per access token e lo salva nel profilo

### Sync Automatico
Quando l'utente preme "Sync Strava":
1. Il backend recupera le attività recenti dall'API Strava v3
2. Per ogni nuova attività di tipo "Run":
   - Crea una corsa nel database
   - La confronta con la sessione pianificata più vicina per data
   - Calcola deviazione passo e distanza
   - Assegna un verdetto (perfetto/ok/troppo_lento/troppo_veloce/extra)
   - Auto-completa la sessione se corrisponde
3. Dopo il sync, ricalcola il VDOT se ci sono nuovi migliori risultati
4. Aggiorna tutti i passi futuri nel piano di allenamento

---

## 🏅 Sistema Medaglie

6 livelli di achievement per ogni distanza di gara:

### 5km
| Livello | Tempo Target | Passo |
|---|---|---|
| 🏃 Warm-up | > 30:00 | > 6:00/km |
| 🥉 Bronzo | 27:30 | 5:30/km |
| 🥈 Argento | 25:00 | 5:00/km |
| 🥇 Oro | 23:00 | 4:36/km |
| 💎 Platino | 21:30 | 4:18/km |
| 👑 Elite | 20:00 | 4:00/km |

### 10km
| Livello | Tempo Target | Passo |
|---|---|---|
| 🏃 Warm-up | > 60:00 | > 6:00/km |
| 🥉 Bronzo | 55:00 | 5:30/km |
| 🥈 Argento | 50:00 | 5:00/km |
| 🥇 Oro | 46:00 | 4:36/km |
| 💎 Platino | 43:00 | 4:18/km |
| 👑 Elite | 40:00 | 4:00/km |

### 21.1km (Mezza Maratona)
| Livello | Tempo Target | Passo |
|---|---|---|
| 🏃 Warm-up | > 2:15:00 | > 6:24/km |
| 🥉 Bronzo | 2:00:00 | 5:41/km |
| 🥈 Argento | 1:50:00 | 5:13/km |
| 🥇 Oro | 1:40:00 | 4:44/km |
| 💎 Platino | 1:35:00 | 4:31/km |
| 👑 Elite | 1:25:00 | 4:02/km |

---

## 📆 Piano di Allenamento

### Fasi di Periodizzazione
| # | Fase | Settimane | KM/sett | Obiettivo |
|---|---|---|---|---|
| 1 | 🟢 Ripresa | 1-4 | 20-30 | Ritorno graduale post-infortunio |
| 2 | 🔵 Base Aerobica | 5-14 | 30-45 | Costruire base aerobica solida |
| 3 | 🟡 Sviluppo | 15-22 | 40-55 | Aumentare volume e intensità |
| 4 | 🟠 Prep. Specifica | 23-30 | 50-65 | Lavori specifici mezza maratona |
| 5 | 🔴 Picco | 31-35 | 55-65 | Massima forma, ritmo gara |
| 6 | ⚪ Tapering | 36-38 | 35-20 | Scarico pre-gara |

### Tipi di Sessione
| Tipo | Icona | Frequenza | Descrizione |
|---|---|---|---|
| Corsa Lenta | 🏃 | 2-3x/sett | Corsa a passo Easy, base aerobica |
| Lungo | 🏃‍♂️ | 1x/sett | Corsa lunga progressiva |
| Ripetute | ⚡ | 1x/sett | Intervalli a passo Interval |
| Ripetute Salita | ⛰️ | Occasionale | Lavoro in salita per forza |
| Progressivo | 📈 | 1x/sett | Dal passo Easy al Threshold |
| Rinforzo | 💪 | 2-4x/sett | Esercizi di forza |
| Cyclette | 🚴 | Occasionale | Cross-training a basso impatto |
| Test | 🎯 | Ogni 4-6 sett | Test cronometrato per monitorare progressi |
| Riposo | 😴 | 1-2x/sett | Giorno di recupero completo |

---

## 🚀 Deploy & Build

### Backend (Render.com)
Il backend è deployato automaticamente da GitHub:
- **URL**: `https://corralejo-backend.onrender.com`
- **Region**: Frankfurt (EU Central)
- **Piano**: Free (512MB RAM, 0.1 CPU)
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
- **Auto-deploy**: Attivato su push al branch `main`

> ⚠️ Il piano Free va in sleep dopo 15 minuti di inattività. La prima richiesta può richiedere ~50 secondi.

### Frontend (EAS Build)
L'APK viene generato nel cloud di Expo:
```bash
cd frontend
npx eas build --platform android --profile preview
```
- **Profile `preview`**: genera un APK installabile direttamente
- **Profile `production`**: genera un AAB per Google Play Store

---

## 🔐 Variabili d'Ambiente

### Backend (Render.com)
| Variabile | Descrizione |
|---|---|
| `MONGO_URL` | Connection string MongoDB Atlas |
| `DB_NAME` | Nome database (`corralejo`) |
| `PYTHON_VERSION` | Versione Python (`3.11.11`) |
| `GEMINI_API_KEY` | API key Google Gemini (gratuito) per AI Coach |
| `ANTHROPIC_API_KEY` | (Legacy) API key Anthropic Claude |
| `STRAVA_CLIENT_ID` | (Opzionale) Client ID app Strava |
| `STRAVA_CLIENT_SECRET` | (Opzionale) Client Secret app Strava |

### Frontend
| Variabile | Descrizione |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | URL backend (default: `https://corralejo-backend.onrender.com`) |

---

## 💻 Come Avviare in Locale

### Backend
```bash
cd backend

# Crea virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# oppure: venv\Scripts\activate  # Windows

# Installa dipendenze
pip install -r requirements.txt

# Crea file .env
echo "MONGO_URL=mongodb+srv://..." > .env
echo "DB_NAME=corralejo" >> .env

# Avvia server
uvicorn server:app --reload --port 8000

# Seed database (una volta)
curl -X POST http://localhost:8000/api/seed
```

### Frontend
```bash
cd frontend

# Installa dipendenze
npm install

# Avvia in development
npx expo start

# Oppure direttamente su Android
npx expo run:android
```

---

## 🔮 Prossimi Sviluppi

- [ ] **Shoe tracker** — km per scarpa da Strava, alert a 600km per cambio
- [ ] **Elevation gain tracking** — Dislivello settimanale (utile per Fuerteventura, terreno ondulato)
- [ ] **Confronto diretto** — Sovrapporre due corse sulla stessa distanza per vedere il progresso
- [ ] **Heatmap settimane** — Calendario stile GitHub con colori per km/giorno
- [ ] **Race Pace Simulator** — Previsione HR a un dato passo gara basata sui dati reali
- [ ] **Negative Split Planner** — Piano gara km per km con strategia pacing
- [ ] **Garmin Connect** — HR a riposo, HRV, Body Battery, qualità sonno
- [ ] **Meteo pre-corsa** — Aggiustamento paci target in base a temperatura e umidità

### Implementati
- [x] **Decoupling cardiaco (Pa:Hr)** — Drift FC tra 1ª e 2ª metà corsa (Friel). Solo su corse a passo costante (CV<10%). Verde <3.5%, arancione 3.5-5%, rosso >5%
- [x] **Distribuzione zone HR** — Barre Z1-Z5 ultime 4 settimane con Polarization Score e badge 80/20 (Seiler 2010)
- [x] **Auto-sync Strava** — Sincronizzazione automatica all'apertura app (grafici sempre aggiornati)
- [x] **AI Coach "Renato Canova"** — Analisi corse con Google Gemini come allenatore di fama mondiale, tono naturale, mai template, calcola settimane alla gara, conosce profilo atleta
- [x] **Best Efforts con medaglie** — 🥇🥈🥉 per i record personali con push notification su nuovo PR
- [x] **auto_adapt_plan() scientifico** — 5 modelli peer-reviewed: Impellizzeri 2020 (no ACWR), ACSM 10%, Foster monotonia, Seiler polarizzazione, Mujika tapering
- [x] **Splits per km** — Passo dentro la barra, HR a destra, subtitle passo medio, no overlap
- [x] **Zone di passo** — Distribuzione % per zone con barre colorate (formato corretto per valori ≥10% e <10%)
- [x] **Cadence trend** — Grafico andamento cadenza mensile con target 180 spm
- [x] **Notifiche push VO2max/soglia** — Notifica automatica quando il VO2max migliora dopo sync Strava
- [x] **Notifiche push giornaliere** — Reminder mattutino con la sessione del giorno
- [x] **Grafico andamento VO2max** — Line chart nella sezione Progressi con storia VDOT (con anno)
- [x] **Solo corse Strava** — Rimossi run seed fittizi, solo dati reali da Strava
- [x] **Injury Risk Score** — Analisi predittiva infortunio con gauge, fattori, alert e raccomandazioni
- [x] **Pace & Race Predictor** — Calcolatore VDOT, previsioni gara (Riegel), convertitore passo
- [x] **VDOT Paces API** — Endpoint `/vdot/paces` con i 5 passi di Daniels calcolati dal VDOT reale
- [x] **Efficienza Aerobica (trend)** — Grafico decoupling settimanale in Progressi con zone colorate, target 5%, touch tooltip
- [x] **Rilevamento ripetute** — Banner automatico su corse con alta variabilità passo (CV >15%)
- [x] **Previsioni gara con trend** — Frecce verdi/rosse con secondi di miglioramento/peggioramento per distanza. VDOT calcolato con validazione rigorosa: pace tra 2:30-9:00/km, validazione individuale ogni split, cap VDOT 65, decay 0.4/settimana per inattività, rolling window 8 settimane
- [x] **Touch tooltip su grafici** — Tutti i grafici in Progressi supportano touch-and-drag per vedere i valori
- [x] **Zone HR corrette** — Soglie assolute BPM (non % del max) per distribuzione accurata: Z1<117, Z2 117-146, Z3 147-160, Z4 161-175, Z5>175
- [x] **Resync dettagli Strava** — Endpoint per re-fetch cadenza, splits, best efforts per corse esistenti
- [x] **EAS Updates (OTA)** — Aggiornamenti over-the-air configurati (`eas update` senza rebuild APK)
- [x] **Logo Corralejo** — Icona app con runner stilizzato + sfondo gradient (adaptive icon Android)
- [x] **Nome app** — "Corralejo 2026" (era "frontend")
- [x] **Weekly Report push** — Riepilogo settimanale automatico: km fatti vs target, aderenza %, VDOT
- [x] **Badge e Trofei (100+ badge)** — Sistema gamification con 100+ badge in 8 categorie. Espandito da 46 a 100+ con nuove categorie Fun & Speciali, sub-obiettivi tempo (Sub 25/22/20 min 5K, Sub 45 10K, Sub 1:45/1:40 Mezza), volume settimanale, negative split, double day, e altro. Badge azzerati dal 23 marzo 2026. Endpoint `GET /api/badges`
- [x] **Fix previsioni gara** — Rimosso VDOT da segmenti/splits che gonfiava le previsioni (passi irrealistici come 3:34/km). Ora usa SOLO VDOT da corse complete con validazione pace 2:30-9:00/km. Previsioni coerenti con tabella Strava reale
- [x] **Fix barre zone HR** — Barre Z1-Z5 ora allineate correttamente (non più normalizzate al massimo, usano percentuale assoluta)
- [x] **Fix previsioni gara v2** — Previsioni ora basate su VDOT calcolato dalla soglia anaerobica (non dal best effort gonfiato). Aggiunto fattore fatica per distanze lunghe (1.02x HM, 1.04x Marathon). Valori coerenti con tabella Strava reale
- [x] **Tabella previsioni gara** — Su Progressi, sostituito grafico con tabella interattiva: data, tempo, passo, VDOT, trend (frecce verdi/rosse). Filtri periodo Oggi/1M/3M/6M e distanza
- [x] **Fix FC max da profilo** — Zone HR ora usano FC max reale dal profilo utente invece di valore hardcoded 180
- [x] **Fix badge reset** — Badge ora filtrano best_efforts e vo2max_history dal 23 marzo 2026. VDOT per badge usa solo valori registrati dopo il 23/03. Nessun badge si sblocca prima della data di inizio
- [x] **Previsioni mensili** — Tabella previsioni ora aggregata per mese (Apr 2025 → oggi) invece di per singola corsa. Trend mostra tempo/passo reale del periodo passato invece di secondi
- [x] **Health check endpoint** — Aggiunto `GET /api/health` e `GET /` per Render health checks
- [x] **CRPE - Composite Race Prediction Engine** — Previsioni gara completamente riscritte con motore composito: Riegel Best Effort con correzione HR (50%), VDOT Daniels (30%), Soglia Anaerobica (20%). Tabella mensile da Gen 2025 a oggi con miglior prestazione del mese, previsioni per 5K/10K/HM/Maratona, trend mese-su-mese. Filtri periodo (Tutti/1M/3M/6M)
- [x] **Avatar Runner** — Schermata avatar con 4 viste (Aspetto, Statistiche, Equipaggiamento, Museo). Avatar SVG con equipaggiamento basato su VDOT (4 tier: Beginner/Intermediate/Advanced/Elite), postura basata su Injury Risk, aura animata basata su efficienza cardiaca. Museo con istantanee mensili. Endpoint `GET /api/avatar`. Accessibile da Profilo → Medaglie

---

## 📄 Licenza

Progetto privato per uso personale.

---

*Sviluppato per la Mezza Maratona di Fuerteventura 2026*
