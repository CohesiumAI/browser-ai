# Guide de Release

## Deux dépôts Git

| Dépôt | Contenu | Visibilité |
|-------|---------|------------|
| **browser-ai-internal** | Projet complet + CDC | Privé |
| **browser-ai** | Librairie + docs | Public |

## Préparation des releases

### Windows (PowerShell)

```powershell
# Release publique (librairie + docs)
.\scripts\prepare-release.ps1 -Type public -OutputDir C:\releases\browser-ai

# Release complète (avec CDC)
.\scripts\prepare-release.ps1 -Type full -OutputDir C:\releases\browser-ai-internal
```

### Linux/Mac (Bash)

```bash
# Release publique
./scripts/prepare-release.sh public ~/releases/browser-ai

# Release complète
./scripts/prepare-release.sh full ~/releases/browser-ai-internal
```

## Structure des releases

### Release publique (`browser-ai`)

```
browser-ai/
├── packages/           # Core, React, UI, Providers, Modules
├── examples/           # Vite, Next.js demos
├── docs/               # Documentation technique
├── README.md           # Documentation principale
├── CHANGELOG.md        # Historique des versions
├── CONTRIBUTING.md     # Guide de contribution
└── LICENSE             # MIT
```

### Release complète (`browser-ai-internal`)

```
browser-ai-internal/
├── cdc/                # Cahiers des charges (CONFIDENTIEL)
│   ├── cdc_browser_ai_v_2026.8.md
│   ├── cdc_browser_ai_roadmap_*.md
│   └── analyse_*.md
├── packages/           # (idem public)
├── examples/           # (idem public)
├── docs/               # (idem public)
└── README-INTERNAL.md  # Documentation interne
```

## Push vers les repos

### Repo public

```bash
cd C:\releases\browser-ai
git remote add origin git@github.com:your-org/browser-ai.git
git branch -M main
git push -u origin main
```

### Repo interne

```bash
cd C:\releases\browser-ai-internal
git remote add origin git@github.com:your-org/browser-ai-internal.git
git branch -M main
git push -u origin main
```

## Checklist avant release

- [ ] Vérification globale passe (`pnpm run verify`)
- [ ] Tests Playwright passent (`cd examples/vite-text && pnpm test:e2e`)
- [ ] CHANGELOG.md à jour
- [ ] Version bump dans les package.json
- [ ] Pas de secrets/credentials dans le code
- [ ] README à jour

## Publication npm (GitHub Actions + Changesets)

Pré-requis:

- `NPM_TOKEN` configuré dans les secrets du repo GitHub (token d'automatisation npm)
- 2FA activée sur le compte / org npm

Workflow:

- Chaque PR ajoute un changeset (`pnpm changeset`)
- Une fois mergé sur `main`, le workflow `Release`:
  - ouvre/maintient une PR de version (bump + changelog)
  - puis publie sur npm quand la PR de version est mergée

## Versioning

Suivre [SemVer](https://semver.org/):
- **MAJOR** (x.0.0): Breaking changes
- **MINOR** (0.x.0): Nouvelles fonctionnalités rétro-compatibles
- **PATCH** (0.0.x): Bug fixes

Version actuelle: **v2.1.0** (2026-01-19)
