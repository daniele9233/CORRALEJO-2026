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
| OpenAI | 1.99.9 | AI analysis (fallback) |
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
| **EAS Project ID** | `b6eee442-2a97-4b31-803f-21db08504ca3` |

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
│  (OAuth)     │                    │   OpenAI API     │
└──────────────┘                    └──────────────────┘
```

- **Frontend** → App React Native con Expo Router, 5 tab principali + schermate modali
- **Backend** → Single-file FastAPI (`server.py`), async, tutte le route sotto `/api`
- **Database** → MongoDB Atlas cluster gratuito, 6 collezioni
- **AI** → OpenAI per analisi corse (con fallback a analisi algoritmica)
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

#### Auto-adattamento Piano
- Dopo sync Strava, ricalcola VDOT se ci sono nuovi migliori risultati
- Aggiorna tutti i passi futuri in base al nuovo VDOT
- Auto-completa sessioni corrispondenti alle corse sincronizzate

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
- **Analisi AI** (generata da OpenAI o algoritmo interno):
  - Confronto con sessione pianificata
  - Deviazione passo e distanza
  - Verdetto: perfetto / troppo intenso / troppo leggero
  - Raccomandazioni per le prossime sessioni

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
- **VO2max**: valore corrente vs target con barra progresso
- **Soglia anaerobica**: confronto pre-infortunio vs attuale + storico passi
- **Previsioni gara**: 5km, 10km, 21.1km con progresso verso obiettivo
- **Best efforts**: migliori prestazioni registrate

### 12. 🧮 Calcolatore
Strumenti di calcolo per il runner:
- **Passi da VDOT**: mostra VDOT corrente e i 5 passi di Daniels
- **Previsioni gara** (formula Riegel): inserisci un PB e predice gli altri tempi
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
- Adattamento dinamico basato sulle prestazioni reali

### 2. VDOT Dinamico (Jack Daniels)
- Calcolo automatico del VDOT dai migliori risultati
- 5 zone di allenamento derivate: Easy, Marathon, Threshold, Interval, Repetition
- Ricalcolo automatico dopo ogni gara/test
- Aggiornamento di tutti i passi futuri nel piano

### 3. Sync Strava con Feedback
- Connessione OAuth 2.0 con deep linking
- Sincronizzazione automatica attività
- Confronto automatico corsa reale vs sessione pianificata
- Verdetto: perfetto / troppo lento / troppo veloce / ok / extra
- Auto-completamento sessioni corrispondenti
- Trigger ricalcolo VDOT dopo sync

### 4. Analisi AI delle Corse
- Analisi tramite OpenAI (GPT) con fallback algoritmico
- Confronto dettagliato con la sessione pianificata
- Deviazione passo e distanza in percentuale
- Raccomandazioni personalizzate

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
| POST | `/training-plan/adapt` | Auto-adatta piano basato su prestazioni recenti |
| GET | `/training-plan/adaptation-status` | Verifica se adattamento consigliato |
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

### AI
| Metodo | Endpoint | Descrizione |
|---|---|---|
| POST | `/ai/analyze-run` | Analisi AI della corsa vs sessione pianificata |

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
| `OPENAI_API_KEY` | (Opzionale) API key OpenAI per analisi AI |
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

## 📄 Licenza

Progetto privato per uso personale.

---

*Sviluppato per la Mezza Maratona di Fuerteventura 2026*
