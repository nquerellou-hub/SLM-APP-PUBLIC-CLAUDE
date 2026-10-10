# SLM Transfert V8

Nouvelle interface complète, tunnel Premium refait et landing page dans le même thème.
**Mêmes comptes, mêmes données Supabase que la V7** : rien à migrer dans la base. La V7 peut tourner en parallèle sur le même compte pendant les essais (les deux versions lisent et écrivent le même format).

## V8.1 — refonte design « Signalisation » (octobre 2026)

Design et interactions uniquement : **aucun changement de données, de routes, de fonctions globales, de paiement ni de fonction Supabase.**

- **Identité** : vert SLM et blanc inspirés des panneaux de direction (panneaux verts avec filet blanc intérieur), chiffres et titres en Overpass, texte en Manrope (Cormorant Garamond retiré). L’or/champagne est remplacé par des verts : Premium = dégradé vert. Verre dépoli réservé aux barres fixes, au toast et au pied des fenêtres.
- **Application** : `style.css` réécrit en gardant tous les noms de classes. Fondu léger entre les pages (View Transitions, avec repli automatique), apparition en cascade conservée. Mouvement coupé si « réduire les animations », verre retiré si « réduire la transparence ».
- **Landing** : animations GSAP 3.13.0 + ScrollTrigger + MotionPath chargés depuis jsDelivr (versions figées), uniquement sur `landing.html`. Sans GSAP (hors ligne, CDN bloqué), la page reste complète et lisible. Le fond animé en canvas est remplacé par un tracé SVG plus léger. Correction : les couleurs `--hero`, `--hero-mut` et `--mint` n’étaient définies nulle part (haut de la landing illisible).
- **Service worker** : version `slm-v8-2-0`.
- Fichiers modifiés : `style.css`, `landing.html`, `index.html` (polices), `app.js` (couleurs du fond de connexion, couleur de la barre d’état, transition de page), `billing.js` (couleurs des confettis), `sw.js`.

### V8.1.2 — connexion et formulaires
- **Rester connecté sur cet appareil** (écran de connexion, écran du code, Paramètres > Code et verrouillage) : activé, la session est conservée et l’appareil s’ouvre sans code ; désactivé, la session s’arrête à la fermeture du navigateur et le code est demandé. Réglage propre à chaque appareil (non synchronisé). « Se déconnecter » le désactive. Les comptes déjà connectés gardent leur comportement tant qu’ils ne l’activent pas.
- **Nouvelle course** : uniquement des menus déroulants (jour, client, paiement, type de course, statut) ; bouton « Inverser » et lien « Appliquer » retirés (le tarif calculé reste appliqué automatiquement si le prix est vide). Les listes viennent de Paramètres > Listes.
- **Fiche client** : type en menu déroulant. **Paramètres** : apparence et préréglage des rappels en menus, heures de rappel en interrupteurs.

### V8.1.3 — landing mobile restructurée
- **Mobile uniquement** (≤ 760 px, l’ordinateur ne change pas) : en-tête compact, hero centré sur un seul bouton avec réassurance, bandeau « en bref », étapes de la journée à faire glisser, maquettes avant le texte, résultat du calculateur avant les curseurs, offre Premium en premier, barre d’inscription fixe en bas (masquée sur les tarifs, l’appel final et le pied de page).
- **Mode sombre forcé des navigateurs mobiles** (Opera, Chrome, Samsung) bloqué par `color-scheme: only light` : il assombrissait les boutons blancs et les barres du calculateur. Le thème sombre de l’application reste actif via les réglages du téléphone.
- **Débordement horizontal** corrigé, y compris avec un texte agrandi dans les réglages du téléphone (testé à 320 px et +25 %).

