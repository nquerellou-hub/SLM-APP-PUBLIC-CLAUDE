/* SLM Transfert — espace d’administration protégé par Supabase Edge Functions */
let adminAccess = false;
let adminChecking = false;
let adminLoading = false;
let adminLoaded = false;
let adminPage = 1;
let adminRows = [];
let adminSummary = null;
let adminSearch = "";
let adminDetailId = "";
let adminDetail = null;
let adminDetailLoading = false;
let adminActionBusy = false;
let adminError = "";
let adminSection = "overview";
let adminFilter = "all";

const adminDate = value => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};
const adminDateTime = value => {
  if (!value) return "Jamais";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const adminPlanLabel = row => row?.role ? ({ free: "Gratuit", premium: "Premium", admin: "Admin" })[row.role] || "Gratuit" : row?.plan === "premium" ? "Premium" : "Gratuit";
const adminRoleLabel = role => ({ free: "Gratuit", premium: "Premium", admin: "Admin" })[role] || "Gratuit";
const adminStatusLabel = status => ({ active: "Actif", trialing: "Essai", past_due: "Paiement à vérifier", canceled: "Résilié", unpaid: "Impayé", incomplete: "Incomplet", free: "Aucun abonnement" })[status] || status || "Aucun abonnement";

async function adminFunctionError(error, fallback) {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    let payload = null;
    try { payload = await response.clone().json(); } catch {}
    const detail = payload?.error || payload?.message || payload?.msg;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (response.status) return `Erreur CRM (HTTP ${response.status}). Consulte les journaux de la fonction admin-crm dans Supabase.`;
  }
  const message = typeof error?.message === "string" ? error.message : "";
  return !message || message === "Edge Function returned a non-2xx status code" ? fallback : message;
}

async function adminCheckAccess() {
  if (adminChecking) return adminChecking;
  if (!cloudUser || !sb) {
    const changed = adminAccess;
    adminAccess = false;
    adminLoaded = false;
    adminDetail = null;
    adminDetailId = "";
    if (changed && typeof tab !== "undefined" && tab === "admin" && typeof refresh === "function") refresh();
    return false;
  }
  adminChecking = (async () => {
    try {
      const { data, error } = await sb.functions.invoke("admin-crm", { body: { mode: "check" } });
      if (error) throw error;
      const changed = adminAccess !== !!data?.is_admin;
      adminAccess = !!data?.is_admin;
      if (!adminAccess) { adminLoaded = false; adminDetail = null; adminDetailId = ""; }
      if (changed && typeof tab !== "undefined" && ["plus", "admin", "account"].includes(tab) && typeof refresh === "function") refresh();
    } catch {
      const changed = adminAccess;
      adminAccess = false;
      adminLoaded = false;
      adminDetail = null;
      adminDetailId = "";
      if (changed && typeof tab !== "undefined" && ["plus", "admin", "account"].includes(tab) && typeof refresh === "function") refresh();
    } finally { adminChecking = false; }
    return adminAccess;
  })();
  return adminChecking;
}

async function adminLoad(page = 1) {
  if (!adminAccess || adminLoading) return;
  adminPage = Math.max(1, page);
  adminLoading = true;
  adminError = "";
  try {
    const { data, error } = await sb.functions.invoke("admin-crm", { body: { mode: "overview", page: adminPage } });
    if (error) throw error;
    if (!data?.is_admin) throw new Error("Accès administrateur refusé.");
    adminRows = data.users || [];
    adminSummary = data.summary || null;
    adminLoaded = true;
  } catch (error) {
    adminError = await adminFunctionError(error, "Impossible de charger les comptes.");
  } finally {
    adminLoading = false;
    adminLoaded = true;
    if (typeof tab !== "undefined" && tab === "admin") refresh();
  }
}

async function adminOpenUser(userId) {
  if (!adminAccess || adminDetailLoading) return;
  adminSection = "users";
  adminDetailId = userId;
  adminDetail = null;
  adminDetailLoading = true;
  adminError = "";
  refresh();
  try {
    const { data, error } = await sb.functions.invoke("admin-crm", { body: { mode: "user", user_id: userId } });
    if (error) throw error;
    adminDetail = data;
  } catch (error) {
    adminError = await adminFunctionError(error, "Impossible de charger la fiche utilisateur.");
  } finally {
    adminDetailLoading = false;
    if (typeof tab !== "undefined" && tab === "admin") refresh();
  }
}

