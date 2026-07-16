#!/bin/bash
# Bout-en-bout des PHOTOS communautaires, a rejouer sur un serveur de test :
#   DB_DIR=/tmp/x PORT=3999 NUTRITION_AI=off node server.js &
#   bash nutrition-app/test/e2e/photos-communaute.sh
# Ce que les tests unitaires ne peuvent pas prouver : le cloisonnement par groupe et
# les droits de suppression passent par de VRAIES sessions HTTP (3 comptes, 2 groupes).
# /!\ Le n0 de challenge se passe en camelCase (challengeNo) : en snake_case il vaut 0,
#     le client tombe dans le groupe « sans groupe » et le cloisonnement SEMBLE fuiter
#     alors que c est le harnais qui est faux.
# Bout-en-bout RÉEL des photos communautaires : 2 clients, 2 groupes différents.
# Prouve : post photo, cloisonnement par groupe, rejets, droits de suppression.
set -u
B="http://localhost:3999"
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null || echo "PARSE_ERR"; }

# --- Admin ---
ADMIN=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"pin":"ginkgo"}' | j "d.get('token','')")
echo "admin token: ${ADMIN:0:8}…"

# --- Deux groupes ---
C1=$(curl -s -X POST "$B/nutrition/api/coach/access-codes" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"ville":"Lyon","challengeNo":1}' | j "d.get('code','')")
C2=$(curl -s -X POST "$B/nutrition/api/coach/access-codes" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"ville":"Paris","challengeNo":1}' | j "d.get('code','')")
echo "code Lyon=$C1  code Paris=$C2"

# --- Trois clients : Alice+Bob à Lyon, Carole à Paris ---
login() { curl -s -X POST "$B/nutrition/account/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"prenom\":\"$2\",\"nom\":\"T\",\"pin\":\"1234\",\"code\":\"$3\"}" | j "d.get('token','')"; }
A=$(login "alice@t.fr" "Alice" "$C1")
BOB=$(login "bob@t.fr" "Bob" "$C1")
CAR=$(login "carole@t.fr" "Carole" "$C2")
echo "alice=${A:0:6}… bob=${BOB:0:6}… carole=${CAR:0:6}…"

# 1x1 px JPEG valide (base64)
PX="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="

echo
echo "=== 1) Alice poste une PHOTO SEULE (sans texte) ==="
curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d "{\"message\":\"\",\"kind\":\"partage\",\"photo\":\"$PX\"}" | j "'ok=%s photoId=%s' % (d.get('ok'), (d.get('message') or {}).get('photoId'))"

echo "=== 2) Alice poste TEXTE + PHOTO ==="
PID=$(curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d "{\"message\":\"Mon assiette du jour\",\"kind\":\"partage\",\"photo\":\"$PX\"}" | j "(d.get('message') or {}).get('photoId')")
echo "post texte+photo id=$PID"

echo "=== 3) Rejets ==="
echo -n "  post vide (ni texte ni photo) -> "
curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"message":"","kind":"partage"}' | j "d.get('error')"
echo -n "  mauvais format (gif)          -> "
curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"message":"x","photo":"data:image/gif;base64,R0lGODlhAQABAAAAACw="}' | j "d.get('error')"
echo -n "  faux dataURL (script)         -> "
curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"message":"x","photo":"javascript:alert(1)"}' | j "d.get('error')"
echo -n "  photo trop lourde (>3Mo)      -> "
python3 -c "
import json,urllib.request
big = 'data:image/jpeg;base64,' + 'A'*4_500_000
req = urllib.request.Request('$B/nutrition/api/community/messages', method='POST',
  data=json.dumps({'message':'x','photo':big}).encode(),
  headers={'Content-Type':'application/json','Authorization':'Bearer $A'})
try:
  print(json.load(urllib.request.urlopen(req)).get('error'))
except urllib.error.HTTPError as e:
  print(json.load(e).get('error'))
"

echo
echo "=== 4) La photo est servie à un membre du MÊME groupe (Bob, Lyon) ==="
echo -n "  Bob lit la photo d'Alice -> HTTP "
curl -s -o /dev/null -w "%{http_code} type=%{content_type}\n" "$B/nutrition/api/community/photo/$PID" -H "Authorization: Bearer $BOB"

echo "=== 5) Cloisonnement : Carole (Paris) ne doit PAS voir la photo de Lyon ==="
echo -n "  Carole lit la photo d'Alice -> HTTP "
curl -s -o /dev/null -w "%{http_code}\n" "$B/nutrition/api/community/photo/$PID" -H "Authorization: Bearer $CAR"
echo -n "  Sans authentification       -> HTTP "
curl -s -o /dev/null -w "%{http_code}\n" "$B/nutrition/api/community/photo/$PID"

echo
echo "=== 6) Le fil expose photoId (Bob, même groupe) ==="
curl -s "$B/nutrition/api/community/feed?limit=10" -H "Authorization: Bearer $BOB" | j "'posts avec photo: %s' % [ (i['id'], i.get('photoId'), i.get('text')) for i in d['items'] if i.get('photoId') ]"

echo
echo "=== 7) Suppression : Bob NE PEUT PAS supprimer le post d'Alice ==="
echo -n "  Bob supprime le post d'Alice -> "
curl -s -X DELETE "$B/nutrition/api/community/messages/$PID" -H "Authorization: Bearer $BOB" | j "d.get('error') or d"
echo -n "  la photo existe toujours ?   -> HTTP "
curl -s -o /dev/null -w "%{http_code}\n" "$B/nutrition/api/community/photo/$PID" -H "Authorization: Bearer $A"

echo "=== 8) Alice supprime SON post ==="
echo -n "  Alice supprime -> "
curl -s -X DELETE "$B/nutrition/api/community/messages/$PID" -H "Authorization: Bearer $A" | j "d"
echo -n "  la photo a disparu ? -> HTTP "
curl -s -o /dev/null -w "%{http_code}\n" "$B/nutrition/api/community/photo/$PID" -H "Authorization: Bearer $A"

echo "=== 9) Le coach/admin peut modérer n'importe quel post ==="
PID2=$(curl -s -X POST "$B/nutrition/api/community/messages" -H "Authorization: Bearer $BOB" -H 'Content-Type: application/json' -d "{\"message\":\"post de Bob\",\"kind\":\"partage\",\"photo\":\"$PX\"}" | j "(d.get('message') or {}).get('photoId')")
echo -n "  admin supprime le post de Bob -> "
curl -s -X DELETE "$B/nutrition/api/community/messages/$PID2" -H "Authorization: Bearer $ADMIN" | j "d"
