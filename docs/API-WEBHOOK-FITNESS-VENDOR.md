# Documentation API Webhook — My Coach Ginkgo

**Suivi Commerciaux — Intégration Fitness Vendor**

> Ce document décrit comment envoyer automatiquement les ventes saisies dans Fitness Vendor
> vers l'application de suivi commerciaux My Coach Ginkgo.

---

## Informations de connexion

| Paramètre | Valeur |
|-----------|--------|
| **URL de base** | `https://VOTRE_DOMAINE` *(à remplacer après déploiement)* |
| **Authentification** | Bearer Token via header `Authorization` |
| **Format** | JSON (`Content-Type: application/json`) |

### Header d'authentification (obligatoire sur tous les appels)

```
Authorization: Bearer wh_mycoachginkgo_2026_secret_key
Content-Type: application/json
```

---

## 1. Créer une vente

**`POST /api/webhook/sales`**

Envoie une vente unique vers le suivi commerciaux. A appeler chaque fois qu'un commercial saisit une vente dans Fitness Vendor.

### Corps de la requête (JSON)

```json
{
  "date": "2026-03-03",
  "amount": 1500,
  "client_first_name": "Jean",
  "client_last_name": "Dupont",
  "commercial_name": "Marvin",
  "rib_status": "En attente"
}
```

### Champs

| Champ | Type | Obligatoire | Description |
|-------|------|:-----------:|-------------|
| `date` | string | **Oui** | Date de la vente, format `YYYY-MM-DD` |
| `amount` | number | **Oui** | Montant de la vente en euros (nombre positif) |
| `client_first_name` | string | Non | Prénom du client |
| `client_last_name` | string | Non | Nom du client |
| `commercial_name` | string | **Oui*** | Nom du commercial (insensible à la casse) |
| `external_id` | string | **Oui*** | Identifiant externe du commercial |
| `sales_rep_id` | number | **Oui*** | ID interne du commercial |
| `rib_status` | string | Non | Statut du RIB : `"Reçu"`, `"En attente"` ou `"Non fourni"` (défaut) |

> **\*** Au moins **un** de ces trois champs est requis pour identifier le commercial :
> `commercial_name`, `external_id` ou `sales_rep_id`.
> Nous recommandons `commercial_name` pour la simplicité.

### Réponse succès — `201 Created`

```json
{
  "success": true,
  "id": 42,
  "week_start": "2026-03-02",
  "sales_rep_id": 1,
  "rib_status": "En attente"
}
```

### Erreurs possibles

| Code | Signification | Exemple |
|------|--------------|---------|
| `400` | Champs invalides ou manquants | `{ "error": "Validation échouée", "details": ["date est requis"] }` |
| `401` | Clé API manquante ou invalide | `{ "error": "Non autorisé : clé API manquante ou invalide" }` |
| `403` | Semaine verrouillée (saisie fermée) | `{ "error": "Semaine verrouillée", "week_start": "2026-03-02" }` |

---

## 2. Créer plusieurs ventes en une fois

**`POST /api/webhook/sales/bulk`**

Envoie un lot de ventes (maximum 100 par requête).

### Corps de la requête

```json
{
  "sales": [
    {
      "date": "2026-03-03",
      "amount": 1500,
      "client_first_name": "Jean",
      "client_last_name": "Dupont",
      "commercial_name": "Marvin",
      "rib_status": "Reçu"
    },
    {
      "date": "2026-03-03",
      "amount": 800,
      "client_first_name": "Marie",
      "client_last_name": "Martin",
      "commercial_name": "Magali"
    }
  ]
}
```

### Réponse — `201 Created`

```json
{
  "total": 2,
  "success": 2,
  "failed": 0,
  "results": [
    { "index": 0, "success": true, "id": 43, "week_start": "2026-03-02" },
    { "index": 1, "success": true, "id": 44, "week_start": "2026-03-02" }
  ]
}
```

> Si certaines ventes échouent, les autres sont quand même insérées.
> Le champ `results` détaille le statut de chaque vente.

---

## 3. Lister les commerciaux

**`GET /api/webhook/sales-reps`**

Retourne la liste des commerciaux avec leurs identifiants.

### Réponse — `200 OK`

```json
[
  { "id": 1, "name": "Marvin", "external_id": null },
  { "id": 2, "name": "Magali", "external_id": null },
  { "id": 3, "name": "Fabian", "external_id": null }
]
```

> Utile pour vérifier les noms exacts ou récupérer les IDs.

---

## 4. Assigner un identifiant externe à un commercial

**`PUT /api/webhook/sales-reps/:id`**

Permet d'associer un identifiant Fitness Vendor à un commercial.

### Corps de la requête

```json
{
  "external_id": "FV-001-MARVIN"
}
```

### Réponse — `200 OK`

```json
{
  "success": true,
  "id": 1,
  "external_id": "FV-001-MARVIN"
}
```

---

