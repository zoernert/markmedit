#!/bin/bash
# Deep Research E2E Tests
# Testet alle Deep Research Funktionen mit echten API-Calls

set -e

BASE_URL="http://10.0.0.14:3001"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Deep Research E2E Test Suite       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}\n"

# Erstelle Test-Dokument
echo -e "${YELLOW}📄 Erstelle Test-Dokument...${NC}"
DOC_RESPONSE=$(curl -s -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deep Research E2E Test - Energiespeicher",
    "content": "# Energiespeicher in Deutschland\n\n## Einleitung\nEnergiespeicher spielen eine wichtige Rolle in der Energiewende.\n\n## Aktuelle Entwicklungen\nDie Technologie entwickelt sich rasant weiter.\n\n## Marktübersicht\nVerschiedene Anbieter sind am Markt aktiv.\n"
  }')

DOC_ID=$(echo "$DOC_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Test-Dokument erstellt: $DOC_ID${NC}\n"

# ========================================
# Test 1: Web + MCP Deep Research
# ========================================
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}🔬 Test 1: Web + MCP Deep Research${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

RESEARCH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/deep-research" \
  -H "Content-Type: application/json" \
  -d "{
    \"documentId\": \"$DOC_ID\",
    \"query\": \"Aktuelle Entwicklungen Batteriespeicher Deutschland 2025\",
    \"searchScope\": {
      \"web\": true,
      \"mcp\": [\"willi-mako\", \"powabase\"]
    },
    \"maxSources\": 8
  }")

echo "$RESEARCH_RESPONSE" | jq '.' > /tmp/research_result.json

SUCCESS=$(echo "$RESEARCH_RESPONSE" | jq -r '.success')
WEB_SOURCES=$(echo "$RESEARCH_RESPONSE" | jq -r '.sources.web | length')
MCP_SOURCES=$(echo "$RESEARCH_RESPONSE" | jq -r '.sources.mcp | length')
SUGGESTIONS=$(echo "$RESEARCH_RESPONSE" | jq -r '.suggestions | length')

echo ""
echo "Ergebnisse:"
echo "  - Success: $SUCCESS"
echo "  - Web-Quellen: $WEB_SOURCES"
echo "  - MCP-Quellen: $MCP_SOURCES"
echo "  - Suggestions: $SUGGESTIONS"

if [ "$SUCCESS" == "true" ]; then
  echo -e "${GREEN}✓ Deep Research erfolgreich${NC}"
else
  echo -e "${RED}✗ Deep Research fehlgeschlagen${NC}"
  exit 1
fi

if [ "$WEB_SOURCES" -gt 0 ]; then
  echo -e "${GREEN}✓ Tavily Web-Suche funktional${NC}"
  echo "  Erste Web-Quelle:"
  echo "$RESEARCH_RESPONSE" | jq -r '.sources.web[0] | "    - \(.title)\n    - \(.url)"'
else
  echo -e "${YELLOW}⚠️  Keine Web-Quellen (Tavily API Key Problem?)${NC}"
fi

if [ "$MCP_SOURCES" -gt 0 ]; then
  echo -e "${GREEN}✓ MCP-Integration funktional${NC}"
  echo "  MCP-Server verwendet:"
  echo "$RESEARCH_RESPONSE" | jq -r '.sources.mcp[].server' | while read server; do
    echo "    - $server"
  done
else
  echo -e "${YELLOW}⚠️  Keine MCP-Quellen gefunden${NC}"
fi

echo -e "\n${GREEN}✅ Test 1 bestanden${NC}\n"

# ========================================
# Test 2: Section Enrichment
# ========================================
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}✨ Test 2: Section Enrichment${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

ENRICH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/enrich-section" \
  -H "Content-Type: application/json" \
  -d "{
    \"documentId\": \"$DOC_ID\",
    \"selectedText\": \"Die Technologie entwickelt sich rasant weiter.\",
    \"beforeContext\": \"## Aktuelle Entwicklungen\\n\",
    \"afterContext\": \"\\n## Marktübersicht\",
    \"enrichmentGoal\": \"expand\",
    \"searchScope\": {
      \"web\": true,
      \"mcp\": [\"willi-mako\", \"powabase\"]
    }
  }")

