# Aufbau einer Policy — Die Hierarchie

XACML-Regeln sind in einer **dreistufigen Hierarchie** organisiert:

<div class="guide-diagram guide-diagram--col">
  <div class="gd-box gd-purple" style="width:100%;text-align:center">📁 PolicySet<br><small>"Ordner" — enthält mehrere Policies</small></div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-blue" style="width:85%;align-self:center;text-align:center">📋 Policy<br><small>"Regelgruppe" — thematisch zusammengehörige Regeln</small></div>
  <div class="gd-arrow-down">↓</div>
  <div class="gd-box gd-green" style="width:70%;align-self:center;text-align:center">📌 Rule<br><small>"Einzelregel" — konkrete Erlaubnis oder Verweigerung</small></div>
</div>

## PolicySet — Der Ordner

Ein `PolicySet` fasst mehrere Policies zusammen. Es definiert:

- Welcher **Combining Algorithm** bei Konflikten gilt (z. B. `deny-overrides`)
- Ein eigenes **Target** — für welche Anfragen dieses Set relevant ist

```xml
<PolicySet PolicySetId="FHIR-Zugriffskontrolle"
           PolicyCombiningAlgId="...deny-overrides">
  <Target/>  <!-- gilt für alle Anfragen -->
  <Policy>...</Policy>
  <Policy>...</Policy>
</PolicySet>
```

## Policy — Die Regelgruppe

Eine `Policy` bündelt thematisch verwandte Regeln. Typisch: eine Policy pro FHIR-Ressource oder Benutzergruppe.

- Eigenes **Target** — für welche Anfragen diese Policy gilt
- Eigener **Rule Combining Algorithm**

## Rule — Die Einzelregel

Eine `Rule` ist die kleinste Einheit. Sie enthält:

- **Effect:** `Permit` (erlaubt) oder `Deny` (verweigert)
- **Target:** Wann gilt diese Regel?
- **Condition** (optional): Zusätzliche Prüfung zur Laufzeit

```xml
<Rule RuleId="Arzt-lesen" Effect="Permit">
  <Target>
    <Subjects>...</Subjects>
    <Resources>...</Resources>
    <Actions>...</Actions>
  </Target>
  <Condition>...</Condition>
</Rule>
```

> **Zusammenfassung:** PolicySet → Policy → Rule. Jede Ebene hat ein eigenes Target und einen Combining Algorithm. Rules sind die kleinste Einheit mit dem konkreten Permit/Deny.

<div class="guide-back-btn-wrap">
  <button class="guide-back-btn" onclick="App.switchTab('viz')">← Zurück zur Visualisierung</button>
</div>