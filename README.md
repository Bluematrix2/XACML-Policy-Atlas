# XACML Policy Atlas

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repo-black.svg)](https://github.com/Bluematrix2/XACML-Policy-Atlas)
[![Page_Link](https://img.shields.io/badge/Page_link-online-green)](https://policyatlas.puschmann.io)

## What is XACML Policy Atlas?

XACML Policy Atlas is a free, open-source browser-based tool for working with [XACML (eXtensible Access Control Markup Language)](https://www.oasis-open.org/committees/xacml/) policies. It is designed for Healthcare IT professionals, IHE implementers, and security architects who work with access control policies in FHIR, XUA, and ATNA contexts.

**No server. No upload. No account.** Everything runs locally in your browser.

---

## Features

- 📊 **Visualizer** — Render XACML policies as interactive diagrams. Understand policy structure at a glance instead of reading raw XML.
- ✏️ **Editor** — Edit XACML policies directly in the browser with syntax highlighting and live preview.
- ✅ **Validator** — Validate policies against the XACML 2.0 & 3.0 schema and catch structural errors before deployment.
- 📚 **Knowledge Base** — Built-in reference for XACML concepts, elements, and IHE-specific patterns.
- 🔒 **100% local processing** — Your policies never leave your machine. Critical for sensitive healthcare access control configurations.

---

## Quick Start

Open the tool directly in your browser:

👉 [XACML Policy Atlas](https://policyatlas.puschmann.io)

---

## Usage

1. **Load a policy** — paste XML directly, upload a `.xml` file, or load one of the built-in examples
2. **Visualize** — switch to the Visualizer tab to see the policy structure as a diagram
3. **Edit** — modify the policy in the editor; the visualizer updates live
4. **Validate** — check for schema errors before exporting
5. **Export** — download the finished policy as XML

---

## Who is this for?

- Healthcare IT developers implementing **IHE XUA** (Cross-Enterprise User Assertion)
- Engineers working with **IHE ATNA** (Audit Trail and Node Authentication)
- FHIR security implementers dealing with **SMART on FHIR** scopes and access control
- Security architects designing **role-based** or **attribute-based access control** (RBAC/ABAC) policies in healthcare environments
- Anyone who has spent too long reading XACML XML and wishing there was a better way

---

## IHE / FHIR Context

XACML is used in several IHE profiles as the policy language for access control decisions:

| IHE Profile | Role of XACML |
|---|---|
| **XUA** (ITI-40) | Carries user identity assertions; policy decisions based on XACML |
| **ATNA** (ITI-19/20) | Node authentication; access policies enforced via XACML PDP |
| **SeR** (Secure Retrieve) | XACML-based authorization decisions for document retrieval |
| **APPC** | Patient privacy consent mapped to XACML policies |

XACML Policy Atlas helps you understand, create, and validate these policies without requiring a full PDP/PAP setup.

---

## Security & Privacy

⚠ Provided as-is, use at your own risk.

🔒 All uploaded files are processed locally in your browser and never transmitted to a server.

Avoid uploading sensitive policies on shared or untrusted devices.

See also: SECURITY.md
 | PRIVACY.md
 | DISCLAIMER.md



## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

```
1. Fork the repository
2. Create a feature branch (git checkout -b feature/your-feature)
3. Commit your changes (git commit -m 'Add your feature')
4. Push and open a Pull Request
```

<img width="3810" height="1903" alt="G_XACML-Policy-Atlas" src="https://github.com/Bluematrix2/XACML-Policy-Atlas/blob/main/XACML-Policy-Atlas.png" />