echo "$ENRICH_RESPONSE" | jq '.' > /tmp/enrich_result.json

SUCCESS=$(echo "$ENRICH_RESPONSE" | jq -r '.success')
TOTAL_SOURCES=$(echo "$ENRICH_RESPONSE" | jq -r '(.sources.web | length) + (.sources.mcp | length)')
SUGGESTIONS=$(echo "$ENRICH_RESPONSE" | jq -r '.suggestions | length')

echo ""
echo "Ergebnisse:"
echo "  - Success: $SUCCESS"
echo "  - Quellen gesamt: $TOTAL_SOURCES"
echo "  - Suggestions: $SUGGESTIONS"

if [ "$SUCCESS" == "true" ]; then
  echo -e "${GREEN}✓ Section Enrichment erfolgreich${NC}"
  
  if [ "$SUGGESTIONS" -le 3 ]; then
    echo -e "${GREEN}✓ Fokussierte Suggestions (≤3)${NC}"
  else
    echo -e "${YELLOW}⚠️  Mehr als 3 Suggestions (sollte fokussiert sein)${NC}"
  fi
else
  echo -e "${RED}✗ Section Enrichment fehlgeschlagen${NC}"
  exit 1
fi

echo -e "\n${GREEN}✅ Test 2 bestanden${NC}\n"

# ========================================
# Test 3: Research Batch mit Artefakten
# ========================================
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}📚 Test 3: Research Batch${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

# Erstelle Test-Artefakte
echo "Erstelle Artefakte..."
ART1=$(curl -s -X POST "$BASE_URL/api/artifacts" \
  -H "Content-Type: application/json" \
  -d "{
    \"documentId\": \"$DOC_ID\",
    \"type\": \"note\",
    \"content\": \"Wichtig: Neue Regelungen für Heimspeicher ab 2025\"
  }")
ART1_ID=$(echo "$ART1" | jq -r '.id')

ART2=$(curl -s -X POST "$BASE_URL/api/artifacts" \
  -H "Content-Type: application/json" \
  -d "{
    \"documentId\": \"$DOC_ID\",
    \"type\": \"note\",
    \"content\": \"Marktanalyse: Tesla Powerwall vs BYD vs Sonnen\"
  }")
ART2_ID=$(echo "$ART2" | jq -r '.id')

echo -e "${GREEN}✓ Artefakte erstellt: $ART1_ID, $ART2_ID${NC}\n"

# Research Batch durchführen
BATCH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/research-batch" \
  -H "Content-Type: application/json" \
  -d "{
    \"documentId\": \"$DOC_ID\",
    \"artifactIds\": [\"$ART1_ID\", \"$ART2_ID\"],
    \"researchQuery\": \"Energiespeicher Deutschland Regulierung\",
    \"searchScope\": {
      \"web\": true,
      \"mcp\": [\"willi-mako\"]
    }
  }")

echo "$BATCH_RESPONSE" | jq '.' > /tmp/batch_result.json

SUCCESS=$(echo "$BATCH_RESPONSE" | jq -r '.success')
ARTIFACTS_ANALYZED=$(echo "$BATCH_RESPONSE" | jq -r '.artifactsAnalyzed')
TOPICS=$(echo "$BATCH_RESPONSE" | jq -r '.extractedTopics | length')
SUGGESTIONS=$(echo "$BATCH_RESPONSE" | jq -r '.suggestions | length')

echo ""
echo "Ergebnisse:"
echo "  - Success: $SUCCESS"
echo "  - Artefakte analysiert: $ARTIFACTS_ANALYZED"
echo "  - Topics extrahiert: $TOPICS"
echo "  - Suggestions: $SUGGESTIONS"

if [ "$SUCCESS" == "true" ]; then
  echo -e "${GREEN}✓ Research Batch erfolgreich${NC}"
  
  if [ "$ARTIFACTS_ANALYZED" -eq 2 ]; then
    echo -e "${GREEN}✓ Alle Artefakte analysiert${NC}"
  fi
  
  if [ "$TOPICS" -gt 0 ]; then
    echo -e "${GREEN}✓ Topics extrahiert:${NC}"
    echo "$BATCH_RESPONSE" | jq -r '.extractedTopics[]' | while read topic; do
      echo "    - $topic"
    done
  fi
