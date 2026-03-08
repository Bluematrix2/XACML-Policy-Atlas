# Enforcement-CSV — Aufbau und Verwendung

Die **Enforcement-CSV** beschreibt, welche FHIR-Ressourcen durch XACML-Policies geschützt werden und über welche FHIR-Suchparameter und XACML-Attribute der Zugriff kontrolliert wird. Das Tool nutzt sie, um FHIR-Ressource-Chips einzufärben und im Slide-in-Panel Enforcement-Details anzuzeigen.

---

## Dateiformat

- **Trennzeichen:** Semikolon (`;`)
- **Zeichensatz:** UTF-8 (mit oder ohne BOM — wird automatisch entfernt)
- **Erste Zeile:** Pflicht-Header
- **Pflichtfelder:** `fhir_resource`, `access_control`

```
fhir_resource;access_control;search_parameter;enforcement_attribute;xacml_attribute;comment
```

---

## Spalten

| Spalte | Pflicht | Beschreibung |
|---|---|---|
| `fhir_resource` | **Ja** | Name der FHIR-Ressource (exakt wie im HL7-Standard, z.B. `Patient`, `Observation`) |
| `access_control` | **Ja** | Zugriffskontroll-Status — gültige Werte: `policy enforced`, `policy enforced*`, `public` |
| `search_parameter` | Nein | FHIR-Suchparameter, über den das Attribut abgefragt wird (z.B. `patient`, `date`) |
| `enforcement_attribute` | Nein | FHIR-Pfad des kontrollierten Feldes (z.B. `Account.subject`) |
| `xacml_attribute` | Nein | Zugehörige XACML-Attribut-URI aus der Policy |
| `comment` | Nein | Freitext-Anmerkung (z.B. Versionsinformation, Einschränkungen) |

---

## access_control — Werte

| Wert | Symbol | Bedeutung |
|---|---|---|
| `policy enforced` | 🔒 Policy Enforced | Der Zugriff wird vollständig durch XACML-Policies kontrolliert |
| `policy enforced*` | ⚠ Policy Enforced* | Zugriff ist policy-gesteuert, aber mit Einschränkungen (Details im `comment`) |
| `public` | 🌐 Public | Ressource ist öffentlich zugänglich, keine Policy-Kontrolle |

---

## Mehrere Zeilen pro Ressource

Eine FHIR-Ressource kann **mehrfach** in der CSV erscheinen — eine Zeile pro kontrolliertem Suchparameter:

```
Account;policy enforced;patient;Account.subject;urn:ihe:iti:ser:2016:patient-id;
Account;policy enforced*;subject;Account.subject;urn:ihe:iti:ser:2016:patient-id;* nur wenn Ressourcentyp Patient ist
Account;policy enforced;owner;Account.owner;urn:fp:2025:fhir:attribute:owner:organization;seit CHR-25.3
```

Das Tool gruppiert alle Zeilen derselben Ressource und zeigt sie zusammen im Enforcement-Panel an. Der `access_control`-Status der **ersten Zeile** gilt als primärer Status — allerdings überschreibt ein `policy enforced` einen `public`-Status wenn beide vorkommen.

---

## Sonderwert `--`

Wenn eine Ressource öffentlich ist und keine Suchparameter hat, werden die optionalen Felder mit `--` gefüllt:

```
ActivityDefinition;public;--;--;--;
Binary;public;--;--;--;
```

Das Tool überspringt Zeilen mit `search_parameter = --` bei der Detailansicht.

---

## Vollständiges Beispiel

```
fhir_resource;access_control;search_parameter;enforcement_attribute;xacml_attribute;comment
AllergyIntolerance;policy enforced;patient;AllergyIntolerance.patient;urn:ihe:iti:ser:2016:patient-id;
AllergyIntolerance;policy enforced;category;AllergyIntolerance.category;urn:fp:2022:fhir:attribute:category;
AllergyIntolerance;policy enforced;code;AllergyIntolerance.code;urn:fp:2022:fhir:attribute:code;
AllergyIntolerance;policy enforced;date;AllergyIntolerance.recordedDate;urn:fp:2013:record:clinical-statement:documentation-date;
ActivityDefinition;public;--;--;--;
```

---

## Wie das Tool die CSV verarbeitet

<div class="guide-diagram">
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>1. CSV laden</strong><br>
    BOM entfernen → Header parsen → Spaltenindizes bestimmen
  </div>
  <div class="gd-arrow">↓</div>
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>2. Ressourcen gruppieren</strong><br>
    Pro <code>fhir_resource</code>: <code>primaryControl</code> + Liste aller <code>entries[]</code> aufbauen
  </div>
  <div class="gd-arrow">↓</div>
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>3. FHIR-Chips einfärben</strong><br>
    <code>policy enforced</code> → lila · <code>policy enforced*</code> → orange · <code>public</code> → grau
  </div>
  <div class="gd-arrow">↓</div>
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>4. Slide-in-Panel</strong><br>
    Klick auf ℹ️ öffnet Panel mit allen Suchparametern, FHIR-Pfaden und XACML-Attributen der Ressource
  </div>
</div>

---

## Beziehung zwischen den beiden CSVs

Die Enforcement-CSV referenziert XACML-Attribut-URIs in der Spalte `xacml_attribute`. Diese URIs können in der **Mapping-CSV** mit Labels und Farben hinterlegt sein:

<div class="guide-diagram">
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>Enforcement-CSV</strong><br>
    <code>xacml_attribute:</code><br>
    <code>urn:ihe:iti:ser:2016:patient-id</code>
  </div>
  <div class="gd-arrow">→ Lookup in →</div>
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>Mapping-CSV</strong><br>
    <code>id: urn:ihe:iti:ser:2016:patient-id</code><br>
    <code>label: Patienten-ID (Akte)</code>
  </div>
  <div class="gd-arrow">→ Ergebnis →</div>
  <div class="gd-box" style="background:var(--bg-secondary)">
    <strong>Panel-Anzeige</strong><br>
    Spalte „XACML-Attribut" zeigt<br>
    <em>Patienten-ID (Akte)</em> statt Roh-URI
  </div>
</div>

---

## Häufige Fehler

| Problem | Ursache | Lösung |
|---|---|---|
| Ressource wird nicht eingefärbt | `fhir_resource` stimmt nicht exakt mit dem FHIR-Typ in der Policy überein | Groß-/Kleinschreibung prüfen (`Patient` nicht `patient`) |
| Panel zeigt „Kein Eintrag" | Ressource fehlt in der CSV | Zeile für die Ressource ergänzen |
| Ladefehler | Pflicht-Header `fhir_resource` oder `access_control` fehlen | Header-Zeile prüfen |
| `policy enforced*` wird nicht angezeigt | Sternchen-Suffix vergessen | Wert muss exakt `policy enforced*` lauten (inkl. `*`) |

> **Zusammenfassung:** Die Enforcement-CSV beschreibt pro FHIR-Ressource, ob und wie der Zugriff durch XACML gesteuert wird. Eine Ressource kann mehrere Zeilen haben — eine pro Suchparameter. Die Spalte `xacml_attribute` verbindet Enforcement-Daten mit der Mapping-CSV für lesbare Labels.
