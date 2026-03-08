# UND- und ODER-Verknüpfungen

Die mächtigste Funktion von XACML: Bedingungen können mit **UND** und **ODER** kombiniert werden. Das Prinzip ist in der XML-Struktur versteckt.

## ODER — Mehrere Subjects

Mehrere `<Subject>`-Elemente innerhalb von `<Subjects>` sind **ODER-verknüpft**:
*"Regel gilt für Arzt **ODER** Pfleger **ODER** Admin"*

```xml
<Subjects>
  <Subject>
    <SubjectMatch>Rolle = Arzt</SubjectMatch>
  </Subject>
  <Subject>
    <SubjectMatch>Rolle = Pfleger</SubjectMatch>
  </Subject>
</Subjects>
```

<div class="guide-diagram">
  <div class="gd-box gd-green">Rolle = Arzt</div>
  <div class="gd-chip gd-chip--or">ODER</div>
  <div class="gd-box gd-green">Rolle = Pfleger</div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-blue">✅ Match</div>
</div>

## UND — Mehrere SubjectMatches

Mehrere `<SubjectMatch>`-Elemente innerhalb eines `<Subject>` sind **UND-verknüpft**:
*"Regel gilt für Benutzer mit Rolle Arzt **UND** Verbindung über TLS"*

```xml
<Subject>
  <SubjectMatch>Rolle = Arzt</SubjectMatch>
  <SubjectMatch>Verbindungstyp = TLS</SubjectMatch>
</Subject>
```

<div class="guide-diagram">
  <div class="gd-box gd-green">Rolle = Arzt</div>
  <div class="gd-chip gd-chip--and">UND</div>
  <div class="gd-box gd-green">Verbindung = TLS</div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-blue">✅ Beide müssen passen</div>
</div>

## Kombiniert — UND innerhalb von ODER

Die echte Stärke: `(Arzt UND TLS) ODER Admin`

```xml
<Subjects>
  <Subject>
    <!-- Beide müssen passen (UND) -->
    <SubjectMatch MatchId='urn:oasis:names:tc:xacml:1.0:function:string-equal'>
        <AttributeValue DataType='http://www.w3.org/2001/XMLSchema#string'>document-repository</AttributeValue>
        <SubjectAttributeDesignator DataType='http://www.w3.org/2001/XMLSchema#string' AttributeId='urn:oasis:names:tc:xacml:1.0:subject:subject-id'/>
    </SubjectMatch>
    <SubjectMatch MatchId='urn:oasis:names:tc:xacml:1.0:function:anyURI-equal'>
        <AttributeValue DataType='http://www.w3.org/2001/XMLSchema#anyURI'> urn:oasis:names:tc:SAML:2.0:ac:classes:TLSClient </AttributeValue>
        <SubjectAttributeDesignator DataType='http://www.w3.org/2001/XMLSchema#anyURI' AttributeId='urn:icw:2015:subject:authentication-type'/>
    </SubjectMatch>
  </Subject>
  <Subject>
    <!-- Alternativ (ODER) -->
    <SubjectMatch MatchId='urn:hl7-org:v3:function:CV-equal'>
        <AttributeValue DataType='urn:hl7-org:v3#CV'>
            <CodedValue xmlns='urn:hl7-org:v3' code='user_role' codeSystem='2.999.999' />
        </AttributeValue>
        <SubjectAttributeDesignator DataType='urn:hl7-org:v3#CV' AttributeId='urn:oasis:names:tc:xacml:2.0:subject:role'/>
    </SubjectMatch>
  </Subject>
</Subjects>
```

<div class="guide-diagram">
  <div class="gd-group">
    <div class="gd-group-label">ODER-Gruppe 1</div>
    <div class="gd-box gd-green">document-repository</div>
    <div class="gd-chip gd-chip--and">UND</div>
    <div class="gd-box gd-green">TLSClient</div>
  </div>
  <div class="gd-chip gd-chip--or">ODER</div>
  <div class="gd-group">
    <div class="gd-group-label">ODER-Gruppe 2</div>
    <div class="gd-box gd-green">user_role</div>
  </div>
  <div class="gd-arrow">→</div>
  <div class="gd-box gd-blue">✅ Match</div>
</div>

## Das gleiche Prinzip für Resources und Actions

Dieselbe UND/ODER-Logik gilt für `<Resources>` und `<Actions>`:

- Mehrere `<Resource>` = ODER: *"Patient-Ressource ODER Observation-Ressource"*
- Mehrere `<ResourceMatch>` = UND: *"Ressource = Patient UND Kontext = klinisch"*

> **Zusammenfassung:** ODER = mehrere `<Subject>`/`<Resource>`/`<Action>`-Elemente. UND = mehrere `<SubjectMatch>`/`<ResourceMatch>`/`<ActionMatch>` innerhalb eines Elements. Kombinationen sind frei möglich.
