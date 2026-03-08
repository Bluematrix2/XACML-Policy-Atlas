# Combining Algorithms — Wer gewinnt bei Konflikten?

Was passiert, wenn mehrere Regeln auf dieselbe Anfrage passen — eine sagt Permit, eine sagt Deny? Der **Combining Algorithm** entscheidet.

## Die drei wichtigsten Algorithmen

### deny-overrides

**Deny hat immer Vorrang.** Sobald eine Regel Deny liefert, ist das Endergebnis Deny — egal wie viele andere Regeln Permit sagen.

> Einsatz: Sicherheitskritische Systeme, wo eine Ablehnung niemals überstimmt werden darf.

### permit-overrides

**Permit hat immer Vorrang.** Sobald eine Regel Permit liefert, ist das Endergebnis Permit.

> Einsatz: Systeme, die standardmäßig sperren aber breiten Zugang für bestimmte Gruppen gewähren wollen.

### first-applicable

**Die erste zutreffende Regel gewinnt.** Die Reihenfolge der Regeln in der Policy ist entscheidend.

> Einsatz: Wenn Regeln eine klare Prioritätsreihenfolge haben sollen.

## Vergleichstabelle

| Szenario | deny-overrides | permit-overrides | first-applicable |
|---|---|---|---|
| Nur Permit | ✅ Permit | ✅ Permit | ✅ Permit |
| Nur Deny | ❌ Deny | ❌ Deny | ❌ Deny |
| Permit + Deny | ❌ Deny | ✅ Permit | 🔢 Erste Regel |
| Keine passende Regel | ⚠️ Not Applicable | ⚠️ Not Applicable | ⚠️ Not Applicable |
| Alle Not Applicable | ⚠️ Not Applicable | ⚠️ Not Applicable | ⚠️ Not Applicable |

## Wo wird der Algorithmus gesetzt?

Im XML als Attribut des PolicySet oder der Policy:

```xml
<PolicySet PolicyCombiningAlgId=
  "urn:oasis:names:tc:xacml:1.0:policy-combining-algorithm:deny-overrides">
```

```xml
<Policy RuleCombiningAlgId=
  "urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:first-applicable">
```

> **Zusammenfassung:** deny-overrides → Deny gewinnt immer. permit-overrides → Permit gewinnt immer. first-applicable → Reihenfolge entscheidend. Der Algorithmus steht im PolicySet/Policy-Attribut.

<div class="guide-back-btn-wrap">
  <button class="guide-back-btn" onclick="App.switchTab('viz')">← Zurück zur Visualisierung</button>
</div>