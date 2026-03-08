# Was ist XACML?

XACML steht für **eXtensible Access Control Markup Language** — ein offener XML-Standard der OASIS-Organisation zur Beschreibung von Zugriffsrechten.

Die zentrale Frage, die XACML beantwortet:

> **"Wer darf was mit welchen Daten unter welchen Bedingungen tun?"**

## Die Türsteher-Analogie

Stelle dir einen Türsteher vor, der eine Liste mit Regeln hat:

<div class="guide-diagram">
  <div class="gd-box gd-blue">👤 Anfrage<br><small>Wer? Was? Wozu?</small></div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-orange">📋 Policy-Check<br><small>Regeln prüfen</small></div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-green">✅ Permit<br><small>Zugriff erlaubt</small></div>
</div>
<div class="guide-diagram" style="margin-top:4px">
  <div class="gd-spacer"></div>
  <div class="gd-spacer"></div>
  <div class="gd-arrow" style="transform:rotate(90deg)">↓</div>
  <div class="gd-spacer"></div>
  <div class="gd-box gd-red">❌ Deny<br><small>Zugriff verweigert</small></div>
</div>

## Warum XML?

XACML-Policies sind maschinenlesbare XML-Dateien. Das ermöglicht:

- **Standardisierung** — Hersteller-unabhängige Zugriffsregeln
- **Versionierung** — Regeln in Git versionierbar
- **Auditing** — Jede Entscheidung nachvollziehbar
- **Interoperabilität** — Zwischen Systemen austauschbar

## Wo wird XACML eingesetzt?

Typische Einsatzgebiete im Gesundheitswesen:

- Wer darf welche FHIR-Ressourcen lesen oder schreiben?
- Dürfen Ärzte Patientendaten einer anderen Station sehen?
- Welche Benutzerrollen haben Zugriff auf Notfalldaten?

> **Zusammenfassung:** XACML ist der Standard, um Zugriffsrechte maschinenlesbar, versionierbar und prüfbar zu definieren. Die Kernfrage: Wer darf was mit welchen Daten unter welchen Bedingungen tun?

<div class="guide-back-btn-wrap">
  <button class="guide-back-btn" onclick="App.switchTab('viz')">← Zurück zur Visualisierung</button>
</div>