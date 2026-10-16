# ADR 0004: Naming and licensing

Date: 2026-10-16
Status: accepted; public name proposed 2026-10-16, pending trademark check and domain registration

## Context

The planning framework requires a neutral name that describes a commons rather than a product, owned eventually by a foundation, and permissive licenses from the first public commit. The current repositories carry a company's product name. Choosing the final name is a business decision that has not been made.

## Decision

- **Name.** The proposed public name is **Frontier State Protocol** (short form **FSP**), reported as `name_status: proposed` in the machine-readable description until a trademark search in the key markets and a domain registration are complete. Reasons: it describes the commons (verifiable state for frontier domains: space first, then polar, ocean, geospatial, lunar) rather than a product; it carries no company name; it matches the existing umbrella vocabulary ("Frontier Systems", `frontier-shared`) so nothing has to be renamed; and the GitHub namespaces `frontier-state-protocol` and `frontier-state` were unclaimed when checked. Rejected: names containing the company, generic single words already used by large software products, and anything implying tokens or chains. No signed byte depends on the name: wire formats are tagged `state-envelope/1`, `state-receipt/1` and profile ids, so the name can still change without invalidating anything.
- **Specification license.** CC BY 4.0 with a royalty-free patent commitment (see `docs/SPEC-LICENSE.md`).
- **Code license.** Apache-2.0 for the primitive package, the reference registry and the reference node.
- **Publishing home.** Until a foundation or neutral organization exists, repositories live privately under the operating company's GitHub organization and the primitive package is published under the company's existing npm scope (`@iricity/frontier-shared`), because that scope is already owned and administered. The protocol name never appears in the package scope, so moving to a neutral scope later is an additive re-publish, not a rename of the protocol.
- **Company references.** Specification text and schemas must not name the company, its products or its commercial surfaces. Operator-specific facts (legal entity, site, keys) belong in a node's manifest and authorization records, which is where they are now.
- **Internal project names** from private planning material never appear in public specification, code, comments or commit messages.

## Consequences

- The three repositories can be published under any organization or foundation without rewriting their contents.
- A later rename is a documentation change plus an entry in this ADR's history.
- Repository names themselves may change at publication time; package names (`@iricity/frontier-shared`) are an npm concern decided at publication.
