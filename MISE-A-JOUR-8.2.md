# SLM — corrections de fiabilité et d’interface, 10 octobre 2026

## Fichiers concernés

`app.js`, `core.js`, `cloud.js`, `billing.js`, `admin.js`, `style.css`, `landing.html`, `sw.js`.

Aucune migration SQL, nouvelle clé ou modification des Edge Functions n’est nécessaire pour ces corrections. Les intégrations existantes sont conservées. La clé de cache du service worker est renouvelée.

## Corrections livrées

- Dictée : contrôle Premium fonctionnel, repli vers le clavier si la reconnaissance du navigateur est absente ; dates telles que « 28 janvier » reconnues ; avertissement pour date/heure non reconnues. La création reste à confirmer.
- Récupération du mot de passe : formulaire dédié, confirmation, sauvegarde et retour à la connexion.
- Courses : filtre À traiter pour les courses dépassées ; recherche sur tout l’historique ; bouton Afficher plus ; historique client non coupé à 50 courses.
- Client : sélection conservée par identifiant pour les homonymes ; téléphone modifié enregistré ; chiffre d’affaires client fondé sur les courses terminées.
- Validation : champs invalides signalés ; montants/distances négatifs refusés ; client et prestation nécessaires pour créer manuellement une facture ; TVA de dépense limitée au montant TTC.
- Commission : zéro explicite conservé ; calcul automatique réservé au champ vide.
- Factures : instantané des coordonnées et réglages, pris à la création ; les factures existantes sans instantané sont figées avec les informations disponibles lors de l’ouverture de cette version. Cela ne peut pas reconstituer des coordonnées historiques déjà perdues.
- PDF : plusieurs pages si le contenu est long, pied de page et numérotation.
- Offre Premium : retour au formulaire avec la saisie intacte après fermeture de l’offre contextuelle.
- Photo : sauvegarde bloquée pendant la préparation ; résultat tardif ignoré après changement de fenêtre.
- Excel : fusion des réglages seulement si le fichier porte des réglages plus récents.
- Indicateurs : courses terminées séparées du prévisionnel dans les agrégats ; commissions déduites du net estimé ; coût/km cohérent entre aperçu et rapport Premium ; indication du calcul local de secours.
- Les calculs restent des estimations : les dépenses sont déduites TTC, la TVA déductible n’est pas automatiquement récupérée. Ne pas ressaisir en dépenses les commissions déjà portées sur les courses. Les règles fiscales personnalisées restent à valider selon l’activité.
- Paramètres : listes non vides, doublons retirés, valeurs par défaut réactualisées.
- CRM : message d’erreur détaillé lors d’un changement de rôle ; recherche explicitement annoncée sur la page courante.
- Rôles : actualisation au retour dans l’application, hors saisie ouverte ; protection contre certaines réponses d’abonnement tardives après changement de compte.
- Accessibilité : contrastes renforcés, lien Premium nommé sur mobile, focus contenu dans les fenêtres, fond inerte, attributs ARIA corrigés, zone de défilement de la landing accessible au clavier.
- Landing : titre adaptable aux écrans de 320 px et aux polices de remplacement.

## Vérifications

Tests locaux avec données fictives et Supabase/Stripe simulés : 13 tests ciblés réussis ; parcours création/client/course/PDF/photo/Excel/CRM exercés ; contrôle de 316 rendus de page aux largeurs 320, 375, 768 et 1440 px, thèmes clair/sombre, rôles Free/Premium/Admin ; génération d’un PDF de 8 pages ; syntaxe des 8 fichiers JavaScript vérifiée.

Les contrôles automatisés ne certifient pas à eux seuls toute l’accessibilité. Les vraies sessions Supabase, e-mails, paiements Stripe, synchronisations multi-appareils, microphones et notifications doivent encore être essayés en recette sur les appareils concernés.

## Mise en ligne

1. Mettre à jour ces fichiers dans le dépôt GitHub utilisé par Vercel, à la même place que les anciens.
2. Attendre le déploiement Vercel terminé.
3. Fermer puis rouvrir l’application ; au besoin recharger la page pour activer les nouveaux fichiers.
4. Essayer avec un compte de recette : récupération du mot de passe, course dictée, PDF, synchronisation sur deux appareils, changement de rôle administrateur.

Les fichiers ont été modifiés localement ; cette opération ne publie rien sur GitHub ou Vercel.

## Limites et suites

La recherche globale de tous les comptes du CRM, le retour au rôle automatique Stripe, les modèles de courses récurrentes, une compréhension vocale par IA et la lecture OCR des tickets sont des évolutions distinctes. Elles ne sont pas présentées comme livrées ici. Les protections serveur existantes n’ont pas été remplacées ni leur fonctionnement en production certifié.
