# PRD - App Allenamento Mezza Maratona Fuerteventura 2026

## Obiettivo
App mobile per gestire il piano di allenamento per la Mezza Maratona di Fuerteventura Corralejo (12 Dicembre 2026), target 4:30/km (1h35m).

## Profilo Atleta
- 40 anni, 68kg, FC Max 179 bpm
- Running dal Febbraio 2025, ~1400km totali
- Infortunio: Tendinopatia inserzionale achillea destra (Nov 2025), recuperato
- PB: 5km 20:35, 6km 26:00, 10km 45:31, 15km 1:13:38

## Funzionalità Implementate

### 1. Dashboard
- Countdown giorni alla gara
- Obiettivo tempo/passo/km totali
- Fase corrente del piano
- Allenamento del giorno
- Grafico km settimanali (ultimi 12 settimane)
- Ultime corse
- Prossimo test programmato

### 2. Piano Allenamento (38 settimane)
- 6 fasi: Ripresa → Base Aerobica → Sviluppo → Preparazione Specifica → Picco → Tapering
- Navigazione tra settimane con prev/next
- 7 sessioni giornaliere con tipo, descrizione, distanza target, passo target
- Toggle completamento sessioni
- Note settimanali per fase
- Barra di progresso settimanale

### 3. Calendario Interattivo
- Vista mensile con navigazione
- Pallini colorati per tipo di sessione
- Tap su giorno per vedere dettagli sessione
- Legenda tipi di allenamento

### 4. Storico Corse + Analisi AI
- Lista corse con statistiche (distanza, passo, FC, tipo)
- Aggiunta nuova corsa con form completo
- Dettaglio corsa con zone FC
- **Analisi AI Coach** (GPT-5.2): analisi personalizzata di ogni corsa con consigli tecnici

### 5. Profilo con 4 sotto-sezioni
- **Profilo**: Statistiche, Personal Best, Infortunio, Mouth Tape Running
- **Integratori**: Collagene GELITA, Vitamina C, Creatina, Magnesio, Omega-3, Vitamina D3
- **Esercizi**: 8 esercizi di rinforzo (calf raise, isometria, squat, clamshell, etc.)
- **Test**: 6 test programmati ogni ~6 settimane + inserimento risultati

## Stack Tecnico
- **Frontend**: React Native Expo (SDK 54) con Expo Router
- **Backend**: FastAPI (Python) su porta 8001
- **Database**: MongoDB
- **AI**: Claude Sonnet 4 via emergentintegrations (Emergent LLM Key)
- **Strava**: API v3 integrata con OAuth completo (profilo connesso, token refresh automatico, code exchange per activity:read_all)
- **Design**: Dark mode sportivo (stile Garmin avanzato), lime #BEF264 su nero #09090B

## API Endpoints
- `POST /api/seed` - Inizializzazione dati
- `GET /api/dashboard` - Dashboard aggregata
- `GET /api/training-plan` - Piano completo (38 settimane)
- `GET /api/training-plan/current` - Settimana corrente
- `PATCH /api/training-plan/session/complete` - Toggle completamento
- `GET/POST /api/runs` - CRUD corse
- `POST /api/ai/analyze-run` - Analisi AI della corsa
- `GET/POST /api/tests` - Gestione test
- `GET /api/supplements` - Integratori
- `GET /api/exercises` - Esercizi
- `GET /api/profile` - Profilo atleta
- `GET /api/weekly-history` - Storico settimanale

## Testing Results
- Backend: 92% (12/13 passed, unico timeout su AI ~30s previsto)
- Frontend: 100% (12/12 passed)
