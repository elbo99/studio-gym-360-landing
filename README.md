# Studio Gym 360 — Landing

Application mobile de coaching en ligne. Site déployé sur **studiogym360.com** (Vercel), repo GitHub **elbo99/studio-gym-360-landing**.

- Site **autonome** : HTML/CSS/JS en clair dans `index.html` (pas de `styles.css`/`site.js` externes).
- Pages : `index.html`, `espace-coach.html`, `admin.html`.
- Back-end : dossier `api/` (réservations, créneaux, stats — Supabase + Resend).

## ⚠️ Ne pas mélanger avec le site vitrine
Le **site vitrine du Studio Gym physique** (pages avis/cgv/coachs/offres/services,
`styles.css`, `site.js`, logos…) vit dans un **dossier séparé** :

    ../studio-gym-vitrine

Ne jamais éditer/exporter le site vitrine dans CE dossier : son `index.html`
écraserait celui du 360. Ouvre toujours `studio-gym-vitrine/` pour la vitrine.

Si `index.html` a malgré tout été écrasé : `git restore index.html` le remet en place.
