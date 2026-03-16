# 🧬 MyelomaGen — Clinical Genomic Interpretation Platform for Multiple Myeloma

**MyelomaGen** is a web-based clinical decision support system for genomic variant analysis in Multiple Myeloma (MM). It automates VCF file processing, variant annotation, tiered classification, and structured clinical reporting — following international guidelines (AMP/ASCO/CAP, NCCN, IMWG).

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Clinical Workflow](#clinical-workflow)
- [Roles & Permissions](#roles--permissions)
- [License](#license)

---

## Overview

MyelomaGen bridges the gap between raw genomic data and actionable clinical insights for hematologist-oncologists and molecular pathologists. The platform ingests VCF files (or manually entered variants), runs an automated annotation and classification pipeline, and produces structured reports with therapeutic recommendations, prognostic stratification, and biomarker assessment — all within a regulatory-aware framework.

---

## Key Features

| Feature | Description |
|---|---|
| **VCF Upload & Parsing** | Supports somatic, germline, and tumor-normal paired samples in GRCh37/GRCh38 |
| **Manual Variant Entry** | Editable spreadsheet-style grid with clipboard paste support (tab/CSV) |
| **AI-Powered Annotation** | Automated variant annotation via ClinVar, COSMIC, gnomAD, and MM-specific databases |
| **Tiered Classification** | AMP/ASCO/CAP 4-tier system with evidence levels (A–E) |
| **Biomarker Detection** | Identifies diagnostic, prognostic, and therapeutic biomarkers (del(17p), t(4;14), gain(1q), etc.) |
| **Therapy Decision Support** | Region-aware therapeutic recommendations (Brazil ANVISA, US FDA, EU EMA) |
| **Clinical Reporting** | Structured HTML/PDF reports with QC summary, variant tables, and prognostic assessment |
| **Expert Review Workflow** | Molecular pathologist review with audit trail and variant reclassification |
| **Admin Panel** | User management, system statistics, case oversight, and audit logs |
| **Role-Based Access Control** | Granular permissions: Admin, Molecular Pathologist, Hematologist-Oncologist, Lab Technician, Viewer |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│          React + TypeScript + Tailwind           │
│         (SPA with protected routes)              │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│               Lovable Cloud                      │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Auth      │  │ Database │  │ Edge         │  │
│  │ (JWT)     │  │ (Postgres)│  │ Functions    │  │
│  └───────────┘  └──────────┘  └──────────────┘  │
│                                                  │
│  Edge Functions:                                 │
│  • analyze-vcf       → VCF parsing + annotation  │
│  • get-interpretation → AI clinical analysis     │
│  • generate-report   → HTML/PDF report gen       │
│  • review-variant    → Expert review actions      │
│  • reprocess-case    → Re-run pipeline            │
│  • admin-panel       → Admin operations           │
└─────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **State Management** | TanStack React Query |
| **Routing** | React Router v6 |
| **Backend** | Lovable Cloud (Supabase) — Postgres, Auth, Edge Functions |
| **AI Models** | Gemini 2.5 Pro (via Lovable AI Gateway) |
| **Animations** | Framer Motion |
| **Charts** | Recharts |
| **Testing** | Vitest, Playwright |

---

## Getting Started

### Prerequisites

- A [Lovable](https://lovable.dev) account with Cloud enabled
- Modern web browser (Chrome, Firefox, Edge, Safari)

### Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser

### Build

```bash
npm run build
```

---

## Project Structure

```
src/
├── components/
│   ├── layout/          # App shell, sidebar, navigation
│   ├── ui/              # shadcn/ui component library
│   ├── ManualVariantGrid.tsx
│   ├── NavLink.tsx
│   └── ProtectedRoute.tsx
├── contexts/
│   └── AuthContext.tsx   # Authentication state
├── hooks/               # Custom React hooks
├── integrations/
│   └── supabase/        # Auto-generated client & types
├── pages/
│   ├── Dashboard.tsx     # Case list & overview
│   ├── NewCase.tsx       # VCF upload or manual entry
│   ├── CaseReport.tsx    # Report viewer (HTML/PDF)
│   ├── ReviewCase.tsx    # Expert variant review
│   ├── Admin.tsx         # Admin panel
│   ├── Login.tsx         # Authentication
│   └── Signup.tsx        # User registration
├── types/
│   └── clinical.ts      # Domain type definitions
└── lib/
    └── utils.ts          # Utility functions

supabase/
└── functions/
    ├── analyze-vcf/      # VCF parsing & annotation pipeline
    ├── get-interpretation/# AI-powered clinical interpretation
    ├── generate-report/  # HTML report generation
    ├── review-variant/   # Variant review actions
    ├── reprocess-case/   # Pipeline re-execution
    └── admin-panel/      # Admin CRUD operations
```

---

## Clinical Workflow

```
1. CREATE CASE          Upload VCF or enter variants manually
       ↓                Define sample type, assembly, diagnosis, staging
2. AUTOMATED ANALYSIS   Parse → Annotate → Classify → Interpret
       ↓                AI-driven tiering (AMP/ASCO/CAP)
3. EXPERT REVIEW        Pathologist reviews flagged variants
       ↓                Reclassify, add notes, approve/reject
4. REPORT GENERATION    Structured clinical report (HTML/PDF)
       ↓                QC, variants, biomarkers, therapy, prognosis
5. CLINICAL ACTION      Therapeutic decision support
                        Region-specific drug approvals
```

---

## Roles & Permissions

| Role | Capabilities |
|---|---|
| **Admin** | Full system access, user management, audit logs, system statistics |
| **Molecular Pathologist** | Create cases, review & reclassify variants, generate reports |
| **Hematologist-Oncologist** | View cases & reports, access therapeutic recommendations |
| **Lab Technician** | Upload VCFs, create cases, view QC results |
| **Viewer** | Read-only access to cases and reports |

---

## Database Schema

The platform uses a relational schema with the following core tables:

- **cases** — Clinical case metadata (patient, diagnosis, staging, sample info)
- **vcf_variants** — Raw parsed variant data (CHROM, POS, REF, ALT, QUAL, FILTER)
- **variant_annotations** — ClinVar, COSMIC, gnomAD annotations per variant
- **variant_classifications** — Tier, clinical significance, review status
- **interpretation_results** — AI-generated clinical interpretation per case
- **therapy_options** — Therapeutic recommendations linked to variants
- **biomarker_interpretations** — Detected biomarkers with clinical implications
- **qc_summaries** — Quality control metrics per analysis
- **analysis_jobs** — Pipeline execution tracking
- **audit_logs** — Full audit trail of all actions
- **profiles** — User profile information
- **user_roles** — Role-based access control (RBAC)

All tables are protected by Row-Level Security (RLS) policies.

---

## License

This project is proprietary. All rights reserved.

---

<p align="center">
  Built with <a href="https://lovable.dev">Lovable</a>
</p>
