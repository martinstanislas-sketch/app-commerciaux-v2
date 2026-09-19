'use strict';
// ============================================================================
//  RECAP 2 — « RÉFÉRENTIEL DES REMARQUES AUTOMATIQUES » (administrateur,
//  LECTURE SEULE).
//
//  GÉNÉRÉ depuis le registre que le moteur utilise (public/recap2-regles.js,
//  Recap2Regles.REGLES) : ce n'est pas une documentation séparée, il ne peut
//  pas diverger du code. Aucun appel serveur, aucune écriture.
//
//  Filtres : catégorie, statut produit, destinataire, nature.
//  Module UMD : `lignes()` et `filtrer()` sont testés sous Node.
// ============================================================================

(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./recap2-regles.js'));
  else racine.Recap2Referentiel = fabrique(racine.Recap2Regles);
}(typeof self !== 'undefined' ? self : this, function (Regles) {
  const NATURES = { action: 'Action au conseiller', alerte: 'Alerte administrateur', silence: 'Silence imposé' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Une ligne par règle, dans l'ordre de priorité puis du registre.
  function lignes() {
    return Regles.REGLES.map((r, i) => ({
      id: r.id, categorie: r.categorie, nature: r.nature, natureLibelle: NATURES[r.nature] || r.nature,
      destinataire: r.destinataire, statut: r.statut, niveau: r.niveau, niveauLibelle: Regles.NIVEAUX[r.niveau],
      declenchement: r.declenchement,
      texte: r.nature === 'action' ? Regles.enAction(r.texte) : (r.texte || '— aucune remarque —'),
      disparition: r.disparition, masquePar: (r.masquePar || []).join(', ') || '—',
      copieClub: !!r.copieClub, copieCommercial: !!r.copieCommercial, modifiable: !!r.modifiable, ordre: i,
    })).sort((a, b) => a.niveau - b.niveau || a.ordre - b.ordre);
  }
  function filtrer(ls, f) {
    const x = f || {};
    return ls.filter((l) => (!x.categorie || l.categorie === x.categorie) && (!x.statut || l.statut === x.statut)
      && (!x.destinataire || l.destinataire === x.destinataire) && (!x.nature || l.nature === x.nature));
  }
  const valeurs = (ls, k) => [...new Set(ls.map((l) => l[k]))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  const oui = (b) => (b ? 'Oui' : 'Non');

  function html(ls, f) {
    const tout = lignes();
    const sel = (id, k, titre) => '<label class="rec2-ref-f" for="' + id + '">' + titre
      + '<select id="' + id + '" data-ref-filtre="' + k + '"><option value="">Tous</option>'
      + valeurs(tout, k).map((v) => '<option value="' + esc(v) + '"' + ((f || {})[k] === v ? ' selected' : '') + '>' + esc(k === 'nature' ? NATURES[v] : v) + '</option>').join('')
      + '</select></label>';
    const corps = ls.map((l) => '<tr class="is-' + l.nature + '"><td class="rec2-ref-id">' + esc(l.id) + '</td><td>' + esc(l.categorie) + '</td>'
      + '<td>' + esc(l.natureLibelle) + '<br><span class="rec2-det-date">' + esc(l.destinataire) + '</span></td>'
      + '<td>' + esc(l.statut) + '</td><td>' + esc(l.declenchement) + '</td><td class="rec2-ref-texte">' + esc(l.texte) + '</td>'
      + '<td>' + esc(l.disparition) + '</td><td>' + l.niveau + ' — ' + esc(l.niveauLibelle) + '</td><td>' + esc(l.masquePar) + '</td>'
      + '<td>' + oui(l.copieClub) + '</td><td>' + oui(l.copieCommercial) + '</td><td>' + oui(l.modifiable) + '</td></tr>').join('');
    return '<div class="rec2-ref-tete"><h3>Référentiel des remarques automatiques</h3>'
      + '<p class="rec2-det-note">Lecture seule. Généré depuis le registre du moteur (public/recap2-regles.js) : ce que vous lisez est exactement ce qu’appliquent l’écran et les copies. '
      + 'Priorité : ' + Object.keys(Regles.NIVEAUX).map((k) => k + '. ' + Regles.NIVEAUX[k]).join(' · ') + '.</p>'
      + '<div class="rec2-ref-filtres">' + sel('rec2-ref-cat', 'categorie', 'Catégorie') + sel('rec2-ref-statut', 'statut', 'Statut')
      + sel('rec2-ref-dest', 'destinataire', 'Destinataire') + sel('rec2-ref-nat', 'nature', 'Nature')
      + '<span class="rec2-det-date" role="status">' + ls.length + ' règle(s) sur ' + tout.length + '</span></div></div>'
      + '<div class="rec2-ref-scroll"><table class="rec2-table rec2-ref-table"><thead><tr><th>Identifiant</th><th>Catégorie</th><th>Nature · destinataire</th><th>Statut produit</th>'
      + '<th>Condition de déclenchement</th><th>Texte exact</th><th>Condition de disparition</th><th>Priorité</th><th>Peut être masquée par</th>'
      + '<th>Copie club</th><th>Copie commercial</th><th>Modifiable</th></tr></thead><tbody>' + corps + '</tbody></table></div>';
  }

  // Monte le référentiel dans `hote` et gère ses filtres (état local).
  function monter(hote) {
    if (!hote) return;
    if (!hote._rec2Ref) {
      hote._rec2Ref = { filtres: {} };
      hote.addEventListener('change', (e) => {
        const s = e.target.closest && e.target.closest('select[data-ref-filtre]');
        if (!s) return;
        hote._rec2Ref.filtres[s.dataset.refFiltre] = s.value;
        hote.innerHTML = html(filtrer(lignes(), hote._rec2Ref.filtres), hote._rec2Ref.filtres);
      });
    }
    hote.innerHTML = html(filtrer(lignes(), hote._rec2Ref.filtres), hote._rec2Ref.filtres);
  }

  return { lignes, filtrer, html, monter, NATURES };
}));
