#!/bin/bash
# Étape 13 en conditions réelles : c'est le POST PHOTO qui la valide, pas l'ouverture,
# pas un post texte. On pose la progression 0..12 en base, puis on teste le vrai HTTP.
set -u
B="http://localhost:3999"
DB="$TDB/data.db"
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null || echo "PARSE_ERR"; }

ADMIN=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"pin":"ginkgo"}' | j "d.get('token','')")
CODE=$(curl -s -X POST "$B/nutrition/api/coach/access-codes" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"ville":"Lyon","challengeNo":1,"startDate":"2026-06-01"}' | j "d.get('code','')")
TOK=$(curl -s -X POST "$B/nutrition/account/login" -H 'Content-Type: application/json' -d "{\"email\":\"dave@t.fr\",\"prenom\":\"Dave\",\"nom\":\"T\",\"pin\":\"1234\",\"code\":\"$CODE\"}" | j "d.get('token','')")
curl -s -X POST "$B/nutrition/api/challenge/flag" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"enabled":true}' > /dev/null
echo "client Dave: ${TOK:0:8}…  code=$CODE"

# Progression 0..12 posée directement : on veut tester l'étape 13, pas les 13 d'avant.
node "$(dirname "$0")/seed13.js" "$DB"

etape() { curl -s "$B/nutrition/api/challenge/state" -H "Authorization: Bearer $TOK" | j "d['state']['activeDay']"; }
statut13() { curl -s "$B/nutrition/api/challenge/state" -H "Authorization: Bearer $TOK" | j "[n['status'] for n in d['state']['nodes'] if n['day']==13][0]"; }
punch() { curl -s "$B/nutrition/api/challenge/state" -H "Authorization: Bearer $TOK" | j "d['state']['stats']['punch']"; }

PX="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="

echo
echo "étape active = $(etape) (attendu 13) · statut 13 = $(statut13) · punch = $(punch)"

echo
echo "=== 1) Ouvrir la communauté (lire le fil) ne valide RIEN ==="
curl -s "$B/nutrition/api/community/feed?limit=5" -H "Authorization: Bearer $TOK" > /dev/null
echo "  étape active après lecture : $(etape) (doit rester 13) · statut 13 = $(statut13)"

echo "=== 2) Un post TEXTE ne valide PAS l'étape 13 ==="
curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"message":"coucou le groupe","kind":"partage"}' > /dev/null
echo "  étape active après post texte : $(etape) (doit rester 13) · statut 13 = $(statut13)"

echo "=== 3) Un post PHOTO valide l'étape 13 ==="
P1=$(punch)
curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"message\":\"Mon assiette du jour 🍽️\",\"kind\":\"partage\",\"photo\":\"$PX\"}" > /dev/null
echo "  étape active après post photo : $(etape) (attendu 14) · statut 13 = $(statut13)"
echo "  punch : $P1 -> $(punch) (attendu +20)"

echo "=== 4) Re-poster une photo ne double pas la validation ==="
P2=$(punch)
curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"message\":\"encore\",\"kind\":\"partage\",\"photo\":\"$PX\"}" > /dev/null
echo "  punch : $P2 -> $(punch) (doit être identique) · étape active = $(etape)"
