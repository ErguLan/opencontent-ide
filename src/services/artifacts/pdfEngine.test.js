import { describe, expect, it } from 'vitest';
import { documentFromText, serializeDocumentToPdf, createPdfArtifact, addPdfAnnotation } from './pdfEngine.js';

describe('pdfEngine', () => {
  it('creates an editable paged document and serializes a PDF', async () => {
    const artifact = documentFromText('Quarterly report\n\nRevenue increased.', { name: 'Report' });
    expect(artifact.content.pages.length).toBeGreaterThan(0);
    const blob = serializeDocumentToPdf(artifact);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain('%PDF-1.4');
  });
  it('keeps imported PDF original separate from annotations', () => {
    const original = createPdfArtifact({ name: 'source.pdf', sourceDataUrl: 'data:application/pdf;base64,AAAA' });
    const edited = addPdfAnnotation(original, { text: 'Review', page: 1 });
    expect(edited.content.originalDataUrl).toBe(original.content.originalDataUrl);
    expect(edited.content.annotations).toHaveLength(1);
    expect(edited.metadata.immutableOriginal).toBe(true);
  });
});
