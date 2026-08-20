import { describe, expect, it } from 'vitest';
import { diagramToSvg, parseDiagramDsl } from './diagramEngine.js';

describe('diagramEngine', () => {
  it('builds structured nodes and connectors from DSL', () => {
    const artifact = parseDiagramDsl('User -> API\nAPI -> Database');
    expect(artifact.content.elements).toHaveLength(3);
    expect(artifact.content.connectors).toHaveLength(2);
  });
  it('exports SVG without rasterizing the diagram', () => {
    const svg = diagramToSvg(parseDiagramDsl('A -> B'));
    expect(svg).toContain('<svg');
    expect(svg).toContain('A');
    expect(svg).toContain('marker-end');
  });
});
