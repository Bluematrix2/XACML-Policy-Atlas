# Praxisbeispiel: AllRecordsBasicAccess

Gehen wir Schritt für Schritt durch eine echte Policy. **Szenario:** Ein Patient möchte seine eigenen Allergiedaten lesen. Darf er?

## Ausgangslage: Die Policy-Struktur

Die Policy `AllRecordsBasicAccess` enthält 6 Regeln. Das Target der Policy passt auf alle Anfragen (leeres Target auf PolicySet-Ebene).

**Drei Subject-Gruppen (ODER-verknüpft):**

<div class="guide-diagram">
  <div class="gd-box gd-blue">Subjekt: Patient</div>
  <div class="gd-chip gd-chip--or">ODER</div>
  <div class="gd-box gd-blue">Subjekt: patient</div>
  <div class="gd-chip gd-chip--or">ODER</div>
  <div class="gd-box gd-blue">Subjekt: xt_private_record</div>
</div>

## Schritt 1: Target-Prüfung

Die Anfrage: `Benutzer=Patient123, Rolle=patient, Ressource=AllergyIntolerance, Aktion=read`

Das PolicySet-Target ist leer → **passt immer**.
Die Policy wird ausgewertet.

## Schritt 2: Regeln werden der Reihe nach geprüft

**Regel 1 (Permit):** Target = Rolle `patient`, Ressource = AllergyIntolerance, Aktion = read

- Subject-Match: Rolle des Benutzers = `patient` → ✅ passt
- Resource-Match: AllergyIntolerance → ✅ passt
- Action-Match: read → ✅ passt
- Keine Condition → direkt ausgewertet

→ **Regel 1 liefert: Permit**

## Schritt 3: Combining Algorithm entscheidet

Der Algorithmus ist `deny-overrides`. Da:
- Regel 1 → Permit
- Keine weitere Regel liefert Deny (für diese Anfrage)

→ **Gesamtergebnis: ✅ Permit — Patient darf seine Allergiedaten lesen.**

## Was wäre bei einer anderen Station?

Regel 6 hat eine **negierte Condition**: "Verweigere, wenn der Patient NICHT der Inhaber der Akte ist."

```
Patient123 fragt Akte von Patient456 an:
→ Condition: patient123 ≠ patient456 → NOT false → true
→ Regel 6 liefert: Deny
→ deny-overrides: Deny gewinnt
→ Ergebnis: ❌ Deny
```

## Zusammenfassung des Ablaufs

<div class="guide-diagram guide-diagram--col">
  <div class="gd-box gd-blue">Anfrage eingeht</div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-orange">PolicySet-Target prüfen → passt</div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-orange">Policy-Target prüfen → passt</div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-orange">Regeln prüfen: Targets + Conditions</div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-purple">Combining Algorithm: deny-overrides</div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-green">✅ Permit — Zugriff gewährt</div>
</div>

> **Zusammenfassung:** XACML wertet PolicySets → Policies → Rules von außen nach innen aus. Target-Checks filtern, Conditions verfeinern, Combining Algorithms entscheiden bei Konflikten. Das Ergebnis ist immer Permit, Deny, Not Applicable oder Indeterminate.

<div class="guide-back-btn-wrap">
  <button class="guide-back-btn" onclick="App.switchTab('viz')">← Zurück zur Visualisierung</button>
</div>
