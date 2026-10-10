# KDCN Platform

The internal dashboard portal for the KINGMAN DIGITAL CYBER NETWORK ecosystem.

## Repository Structure

This repository contains two generations of the portal:

```

KDCN-platform/
├── V1/    ← Django prototype (historical, not maintained)
└── V2/    ← Node.js + Cloudflare Workers (active build)

```

### V1 — Django prototype (frozen)

- Stack: Django 6 + SQLite
- Status: **historical only** — kept for reference
- Original scope: accounts, clients, projects, services, billing, documents,
  knowledge, notifications, support, dashboard, client portal, reports, search, API
- Location: `V1/`

**Do not deploy. Do not extend. Do not fix.** It exists so V2 can learn from it.

### V2 — Active build

- Stack: Node.js (stdlib only) → Cloudflare Workers + D1
- Status: **under active development**
- Location: `V2/`
- Design principles:
  - Mobile-first
  - Zero external runtime dependencies
  - Same code runs locally (Node) and in production (Workers)
  - Same auth pattern (JWT + scrypt) as other KDCN services
  - Deployed via GitHub Actions

## Target subdomain

`admin.kingmandigital.co.ke`

## Security Philosophy

> **No data left unguarded. No system left unsafe.**

## Development sessions

| Session | Deliverable | Status |
|---|---|---|
| 1 | API skeleton (`/health`, error envelope, server) | ✅ Done |
| 2 | Database schema + auth (JWT, login, refresh) | 🚧 Next |
| 3 | Client / Project / Service CRUD | ⏳ |
| 4 | Dashboard UI + fetch wiring | ⏳ |
| 5 | Deploy to Cloudflare Workers + D1 | ⏳ |

## Developer

A project by **KINGMAN DIGITAL CYBER NETWORK (KDCN)**

© 2026 KINGMAN DIGITAL. All Rights Reserved.