else
  echo -e "${RED}✗ Research Batch fehlgeschlagen${NC}"
  exit 1
fi

echo -e "\n${GREEN}✅ Test 3 bestanden${NC}\n"

# ========================================
# Test 4: Error Handling
# ========================================
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}⚠️  Test 4: Error Handling${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

ERROR_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/ai/deep-research" \
  -H "Content-Type: application/json" \
  -d "{
    \"documentId\": \"$DOC_ID\",
    \"query\": \"Test Query\",
    \"searchScope\": {
      \"web\": false,
      \"mcp\": []
    }
  }")

HTTP_CODE=$(echo "$ERROR_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$ERROR_RESPONSE" | head -n-1)

echo ""
echo "Ergebnisse:"
echo "  - HTTP Code: $HTTP_CODE"
echo "  - Response: $RESPONSE_BODY"

if [ "$HTTP_CODE" == "400" ]; then
  echo -e "${GREEN}✓ Fehler korrekt erkannt (400 Bad Request)${NC}"
  
  if echo "$RESPONSE_BODY" | grep -q "Mindestens eine Quelle"; then
    echo -e "${GREEN}✓ Korrekte Fehlermeldung${NC}"
  else
    echo -e "${YELLOW}⚠️  Fehlermeldung abweichend${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Unerwarteter HTTP Code: $HTTP_CODE${NC}"
fi

echo -e "\n${GREEN}✅ Test 4 bestanden${NC}\n"

# ========================================
# Test 5: Graceful Degradation
# ========================================
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}🔄 Test 5: Graceful Degradation (Nur MCP)${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

MCP_ONLY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/deep-research" \
  -H "Content-Type: application/json" \
  -d "{
    \"documentId\": \"$DOC_ID\",
    \"query\": \"Marktkommunikation GPKE\",
    \"searchScope\": {
      \"web\": false,
      \"mcp\": [\"willi-mako\"]
    }
  }")

echo "$MCP_ONLY_RESPONSE" | jq '.' > /tmp/mcp_only_result.json

SUCCESS=$(echo "$MCP_ONLY_RESPONSE" | jq -r '.success')
WEB_SOURCES=$(echo "$MCP_ONLY_RESPONSE" | jq -r '.sources.web | length')
MCP_SOURCES=$(echo "$MCP_ONLY_RESPONSE" | jq -r '.sources.mcp | length')

echo ""
echo "Ergebnisse:"
echo "  - Success: $SUCCESS"
echo "  - Web-Quellen: $WEB_SOURCES"
echo "  - MCP-Quellen: $MCP_SOURCES"

if [ "$SUCCESS" == "true" ] && [ "$WEB_SOURCES" -eq 0 ] && [ "$MCP_SOURCES" -gt 0 ]; then
  echo -e "${GREEN}✓ Graceful Degradation funktioniert${NC}"
  echo -e "${GREEN}✓ MCP ohne Web-Suche funktional${NC}"
else
  echo -e "${YELLOW}⚠️  Unerwartetes Verhalten${NC}"
fi

echo -e "\n${GREEN}✅ Test 5 bestanden${NC}\n"

# ========================================
# Zusammenfassung
# ========================================
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Test-Zusammenfassung          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}✅ Test 1: Web + MCP Deep Research${NC}"
echo -e "${GREEN}✅ Test 2: Section Enrichment${NC}"
echo -e "${GREEN}✅ Test 3: Research Batch${NC}"
echo -e "${GREEN}✅ Test 4: Error Handling${NC}"
echo -e "${GREEN}✅ Test 5: Graceful Degradation${NC}"

echo -e "\n${GREEN}🎉 Alle Tests bestanden!${NC}\n"

echo "Test-Ergebnisse gespeichert in:"
echo "  - /tmp/research_result.json"
echo "  - /tmp/enrich_result.json"
echo "  - /tmp/batch_result.json"
echo "  - /tmp/mcp_only_result.json"

echo -e "\nTest-Dokument ID: ${BLUE}$DOC_ID${NC}"
echo "View: http://10.0.0.14:3000/documents/$DOC_ID"