function adminBackToList() {
  adminSection = "users";
  adminDetailId = "";
  adminDetail = null;
  adminError = "";
  refresh();
}

function adminSetSection(section) {
  adminSection = section === "users" ? "users" : "overview";
  if (adminSection === "users" && !adminLoaded && !adminLoading) adminLoad(1);
  refresh();
}

function adminSetFilter(filter) {
  adminFilter = ["all", "premium", "free", "admin", "attention", "referrals"].includes(filter) ? filter : "all";
  adminSection = "users";
  if (!adminLoaded && !adminLoading) adminLoad(1);
  refresh();
}

function adminSetSearch(value) {
  adminSearch = value || "";
  const cursor = document.getElementById("admin-user-search")?.selectionStart;
  refresh();
  const input = document.getElementById("admin-user-search");
  if (input) { input.focus(); input.setSelectionRange(cursor ?? input.value.length, cursor ?? input.value.length); }
}

async function adminRunAction(action) {
  if (!adminAccess || !adminDetailId || adminActionBusy) return;
  const cancel = action === "cancel_subscription";
  const prompt = cancel
    ? "Programmer la résiliation de cet abonnement à la fin de sa période déjà payée ?"
    : "Réactiver cet abonnement afin qu’il continue après sa période en cours ?";
  if (!confirm(prompt)) return;
  adminActionBusy = true;
  try {
    const { data, error } = await sb.functions.invoke("admin-user-action", { body: { user_id: adminDetailId, action } });
    if (error) throw error;
    toast(cancel ? "Résiliation programmée en fin de période." : "Renouvellement réactivé.");
    if (data?.subscription_url) adminDetail.subscription_url = data.subscription_url;
    adminLoaded = false;
    await adminOpenUser(adminDetailId);
  } catch (error) {
    toast(error?.message || "Action impossible. Vérifiez l’abonnement dans Stripe.");
  } finally { adminActionBusy = false; if (typeof tab !== "undefined" && tab === "admin") refresh(); }
}

async function adminRunRoleChange(nextRole) {
  if (!adminAccess || !adminDetailId || adminActionBusy) return;
  if (!["free", "premium", "admin"].includes(nextRole)) return toast("Choisissez un rôle valide.");
  if (adminDetail?.protected_admin || adminDetail?.user?.id === cloudUser?.id) return toast("Le rôle de ce compte ne peut pas être modifié depuis sa propre session.");
  const currentRole = adminDetail?.account?.role || "free";
  if (nextRole === currentRole) return toast("Ce rôle est déjà attribué.");
  const prompt = nextRole === "free"
    ? "Attribuer le rôle Gratuit ? Cela retire l’accès Premium dans SLM Transfert, mais n’annule pas un abonnement Stripe actif : il continuera à être facturé tant qu’il n’est pas résilié."
    : nextRole === "premium"
      ? `Attribuer un accès Premium manuel ? Il sera gratuit pour l’utilisateur et restera actif jusqu’à ce qu’un administrateur change son rôle.${["active", "trialing", "past_due"].includes(adminDetail?.account?.subscription_status) ? " Son abonnement Stripe actif continuera aussi à être facturé." : ""}`
      : `Attribuer le rôle Admin ? Cette personne pourra ouvrir le CRM et gérer les rôles des autres utilisateurs.${["active", "trialing", "past_due"].includes(adminDetail?.account?.subscription_status) ? " Son abonnement Stripe actif continuera aussi à être facturé séparément." : ""}`;
  if (!confirm(prompt)) return;
  adminActionBusy = true;
  try {
    const { data, error } = await sb.functions.invoke("admin-user-action", { body: { user_id: adminDetailId, action: "set_role", role: nextRole } });
    if (error) throw error;
    toast(`Rôle ${adminRoleLabel(data?.role || nextRole)} attribué.`);
    adminLoaded = false;
    await adminOpenUser(adminDetailId);
  } catch (error) {
    toast(await adminFunctionError(error, "Impossible de modifier le rôle. Réessayez."));
  } finally { adminActionBusy = false; if (typeof tab !== "undefined" && tab === "admin") refresh(); }
}

function adminUpdateDeleteButton() {
  const input = document.getElementById("admin-delete-email-confirm");
  const button = document.getElementById("admin-delete-user-button");
  const email = String(adminDetail?.user?.email || "").trim().toLowerCase();
  if (button) button.disabled = adminActionBusy || !email || String(input?.value || "").trim().toLowerCase() !== email;
}

