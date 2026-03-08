# Mapping-CSV — Aufbau und Verwendung

Die **Mapping-CSV** übersetzt technische XACML-URIs in lesbare Labels, Beschreibungen und Farben. Ohne diese Datei zeigt der Visualisierer Roh-URIs; mit ihr werden farbige, beschriftete Chips angezeigt.

---

## Dateiformat

- **Trennzeichen:** Semikolon (`;`)
- **Zeichensatz:** UTF-8
- **Erste Zeile:** Pflicht-Header (Spaltenreihenfolge beliebig, Namen fix)
- **Pflichtfelder:** `id`, `label`

```
type;id;label;description;color
```

---

## Spalten

| Spalte | Pflicht | Beschreibung |
|---|---|---|
| `type` | Nein | Kategorie des Eintrags — dient der Lesbarkeit, wird intern nicht ausgewertet |
| `id` | **Ja** | Eindeutiger Schlüssel — XACML-URI oder `code@codeSystem` für CV-Typen |
| `label` | **Ja** | Angezeigter Name im Chip (kurz, max. ~30 Zeichen empfohlen) |
| `description` | Nein | Längere Erklärung — erscheint im Tooltip beim Hover |
| `color` | Nein | Hex-Farbe des Chips (z.B. `#2196F3`); fehlt sie, wird eine Standardfarbe verwendet |

---

## Typ-Kategorien (Spalte `type`)

Die Spalte `type` ist **informell** und wird vom Tool nicht ausgewertet — sie hilft beim manuellen Pflegen der Datei:

| Typ | Bedeutung | Beispiel-ID |
|---|---|---|
| `algorithm` | Combining-Algorithmen (PolicySet / Policy) | `urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides` |
| `function` | Match-Funktionen in SubjectMatch / Condition | `urn:hl7-org:v3:function:CV-equal` |
| `role` | Rollen-Codes (CodedValue-Typ) | `Patient@2.16.840.1.113883.3.37.4.1.9.204` |
| `attribute` | XACML-Attribut-IDs (Subject, Resource, Action) | `urn:oasis:names:tc:xacml:2.0:subject:role` |
| `action` | Aktions-URIs | `urn:icw:2013:record:view-all-response` |

---

## ID-Format

### Einfache URIs

Für alle Attribute, Aktionen, Algorithmen und Funktionen ist die `id` direkt die XACML-URI:

```
urn:oasis:names:tc:xacml:2.0:subject:role
urn:icw:2013:record:view-all-response
http://hl7.org/fhir/resource-types
```

### CodedValue-Format (`code@codeSystem`)

Für Rollen und Codes, die als `<CV code="..." codeSystem="..."/>` in der Policy stehen, gilt das Format:

```
code@codeSystem
```

**Beispiel:** Eine XACML-Policy enthält:

```xml
<AttributeValue DataType="urn:hl7-org:v3#CV">
  <CV code="Patient" codeSystem="2.16.840.1.113883.3.37.4.1.9.204"/>
</AttributeValue>
```

Dann lautet der Mapping-Schlüssel:

```
Patient@2.16.840.1.113883.3.37.4.1.9.204
```

---

## Vollständiges Beispiel

```
type;id;label;description;color
algorithm;urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides;Deny hat Vorrang;Wenn eine Regel verweigert, gilt das immer;#607D8B
function;urn:hl7-org:v3:function:CV-equal;Code-Vergleich;Prüft ob zwei codierte Werte identisch sind;
role;Patient@2.16.840.1.113883.3.37.4.1.9.204;Patient;Der Benutzer ist als Patient angemeldet;#2196F3
attribute;urn:oasis:names:tc:xacml:2.0:subject:role;Benutzerrolle;Die Rolle des angemeldeten Benutzers;#2196F3
attribute;urn:ihe:iti:ser:2016:patient-id;Patienten-ID (Akte);ID des Patienten, dem die Akte gehört;#4CAF50
action;urn:icw:2013:record:view-all-response;Lesen (READ);Daten anzeigen und abrufen;#4CAF50
```

---

## Wie das Tool die CSV verarbeitet

<div class="guide-diagram">
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>1. CSV laden</strong><br>
    Header-Zeile parsen → Spalten <code>id</code> und <code>label</code> lokalisieren
  </div>
  <div class="gd-arrow">↓</div>
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>2. Lookup-Tabelle aufbauen</strong><br>
    Jeder Eintrag wird unter seiner <code>id</code> gespeichert
  </div>
  <div class="gd-arrow">↓</div>
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>3. Beim Rendern nachschlagen</strong><br>
    Für jede URI / jeden Code@System in der Policy → Eintrag aus Tabelle → Chip mit Label + Farbe + Tooltip
  </div>
  <div class="gd-arrow">↓</div>
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>4. Kein Treffer?</strong><br>
    Roh-URI wird als Chip angezeigt (grau, volle URI im Tooltip)
  </div>
</div>

---

## Häufige Fehler

| Problem | Ursache | Lösung |
|---|---|---|
| Chip zeigt Roh-URI | `id` in CSV stimmt nicht exakt mit URI in der Policy überein | Groß-/Kleinschreibung, Leerzeichen prüfen |
| CSV-Ladefehler | Spalten `id` oder `label` fehlen im Header | Header-Zeile auf Tippfehler prüfen |
| Falsche Farbe | Ungültiger Hex-Code (z.B. `2196F3` ohne `#`) | `#` voranstellen |
| CV-Rolle nicht erkannt | Falsches Trennzeichen im CodedValue-Schlüssel | Format muss `code@codeSystem` sein (kein Leerzeichen) |

> **Zusammenfassung:** Die Mapping-CSV ist eine einfache Lookup-Tabelle. Pflichtfelder sind `id` (der exakte XACML-Schlüssel) und `label` (der angezeigte Name). Alle anderen Felder sind optional und reichern die Darstellung an.
