# Target — Für wen gilt diese Regel?

Das `<Target>` bestimmt, **wann eine Regel angewendet wird**. Es ist der Vorfilter: Passt die Anfrage nicht zum Target, wird die Regel übersprungen — ohne Permit oder Deny.

## Die drei Dimensionen

<div class="guide-diagram">
  <div class="gd-box gd-blue">👤 Subject<br><small>Wer stellt die Anfrage?<br>Rolle, Benutzer-ID, System</small></div>
  <div class="gd-plus">+</div>
  <div class="gd-box gd-orange">📄 Resource<br><small>Auf was wird zugegriffen?<br>FHIR-Ressourcentyp, Dokument-ID</small></div>
  <div class="gd-plus">+</div>
  <div class="gd-box gd-purple">⚡ Action<br><small>Was wird getan?<br>Lesen, Schreiben, Löschen</small></div>
</div>

## Wie ein Match funktioniert

Jedes Element enthält **Match-Bedingungen**. Hier ein Beispiel für einen SubjectMatch:

```xml
<SubjectMatch MatchId="...string-equal">
  <AttributeValue DataType="string">Arzt</AttributeValue>
  <SubjectAttributeDesignator AttributeId="urn:role"/>
</SubjectMatch>
```

Diese Zeilen bedeuten: *"Die Rolle des anfragenden Benutzers muss 'Arzt' sein."*

## Not Applicable — Wenn das Target nicht passt

Stimmt das Target nicht überein, ist das Ergebnis **Not Applicable** — die Regel wird vollständig ignoriert:

<div class="guide-diagram guide-diagram--col">
  <div class="gd-box gd-blue">Anfrage: Patient liest Observation</div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-orange">Regel: Target = Arzt + Patient-Ressource</div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-red">⚠️ Not Applicable<br><small>Rolle ist "Patient", nicht "Arzt" → Regel übersprungen</small></div>
</div>

## Leeres Target

Ein leeres `<Target/>` bedeutet: **Diese Regel gilt für alle Anfragen.** Das ist oft beim PolicySet der Fall.

> **Zusammenfassung:** Das Target ist der Vorfilter einer Regel. Passt Subject, Resource und Action — wird die Regel ausgewertet. Passt eines nicht — Not Applicable, Regel übersprungen.
