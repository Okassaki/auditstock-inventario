# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (server-side)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── inventario-audit/   # Expo mobile app - Inventory Audit System
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Auditoría de Inventario App (`artifacts/inventario-audit`)

Mobile app for inventory auditing (Sistema vs Stock Físico).

### Features
- **Import**: Excel (.xlsx) file import with validation (empty codes, duplicate IMEIs)
- **Search**: By code, name, or IMEI with barcode scanner integration
- **Count**: Physical stock entry with IMEI scanning support
- **Auto logic**: Difference = Physical - System; auto-classify as Correct/Surplus/Missing
- **Summary**: Lists of missing, surplus, and correct products with full details
- **Export**: Excel export (all / missing / surplus)
- **SQLite**: Local database for offline usage (expo-sqlite)
- **Inconsistency Detection**: Duplicate IMEIs, negative stocks, cross-product conflicts
- **Dark mode**: Full dark/light theme support
- **Spanish**: All UI in Spanish

### Key Files
- `context/DatabaseContext.tsx` - SQLite DB provider with all CRUD operations
- `utils/excel.ts` - Excel import (xlsx parsing) and export (xlsx generation)
- `components/BarcodeScannerModal.tsx` - Camera barcode scanner modal
- `components/ui/ProductoCard.tsx` - Product card with status indicator
- `app/(tabs)/index.tsx` - Home screen: auditoria management
- `app/(tabs)/conteo.tsx` - Physical count screen with product search
- `app/(tabs)/resumen.tsx` - Summary screen with export buttons
- `app/(tabs)/alertas.tsx` - Inconsistency alerts screen

### Dependencies Added
- `expo-sqlite@~16.0.10` - Local SQLite database
- `expo-camera@~17.0.10` - Barcode scanning
- `expo-document-picker@~14.0.8` - File picker for Excel import
- `expo-file-system@~19.0.21` - File reading/writing
- `expo-sharing@~14.0.8` - Share/download exports
- `xlsx@^0.18.5` - Excel parsing and generation

## API Server (`artifacts/api-server`)

Express 5 API server with health check endpoint.
