# Conditions — Zusätzliche Prüfung zur Laufzeit

Das `<Target>` ist der Vorfilter — es prüft statische Eigenschaften der Anfrage. Die `<Condition>` ist der Detailfilter — sie wird erst zur Laufzeit ausgewertet, wenn das Target bereits gepasst hat.

## Target vs. Condition

| Aspekt | Target | Condition |
|---|---|---|
| Zeitpunkt | Vorfilter | Nach Target-Match |
| Inhalt | Wer, Was, Wie | Komplexe Ausdrücke |
| Ergebnis bei Nichtübereinstimmung | Not Applicable | Not Applicable |
| Typischer Einsatz | Rolle, Ressourcentyp | Kontextabhängige Regeln |

## Die möglichen Ergebnisse einer Condition

<div class="guide-diagram guide-diagram--col">
  <div class="gd-box gd-blue">Condition wird ausgewertet</div>
  <div class="guide-branch">
    <div class="guide-branch-item">
      <div class="gd-arrow-down">↓</div>
      <div class="gd-box gd-green">true → Effect anwenden<br><small>Permit oder Deny</small></div>
    </div>
    <div class="guide-branch-item">
      <div class="gd-arrow-down">↓</div>
      <div class="gd-box gd-orange">false → Not Applicable<br><small>Nächste Regel prüfen</small></div>
    </div>
    <div class="guide-branch-item">
      <div class="gd-arrow-down">↓</div>
      <div class="gd-box gd-red">Fehler → Indeterminate<br><small>Attribut nicht gefunden o. ä.</small></div>
    </div>
  </div>
</div>

## Praxisbeispiel: Arzt und Station

```
Regel: "Ärzte dürfen Patientendaten lesen"
Target: Rolle = Arzt UND Aktion = Lesen
Condition: Station(Arzt) == Station(Patient)
```

<div class="guide-diagram">
  <div class="gd-box gd-green">Dr. Müller<br>Station 3</div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-blue">Patient Schmidt<br>Station 3</div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-green">✅ Permit<br><small>Gleiche Station</small></div>
</div>
<div class="guide-diagram" style="margin-top:8px">
  <div class="gd-box gd-green">Dr. Müller<br>Station 3</div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-orange">Patient Weber<br>Station 7</div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-orange">⚠️ Not Applicable<br><small>Andere Station</small></div>
</div>

## Negierte Conditions

Mit `not(...)` wird eine Condition umgekehrt: Die Regel gilt, wenn die Bedingung **nicht** zutrifft.

```xml
<Condition>
  <Apply FunctionId="...not">
    <Apply FunctionId="...string-equal">
      <!-- Nicht der Inhaber der Akte -->
    </Apply>
  </Apply>
</Condition>
```

*"Verweigere, wenn der anfragende Patient NICHT der Inhaber der Akte ist."*

> **Zusammenfassung:** Conditions ermöglichen kontextabhängige Regeln. true → Effect. false → Not Applicable. Fehler → Indeterminate. Negation mit `not(...)` kehrt das Ergebnis um.