async function adminRunDeleteUser() {
  if (!adminAccess || !adminDetailId || adminActionBusy) return;
  const email = String(adminDetail?.user?.email || "").trim();
  if (!email || adminDetail?.protected_admin || adminDetail?.user?.id === cloudUser?.id) {
    return toast("Ce compte est protégé et ne peut pas être supprimé depuis cette session.");
  }
  const confirmation = String(document.getElementById("admin-delete-email-confirm")?.value || "").trim();
  if (confirmation.toLowerCase() !== email.toLowerCase()) return toast("Saisissez l’adresse e-mail exacte du compte.");
  if (!confirm(`Supprimer définitivement le compte ${email} ? Ses données synchronisées seront effacées. Tout abonnement Stripe encore actif sera résilié immédiatement. Aucun remboursement ne sera déclenché.`)) return;

  adminActionBusy = true;
  try {
    const { data, error } = await sb.functions.invoke("admin-user-action", {
      body: { user_id: adminDetailId, action: "delete_user", confirmation_email: confirmation },
    });
    if (error) throw new Error(await adminFunctionError(error, "Suppression impossible."));
    adminDetailId = "";
    adminDetail = null;
    adminError = "";
    adminLoaded = false;
    adminSection = "users";
    toast(data?.subscription_cancelled
      ? "Compte supprimé et abonnement Stripe résilié immédiatement. Aucun remboursement automatique n’a été lancé."
      : "Compte utilisateur supprimé.");
    await adminLoad(adminPage);
  } catch (error) {
    toast(error?.message || "Suppression impossible. Vérifiez les journaux de la fonction admin-user-action.");
  } finally {
    adminActionBusy = false;
    if (typeof tab !== "undefined" && tab === "admin") refresh();
  }
}

function adminLink(url, label) {
  return url ? `<a class="sec sm admin-external-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>` : `<span class="admin-muted-link">${label} indisponible</span>`;
}

