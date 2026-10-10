# Identité Cabpilot

Le logiciel de gestion et sa landing page portent désormais le nom Cabpilot.
Les noms visibles, les titres, le manifeste et les icônes ont été mis à jour.
Les réglages d’entreprise et les factures des utilisateurs sont conservés.
Les identifiants de stockage, exports, Supabase et Stripe ne sont pas renommés.

## Publication
Envoyer les fichiers modifiés et cabpilot-icon.svg sur le dépôt du logiciel de gestion.
Vercel publiera la partie web selon la configuration du dépôt.
Les textes de quatre fonctions Supabase ont également été renommés ; pour publier ces textes serveur, exécuter depuis la racine du projet dans Terminal :

```sh
npx supabase functions deploy stripe-checkout --project-ref ucmwtebwlbrmybxdjxlg --use-api
npx supabase functions deploy stripe-portal --project-ref ucmwtebwlbrmybxdjxlg --use-api
npx supabase functions deploy premium-report --project-ref ucmwtebwlbrmybxdjxlg --use-api
npx supabase functions deploy push-reminders --project-ref ucmwtebwlbrmybxdjxlg --use-api --no-verify-jwt
```

Aucune migration SQL. Les paramètres de marque externes Stripe et les modèles d’e-mails Supabase ne sont pas modifiés par ces fichiers.
Le nom et l’icône d’une application déjà installée peuvent être actualisés avec un délai dépendant du navigateur.
