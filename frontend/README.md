# Aasha CHW Dashboard

React 18 + TypeScript + Vite + Tailwind CSS. Polls `/api/patients` every 30s (F5.2).

## Structure

```
frontend/
  index.html              # Entry HTML (Vite)
  src/
    main.tsx              # React mount + global CSS
    App.tsx               # Root layout, routing state
    index.css             # Tailwind + custom (pulse-ring, etc.)
    api/                  # API client and endpoints
      client.ts           # fetch wrapper (api.get/post)
      patients.ts         # patientsApi.list, get, resolve, triggerCheckIn
      demo.ts             # demoApi.seed
    components/
      ui/                 # TierBadge
      dashboard/          # SummaryCards, PatientList
      patient/            # PatientDetail, SymptomChart
    hooks/                # usePatients (polling), usePatientDetail
    pages/                # Dashboard, PatientDetailPage
    types/                # Patient, Assessment, Escalation, etc.
    constants/            # TIER_NAMES, TIER_BG, TIER_TEXT, TIER_BORDER
    utils/                # timeAgo, gestWeeks
  public/                 # Static assets (optional)
  dist/                   # Build output (npm run build)
```

## Commands

- **`npm run dev`** — Dev server at http://localhost:5173, proxies `/api` to backend (e.g. 8000).
- **`npm run build`** — Production build to `dist/`.
- **`npm run preview`** — Serve `dist/` locally.

## Design tokens

Defined in `tailwind.config.js` and `src/constants/tiers.ts`: tier-0..3, bg, surface, text-primary, accent (see CLAUDE.md).