function adminDetailHTML() {
  if (adminDetailLoading) return `<div class="admin-loading"><span class="admin-spinner"></span>Chargement de la fiche…</div>`;
  if (!adminDetail) return `<div class="card admin-error" role="alert">${esc(adminError || "Impossible de charger cette fiche.")}<button class="sec sm" onclick="adminBackToList()">Retour à la liste</button></div>`;
  const { user, account, rewards = [], referrals = [], activity = [], admin_actions = [] } = adminDetail;
  const active = account && ["active", "trialing", "past_due"].includes(account.subscription_status);
  const role = account?.role || (account?.plan === "premium" ? "premium" : "free");
  const protectedRole = !!adminDetail.protected_admin || user.id === cloudUser?.id;
  const eventNames = { app_opened: "A ouvert l’application", page_home: "A consulté l’accueil", page_courses: "A consulté l’agenda", page_history: "A consulté l’historique", page_clients: "A consulté les clients", page_plus: "A consulté Plus", page_factures: "A consulté factures et devis", page_compta: "A consulté la comptabilité", page_documents: "A consulté les documents", page_billing: "A consulté abonnement et parrainage", page_settings: "A consulté les paramètres", page_tools: "A consulté le transfert de données", course_created: "A créé une course", client_created: "A créé un client", invoice_created: "A créé une facture ou un devis", expense_created: "A créé une dépense", premium_promo_shown: "A vu une invitation Premium", premium_cta_clicked: "A ouvert une offre Premium", premium_gate_opened: "A demandé une fonction Premium", checkout_started: "A commencé le paiement Premium" };
  return `<div class="page-breadcrumb"><a href="#plus">Plus</a><span>›</span><a href="#admin">Administration</a><span>›</span><span>Compte utilisateur</span></div>
    <div class="page-head"><div><span class="eyebrow">CRM · COMPTE</span><h2>${esc(user.email || "Compte utilisateur")}</h2><p>Créé le ${adminDate(user.created_at)} · Dernière connexion : ${adminDateTime(user.last_sign_in_at)}</p></div><button class="sec sm" onclick="adminBackToList()">← Retour aux comptes</button></div>
    ${adminError ? `<div class="admin-error" role="alert">${esc(adminError)}</div>` : ""}
    <div class="admin-detail-grid"><section class="card"><span class="eyebrow">ABONNEMENT STRIPE</span><h3>${account?.plan === "premium" ? "Premium payé" : "Aucun Premium Stripe"} · ${esc(adminStatusLabel(account?.subscription_status))}</h3><div class="row"><span>Prochaine échéance</span><b>${adminDate(account?.current_period_end)}</b></div><div class="row"><span>Résiliation en fin de période</span><b>${account?.cancel_at_period_end ? "Oui" : "Non"}</b></div><div class="row"><span>Code de parrainage</span><b>${esc(account?.referral_code || "—")}</b></div><div class="row"><span>Statistiques facultatives</span><b>${account?.analytics_consent ? "Accord actif" : "Désactivées"}</b></div>
      <div class="admin-link-row">${adminLink(adminDetail.customer_url, "Compte Stripe")}${adminLink(adminDetail.subscription_url, "Abonnement Stripe")}</div>
      ${active ? `<div class="admin-action-row">${account.cancel_at_period_end ? `<button class="sec" onclick="adminRunAction('uncancel_subscription')" ${adminActionBusy ? "disabled" : ""}>Réactiver le renouvellement</button>` : `<button class="red" onclick="adminRunAction('cancel_subscription')" ${adminActionBusy ? "disabled" : ""}>Résilier en fin de période</button>`}</div><small class="admin-help">Les paiements, remboursements et moyens de paiement se gèrent dans le tableau de bord Stripe.</small>` : ""}</section>
      <section class="card"><span class="eyebrow">PARRAINAGE</span><h3>${referrals.length} compte${referrals.length === 1 ? "" : "s"} invité${referrals.length === 1 ? "" : "s"}</h3>${referrals.map(row => `<div class="admin-mini-row"><span>${esc(row.user_id)}</span><b>${adminPlanLabel(row)} · ${row.referral_qualified_at ? "qualifié" : "en attente"}</b></div>`).join("") || `<div class="empty compact"><b>Aucun filleul enregistré</b></div>`}<hr><h3>Récompenses attribuées</h3>${rewards.map(row => `<div class="admin-mini-row"><span>${esc(row.referred_user_id)}<small>${adminDate(row.created_at)}</small></span><b>${esc(row.status === "applied" ? "Mois appliqué" : row.status === "pending" ? "En attente" : "Annulé")}</b></div>`).join("") || `<div class="empty compact"><b>Aucune récompense</b></div>`}</section></div>
    <section class="card admin-activity"><div class="section-heading"><div><span class="eyebrow">JOURNAL D’USAGE CONSENTI</span><h3>Activité des 90 derniers jours</h3></div><span class="tag">${activity.length} événements</span></div><p>Ce journal ne contient que des ouvertures de rubriques et des créations principales, si la personne a donné son accord. Il n’inclut aucun trajet, contact, note ou montant.</p>${activity.map(row => `<div class="admin-mini-row"><span>${esc(eventNames[row.event_type] || "Action dans l’application")}</span><small>${adminDateTime(row.created_at)}</small></div>`).join("") || `<div class="empty compact"><b>Aucun événement consultable</b><span>Accord non donné ou aucun événement récent.</span></div>`}</section>
    <section class="card admin-role-card"><div><span class="eyebrow">RÔLES ET ACCÈS</span><h3>Rôle actuel : ${adminRoleLabel(role)}</h3><p><b>Gratuit</b> garde les outils de base ; <b>Premium</b> débloque les fonctions Premium ; <b>Admin</b> donne les fonctions Premium et l’accès au CRM pour gérer les comptes. Le rôle manuel ne déclenche aucun paiement Stripe.</p></div><div class="admin-role-controls"><label for="admin-role-select">Attribuer un rôle</label><div><select id="admin-role-select" ${protectedRole || adminActionBusy ? "disabled" : ""}><option value="free" ${role === "free" ? "selected" : ""}>Gratuit · accès de base</option><option value="premium" ${role === "premium" ? "selected" : ""}>Premium · accès Premium manuel</option><option value="admin" ${role === "admin" ? "selected" : ""}>Admin · Premium + CRM</option></select><button type="button" onclick="adminRunRoleChange(document.getElementById('admin-role-select')?.value)" ${protectedRole || adminActionBusy ? "disabled" : ""}>Enregistrer le rôle</button></div><small>${protectedRole ? "Compte administrateur protégé : son rôle ne peut pas être modifié ici." : account?.role_source === "manual" ? "Rôle attribué manuellement. Il reste actif jusqu’à une nouvelle modification par un administrateur." : "Rôle automatique : l’accès Premium suit l’état de l’abonnement Stripe."}</small></div><div class="admin-role-legend"><span><b>Gratuit</b> · outils de base</span><span><b>Premium</b> · analyse de rentabilité</span><span><b>Admin</b> · fonctions Premium, CRM et gestion des rôles</span></div></section>
    ${protectedRole ? `<section class="card admin-delete-card admin-delete-protected"><div><span class="eyebrow">ZONE SENSIBLE</span><h3>Suppression protégée</h3><p>Le compte actuellement connecté et l’administrateur principal ne peuvent pas être supprimés depuis cette session.</p></div></section>` : `<section class="card admin-delete-card"><div class="admin-delete-copy"><span class="eyebrow">ZONE SENSIBLE</span><h3>Supprimer ce compte</h3><p>Cette action supprime définitivement le compte et ses données synchronisées dans SLM Transfert.</p><ul><li>Courses, clients, réglages, factures et documents du cloud seront supprimés.</li><li>Le rôle, les statistiques d’usage et les liens de parrainage associés seront retirés.</li><li>Tout abonnement Stripe encore actif sera résilié immédiatement. Aucun remboursement ne sera envoyé automatiquement ; l’historique des paiements reste géré dans Stripe.</li><li>Une copie déjà enregistrée hors ligne sur un appareil peut rester sur cet appareil jusqu’à l’effacement de ses données locales.</li></ul></div><div class="admin-delete-controls"><label for="admin-delete-email-confirm">Pour confirmer, saisissez <b>${esc(user.email || "l’adresse e-mail")}</b></label><div><input id="admin-delete-email-confirm" type="email" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Adresse e-mail du compte" oninput="adminUpdateDeleteButton()"><button id="admin-delete-user-button" type="button" class="red" onclick="adminRunDeleteUser()" disabled>Supprimer définitivement</button></div><small>Votre propre compte et l’administrateur principal sont protégés.</small></div></section>`}
    <section class="card admin-activity"><div class="section-heading"><div><span class="eyebrow">HISTORIQUE ADMIN</span><h3>Modifications administratives</h3></div></div>${admin_actions.map(row => `<div class="admin-mini-row"><span>${row.action === "subscription_cancel_scheduled" ? "Résiliation programmée" : row.action === "subscription_cancel_revoked" ? "Renouvellement réactivé" : `Rôle modifié : ${esc(adminRoleLabel(row.details?.from_role))} → ${esc(adminRoleLabel(row.details?.to_role))}`}</span><small>${adminDateTime(row.created_at)}</small></div>`).join("") || `<div class="empty compact"><b>Aucune modification administrateur enregistrée</b></div>`}</section>`;
}

function adminPageHTML() {
  if (!adminAccess) {
    if (cloudUser && !adminChecking) adminCheckAccess();
    return `<div class="page-breadcrumb"><a href="#plus">Plus</a><span>›</span><span>Administration</span></div><div class="page-head"><div><span class="eyebrow">ESPACE PRIVÉ</span><h2>Administration</h2><p>Gestion réservée au compte administrateur.</p></div></div><section class="card admin-denied"><span>🔒</span><h3>Accès réservé</h3><p>Connectez-vous avec le compte administrateur configuré pour cette application.</p><div class="two"><a class="sec sm" href="#account">Vérifier mon compte</a><button class="sm" type="button" onclick="adminCheckAccess().then(ok=>{if(ok)adminLoad(1);refresh()})">Réessayer l’accès</button></div></section>`;
  }
  if (!adminDetailId && !adminLoaded && !adminLoading) adminLoad(1);
  if (adminDetailId) return adminDetailHTML();
  const query = adminSearch.trim().toLocaleLowerCase("fr-FR");
  const filtered = adminRows.filter(row => {
    const searchable = `${row.email || ""} ${row.account?.referral_code || ""} ${row.account?.role || ""} ${row.account?.plan || ""}`.toLocaleLowerCase("fr-FR");
    if (query && !searchable.includes(query)) return false;
    const status = row.account?.subscription_status;
    const role = row.account?.role || (row.account?.plan === "premium" ? "premium" : "free");
    if (adminFilter === "premium") return role === "premium";
    if (adminFilter === "free") return role === "free";
    if (adminFilter === "admin") return row.account?.role === "admin";
    if (adminFilter === "attention") return ["past_due", "unpaid", "incomplete"].includes(status);
    if (adminFilter === "referrals") return (row.referral_count || 0) > 0 || !!row.account?.referred_by_user_id;
    return true;
  });
  const filterOptions = [["all", "Tous"], ["free", "Gratuits"], ["premium", "Premium"], ["admin", "Admins"], ["attention", "Paiement à vérifier"], ["referrals", "Parrainages"]];
  const summary = adminSummary;
  return `<div class="admin-hub">
    <div class="page-breadcrumb"><a href="#plus">Plus</a><span>›</span><span>Administration</span></div>
    <div class="page-head admin-page-head"><div><span class="eyebrow">ESPACE PRIVÉ · CRM</span><h2>Administration</h2><p>Suivez les comptes, les abonnements et les parrainages.</p></div><button class="sec sm" onclick="adminLoaded=false;adminLoad(${adminPage})" ${adminLoading ? "disabled" : ""}>↻ Actualiser</button></div>
    <nav class="admin-section-nav" aria-label="Rubriques d’administration"><button type="button" class="${adminSection === "overview" ? "active" : ""}" aria-current="${adminSection === "overview" ? "page" : "false"}" onclick="adminSetSection('overview')"><span>01</span>Vue d’ensemble</button><button type="button" class="${adminSection === "users" ? "active" : ""}" aria-current="${adminSection === "users" ? "page" : "false"}" onclick="adminSetSection('users')"><span>02</span>Comptes utilisateurs</button></nav>
    ${adminError ? `<div class="admin-error" role="alert">${esc(adminError)}<button class="sec sm" onclick="adminLoaded=false;adminLoad(${adminPage})">Réessayer</button></div>` : ""}
    ${adminSection === "overview" ? `
      <section class="admin-dashboard-intro"><span class="eyebrow">VUE D’ENSEMBLE</span><h3>État de votre service</h3><p>Les chiffres proviennent des données disponibles dans le CRM.</p></section>
      ${summary ? `<div class="grid admin-summary"><div class="kpi"><span>COMPTES INSCRITS</span><b>${summary.users}</b><small>nouveaux sur 30 j : ${summary.signups_30d || 0} · sur 7 j : ${summary.signups_7d || 0}</small></div><div class="kpi"><span>PREMIUM PAYÉS</span><b>${summary.premium_paid || 0}</b><small>accès Stripe actif</small></div><div class="kpi"><span>PREMIUM ATTRIBUÉS</span><b>${summary.premium_manual || 0}</b><small>rôle donné par un admin</small></div><div class="kpi"><span>PARRAINAGES EN ATTENTE</span><b>${summary.referrals_pending}</b><small>récompenses à appliquer</small></div><div class="kpi"><span>MOIS OFFERTS APPLIQUÉS</span><b>${summary.months_applied}</b><small>récompenses validées</small></div></div><section class="card admin-funnel"><div class="section-heading"><div><span class="eyebrow">PARCOURS PREMIUM · 30 JOURS</span><h3>Où en sont les utilisateurs ?</h3><small>Comptes ayant accepté les statistiques facultatives : ${summary.analytics_opt_in || 0}.</small></div><span class="tag">Données agrégées</span></div><div class="admin-funnel-steps"><div><span>01</span><b>${summary.funnel_users?.billing_views || 0}</b><small>ont consulté l’offre</small></div><i aria-hidden="true">→</i><div><span>02</span><b>${summary.funnel_users?.premium_intent || 0}</b><small>ont ouvert une offre ou une fonction verrouillée</small></div><i aria-hidden="true">→</i><div><span>03</span><b>${summary.funnel_users?.checkout_started || 0}</b><small>ont commencé le paiement</small></div></div><p class="admin-funnel-note">Ces chiffres n’incluent que les comptes ayant choisi d’activer le suivi d’usage. Ils ne contiennent aucune donnée de trajet ni de paiement.</p></section>` : adminLoading ? `<div class="admin-loading"><span class="admin-spinner"></span>Chargement des indicateurs…</div>` : ""}
      <div class="admin-shortcut-grid"><button type="button" class="admin-shortcut" onclick="adminSetSection('users')"><span class="admin-shortcut-icon">♙</span><span><b>Rechercher un utilisateur</b><small>Ouvrir la liste des comptes et consulter une fiche.</small></span><span class="tool-arrow">›</span></button><button type="button" class="admin-shortcut" onclick="adminSetFilter('premium')"><span class="admin-shortcut-icon">✦</span><span><b>Voir les abonnés Premium</b><small>Filtrer les comptes qui disposent de l’offre Premium.</small></span><span class="tool-arrow">›</span></button><button type="button" class="admin-shortcut" onclick="adminSetFilter('referrals')"><span class="admin-shortcut-icon">↗</span><span><b>Suivre les parrainages</b><small>Retrouver les comptes liés au programme de recommandation.</small></span><span class="tool-arrow">›</span></button></div>
      <div class="admin-info-note"><b>Gérer un paiement</b><span>Le CRM affiche le statut et les liens utiles. Les moyens de paiement, remboursements et factures Stripe se gèrent dans Stripe.</span></div>
      <div class="admin-info-note"><b>Rôles et accès</b><span>Dans la fiche de chaque compte, attribuez Gratuit, Premium manuel ou Admin. Les paiements Stripe restent séparés : changer un rôle ne résilie jamais un abonnement Stripe actif.</span></div>
    ` : `<section class="card admin-users">
      <div class="admin-users-head"><div><span class="eyebrow">COMPTES · PAGE ${adminPage}</span><h3>Comptes utilisateurs</h3><p>Ouvrez un compte pour voir les informations disponibles et les actions associées.</p><small>${adminRows.length} comptes chargés sur cette page.</small></div><label class="admin-search"><span>⌕</span><input id="admin-user-search" type="search" value="${esc(adminSearch)}" aria-label="Rechercher un compte sur cette page" placeholder="E-mail ou code sur cette page" oninput="adminSetSearch(this.value)"></label></div>
      <div class="admin-filters" role="group" aria-label="Filtrer les comptes">${filterOptions.map(([key, label]) => `<button type="button" class="admin-filter ${adminFilter === key ? "active" : ""}" aria-pressed="${adminFilter === key}" onclick="adminSetFilter('${key}')">${label}</button>`).join("")}</div>
      ${adminLoading && !adminLoaded ? `<div class="admin-loading"><span class="admin-spinner"></span>Chargement des comptes…</div>` : `<div class="admin-user-list">${filtered.map(row => { const role = row.account?.role || (row.account?.plan === "premium" ? "premium" : "free"); return `<button type="button" class="admin-user-card" onclick="adminOpenUser('${esc(row.id)}')"><span class="admin-user-avatar" aria-hidden="true">${esc((row.email || "?").trim().charAt(0).toLocaleUpperCase("fr-FR"))}</span><span class="admin-user-main"><b>${esc(row.email || "E-mail absent")}</b><small>Inscrit le ${adminDate(row.created_at)} · Dernière connexion ${adminDateTime(row.last_sign_in_at)}</small><small>Code : ${esc(row.account?.referral_code || "aucun")} · ${row.referral_count || 0} filleul${(row.referral_count || 0) === 1 ? "" : "s"}</small></span><span class="admin-user-tags"><span class="tag ${role === "premium" || role === "admin" ? "p" : ""}">${adminPlanLabel(row.account)}<small>${row.account?.role_source === "manual" ? "Accès manuel" : esc(adminStatusLabel(row.account?.subscription_status))}</small></span><span class="admin-consent-tag">Statistiques ${row.account?.analytics_consent ? "activées" : "désactivées"}</span></span><span class="admin-user-arrow" aria-hidden="true">›</span></button>`; }).join("") || `<div class="empty admin-empty"><b>Aucun compte dans ce filtre</b><span>Essayez un autre filtre ou modifiez la recherche.</span></div>`}</div>`}
      <div class="admin-pagination"><button class="sec sm" onclick="adminLoad(${Math.max(1, adminPage - 1)})" ${adminPage <= 1 || adminLoading ? "disabled" : ""}>← Précédent</button><span>Page ${adminPage}</span><button class="sec sm" onclick="adminLoad(${adminPage + 1})" ${adminRows.length < 50 || adminLoading ? "disabled" : ""}>Suivant →</button></div>
    </section>`}
    <p class="admin-footnote">Les indicateurs de conversion et le journal d’usage ne couvrent que les personnes ayant activé les statistiques facultatives. Le CRM ne contient ni trajets ni coordonnées de paiement.</p>
  </div>`;
}
views.admin = () => adminPageHTML();

if (typeof sb !== "undefined" && sb) {
  sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => {
      if (session?.user) adminCheckAccess();
      else { adminAccess = false; adminLoaded = false; adminDetail = null; adminDetailId = ""; }
    }, 0);
  });
}
