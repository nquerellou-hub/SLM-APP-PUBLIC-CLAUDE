# SLM Transfert V8

Nouvelle interface complète, tunnel Premium refait et landing page dans le même thème.
**Mêmes comptes, mêmes données Supabase que la V7** : rien à migrer dans la base. La V7 peut tourner en parallèle sur le même compte pendant les essais (les deux versions lisent et écrivent le même format).

## Ce qui change

- **Interface** : accueil avec la prochaine course et ses actions (itinéraire, appel, terminer), agenda par jour, fiche course, fiche client, finances par mois/année (vue d’ensemble, factures, dépenses), documents, paramètres regroupés. Barre basse avec bouton « + » central sur téléphone, menu latéral sur ordinateur, thème clair/sombre/automatique.
- **Saisie de course** : choix rapide Aujourd’hui/Demain, clients récents en un geste, inversion départ/arrivée, prix calculé depuis vos tarifs, dictée vocale (Premium).
- **Fin de course** : facture créée comme avant, puis décomposition « où part l’argent » (recette, commission, kilomètres). En Gratuit, la marge est floutée : c’est le moment clé du tunnel Premium.
- **Tunnel Premium** : prix affiché partout, formule annuelle, essai gratuit, frise de l’essai, paywall contextuel par fonction, page Premium avec comparatif et FAQ, écran de bienvenue après paiement, parrainage partageable par WhatsApp. La popup des 5 secondes est supprimée : la proposition apparaît en fin de mois ou à des paliers de courses (au plus une fois par semaine).
- **Landing** (`landing.html`) : même thème, téléphone animé, calculateur de marge interactif, tarifs lus dans Stripe, FAQ. Les liens de parrainage pointent vers la landing ; les anciens liens `?ref=` restent valables.

Les PDF de facture, l’export/restauration Excel, la synchronisation, les rappels push et l’espace administrateur reprennent le code V7 (fichiers `core.js`, `cloud.js`, `push.js`, `admin.js`).

## Mise en ligne (dans cet ordre)

### 1. Stripe
1. Dans le produit **SLM Transfert Premium**, créer un second prix récurrent **annuel** (ex. 89 €/an). Copier son identifiant `price_…`.
2. Vérifier le prix mensuel (ex. 9,90 €/mois).
3. Paramètres → Billing → **Abonnements et e-mails** : activer l’e-mail de rappel de fin d’essai (envoyé 7 jours avant la fin). La frise de l’essai l’annonce aux clients.

### 2. Supabase — secrets
```sh
npx supabase secrets set STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_xxx --project-ref ucmwtebwlbrmybxdjxlg
npx supabase secrets set STRIPE_TRIAL_DAYS=14 --project-ref ucmwtebwlbrmybxdjxlg
```
`STRIPE_TRIAL_DAYS=0` désactive l’essai. Sans prix annuel, l’application n’affiche que le mensuel. L’essai n’est proposé qu’aux comptes qui n’ont jamais eu d’abonnement.

### 3. Supabase — fonctions (depuis ce dossier)
```sh
npx supabase functions deploy stripe-checkout --project-ref ucmwtebwlbrmybxdjxlg --use-api
npx supabase functions deploy premium-prices --project-ref ucmwtebwlbrmybxdjxlg --use-api --no-verify-jwt
```
Aucune migration SQL. Les autres fonctions (webhook, portail, rapport, CRM, rappels) sont inchangées. Après un paiement, Stripe renvoie désormais vers `#premium` au lieu de `#billing` (les deux adresses fonctionnent).

### 4. Prix de secours
`config.js` contient les prix affichés si `premium-prices` ne répond pas. Gardez-les identiques à Stripe.

### 5. Site (GitHub + Vercel)
Remplacer à la racine du dépôt : `index.html`, `landing.html`, `config.js`, `core.js`, `app.js`, `cloud.js`, `push.js`, `billing.js`, `admin.js`, `style.css`, `sw.js`, `manifest.json`. Supprimer l’ancien `landing.html` s’il diffère. Le service worker change de version (`slm-v8-0-0`) : les téléphones chargent la nouvelle version à la prochaine ouverture.

Conseil : publier d’abord sur une branche de prévisualisation Vercel, se connecter avec un vrai compte, puis fusionner sur `main`.

## À vérifier sur un vrai compte avant d’ouvrir à tous
- Connexion, code PIN, synchronisation entre téléphone et ordinateur.
- Création, fin de course, facture PDF, export Excel.
- Paiement test Stripe mensuel et annuel (mode test), arrivée sur l’écran de bienvenue, page Premium avec rapport.
- Activation des rappels sur un téléphone.

## Tests réalisés
Tests automatisés dans un navigateur avec un faux serveur Supabase et 6 mois de données de démonstration : création de course par le formulaire et par la dictée, fin de course et facture automatique, dépense, téléchargement PDF, export Excel, thème sombre, recherche, verrou PIN, bouton retour, page Premium (gratuit, membre, aperçu admin), espace admin, landing. Aucune erreur JavaScript. **Aucun test n’a été fait sur votre vrai projet Supabase ni avec Stripe.**