## Mapping des champs Fitness Vendor → Webhook

Voici la correspondance entre les champs de Fitness Vendor et ceux de notre API :

| Champ Fitness Vendor | Champ Webhook | Notes |
|---------------------|---------------|-------|
| Prénom du prospect/client | `client_first_name` | |
| Nom du prospect/client | `client_last_name` | |
| Montant de la vente | `amount` | Nombre, en euros |
| Date de la vente | `date` | Format `YYYY-MM-DD` obligatoire |
| Nom du commercial | `commercial_name` | Doit correspondre exactement : `Marvin`, `Magali` ou `Fabian` |
| Statut RIB | `rib_status` | `"Reçu"`, `"En attente"` ou `"Non fourni"` |

---

## Configuration dans Bubble.io (Fitness Vendor)

### Etape 1 — Installer le plugin API Connector

Dans l'éditeur Bubble de Fitness Vendor :
1. Aller dans **Plugins** > **Add plugins**
2. Chercher et installer **API Connector**

### Etape 2 — Configurer l'appel API

Dans le plugin API Connector :
1. Cliquer **Add another API**
2. Nom : `MyCoachGinkgo`
3. Authentication : **Private key in header**
   - Key name : `Authorization`
   - Key value : `Bearer wh_mycoachginkgo_2026_secret_key`

### Etape 3 — Ajouter l'appel "Créer une vente"

1. Cliquer **Add another call**
2. Nom : `Envoyer Vente`
3. Méthode : **POST**
4. URL : `https://VOTRE_DOMAINE/api/webhook/sales`
5. Headers :
   - `Content-Type` : `application/json`
6. Body (JSON) :
```json
{
  "date": "<date_de_la_vente>",
  "amount": <montant>,
  "client_first_name": "<prenom_client>",
  "client_last_name": "<nom_client>",
  "commercial_name": "<nom_du_commercial>",
  "rib_status": "<statut_rib>"
}
```
7. Remplacer les valeurs entre `< >` par des champs dynamiques Bubble

### Etape 4 — Déclencher l'appel sur création de vente

Dans le Workflow Bubble :
1. Event : **When a new sale is created** (ou l'événement correspondant)
2. Action : **Plugins > MyCoachGinkgo - Envoyer Vente**
3. Mapper les champs dynamiques de la vente vers les paramètres de l'appel

---

## Commerciaux enregistrés

Les noms doivent correspondre exactement (insensible à la casse) :

| ID | Nom | Identifiant pour `commercial_name` |
|----|-----|-------------------------------------|
| 1 | Marvin | `"Marvin"` |
| 2 | Magali | `"Magali"` |
| 3 | Fabian | `"Fabian"` |

---

## Valeurs du Statut RIB

| Valeur | Description |
|--------|-------------|
| `"Non fourni"` | RIB non encore demandé (valeur par défaut si omis) |
| `"En attente"` | RIB demandé, pas encore reçu |
| `"Reçu"` | RIB reçu et validé |

---

## Exemples de test avec cURL

### Tester la création d'une vente

```bash
curl -X POST https://VOTRE_DOMAINE/api/webhook/sales \
  -H "Authorization: Bearer wh_mycoachginkgo_2026_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-03-03",
    "amount": 1500,
    "client_first_name": "Jean",
    "client_last_name": "Dupont",
    "commercial_name": "Marvin",
    "rib_status": "En attente"
  }'
```

Réponse attendue :
```json
{
  "success": true,
  "id": 42,
  "week_start": "2026-03-02",
  "sales_rep_id": 1,
  "rib_status": "En attente"
}
```

### Tester l'authentification (doit retourner 401)

```bash
curl -X POST https://VOTRE_DOMAINE/api/webhook/sales \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-03-03","amount":100,"commercial_name":"Marvin"}'
```

Réponse attendue :
```json
{
  "error": "Non autorisé : clé API manquante ou invalide"
}
```

### Lister les commerciaux

```bash
curl -X GET https://VOTRE_DOMAINE/api/webhook/sales-reps \
  -H "Authorization: Bearer wh_mycoachginkgo_2026_secret_key"
```

---

## Codes de réponse

| Code HTTP | Signification |
|-----------|--------------|
| `200` | Requête réussie (GET, PUT) |
| `201` | Vente(s) créée(s) avec succès |
| `400` | Erreur de validation (champs manquants ou format invalide) |
| `401` | Authentification échouée (clé API invalide ou manquante) |
| `403` | Semaine verrouillée — la saisie est fermée pour cette semaine |
| `404` | Commercial non trouvé |
| `409` | Conflit — l'external_id est déjà utilisé par un autre commercial |

---

## Contact technique

Pour toute question sur l'intégration :
- Application : **Suivi Commerciaux — My Coach Ginkgo**
- Format d'échange : **JSON via HTTPS**
- Authentification : **Bearer Token**

---

*Document généré le 3 mars 2026*