### V8.1.4 — thème clair par défaut, rapport Premium, audit d’affichage
- **Thème clair par défaut** pour l’application et la landing (la landing est toujours claire). Dans l’application, Paramètres > Affichage permet de choisir Sombre ou Automatique ; le dernier choix est mémorisé sur l’appareil pour l’écran de connexion. Les comptes restés sur l’ancien défaut « Automatique » passent une fois en clair (indicateur `themeLightV814` dans les métadonnées).
- **Rapport Premium** : l’application affiche désormais la vraie raison d’une erreur de la fonction `premium-report` (au lieu de « Edge Function returned a non-2xx status code »). Si le service ne répond pas (hors refus d’accès 401/403), le rapport est calculé sur l’appareil avec la même formule, et une mention l’indique.
- **Audit d’affichage** : toutes les pages et fenêtres contrôlées automatiquement (360, 320 et 300 px, clair et sombre, compte gratuit et Premium/admin, ordinateur). Corrections : barre du haut allégée sur mobile, boutons et textes longs qui passent à la ligne (e-mail en titre de « Mon compte »), pastilles et barre du bas sur très petit écran.

### V8.1.5 — premier écran de la landing (mobile)
- Hero mobile refait : badge à point lumineux, accroche avec reflet animé, bouton vert vif avec éclat lumineux et flèche, réassurance en trois points, halos verts animés en fond, et téléphone visible dès l’ouverture. « Calculer ma marge » et l’encart d’installation passent sous le téléphone.
- Couleurs choisies pour résister au mode sombre forcé de Samsung Internet (qui ignore `color-scheme`) : plus de bouton blanc dans le premier écran ni dans la barre du bas.
- L’ordinateur et le reste de la page ne changent pas.

### V8.2.0 — refonte graphique de la landing (skill UI/UX Pro Max)
- Structure « page d’application » recommandée par le skill : haut de page avec téléphone, bandeau de confiance, « Ce que vous perdez aujourd’hui » (problème → solution), galerie de 4 écrans de l’app (défilement manuel, boutons, points, clavier ; jamais automatique), grille de fonctions façon bento, étapes numérotées avec appel à s’inscrire, puis calculateur, tarifs, questions et appel final.
- Style Soft UI en vert et blanc : ombres douces, coins arrondis, boutons verts à texte blanc (contraste vérifié), badge et reflet du haut de page aussi sur ordinateur.
- Textes, calculateur, prix Stripe, parrainage `?ref=` et animations GSAP conservés ; mouvement réduit respecté.

## Identité visuelle

Vert SLM (#27634a) et blanc, surfaces en verre dépoli (transparence et flou) sur les barres fixes, halos verts en fond. Les écrans Premium utilisent un dégradé vert, sans autre couleur. Mode sombre disponible (vert profond).

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
Remplacer à la racine du dépôt : `index.html`, `landing.html`, `config.js`, `core.js`, `app.js`, `cloud.js`, `push.js`, `billing.js`, `admin.js`, `style.css`, `sw.js`, `manifest.json`. Supprimer l’ancien `landing.html` s’il diffère. Le service worker change de version (`slm-v8-2-0`) : les téléphones chargent la nouvelle version à la prochaine ouverture.

Conseil : publier d’abord sur une branche de prévisualisation Vercel, se connecter avec un vrai compte, puis fusionner sur `main`.

## À vérifier sur un vrai compte avant d’ouvrir à tous
- Connexion, code PIN, synchronisation entre téléphone et ordinateur.
- Création, fin de course, facture PDF, export Excel.
- Paiement test Stripe mensuel et annuel (mode test), arrivée sur l’écran de bienvenue, page Premium avec rapport.
- Activation des rappels sur un téléphone.

## Tests réalisés
Tests automatisés dans un navigateur avec un faux serveur Supabase et 6 mois de données de démonstration : création de course par le formulaire et par la dictée, fin de course et facture automatique, dépense, téléchargement PDF, export Excel, thème sombre, recherche, verrou PIN, bouton retour, page Premium (gratuit, membre, aperçu admin), espace admin, landing. Aucune erreur JavaScript. **Aucun test n’a été fait sur votre vrai projet Supabase ni avec Stripe.**
