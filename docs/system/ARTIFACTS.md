# Artifact Studio

OpenContent now treats text, images, diagrams, editable documents and PDFs as artifacts. Artifact data is local-first and stored in `OpenContentArtifactsDB`.

## Diagram support

Structured nodes/connectors, drag editing, labels, simple DSL (`A -> B`), auto-layout and SVG export. AI changes are planned as structured operations and require review before application.

## Documents and PDF

Editable documents use pages and blocks and export to a dependency-free PDF serializer. Imported PDFs are immutable originals with a separate edit/annotation layer. This boundary is deliberate: arbitrary third-party PDF content streams are not rewritten destructively without a parser that can preserve fonts and layout safely.

## Interfaces

- UI: `/artifacts`
- Browser CLI: `artifact`, `diagram`, `document`
- Standalone CLI: `node cli/artifacts.js ...`
- REST: `/api/artifacts/*`
- MCP: `node mcp/artifacts.js`
- Plugins: artifact import/export/render/operation hooks, diagram symbol providers, PDF processors
- Rust: `rust/oc-core` for deterministic validation/geometry and future PDF binary processing; build native or `wasm32`.

## AI safety model

Document contents are untrusted data. The artifact planner has a fixed action allowlist. Changes are previewed before application and snapshots retain version history. Imported PDF originals are never overwritten by the browser editor.

## Current PDF editing boundary

Generated OpenContent documents are deeply editable and can be exported to PDF. Third-party PDF import currently provides native browser preview plus a non-destructive annotation/edit layer. Page-stream rewriting, font reconstruction and OCR are intentionally isolated behind the `PDF_PROCESSOR` extension point and `oc-core`, rather than pretending arbitrary PDFs are Word documents.

## Rust

`oc-core` is a native/WASM-ready crate. Today it validates operation types, provides deterministic snapping and PDF text escaping. It is the intended home for binary parsing, geometry and other expensive deterministic transforms as those capabilities mature.
