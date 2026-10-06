# WritterArt — shared contracts

This file is the single source of truth for module boundaries. Code must match it exactly.
Nothing here imports from the OpenContentIDE workspace, and nothing outside `writterart/`
imports from `writterart/`.

## Style rules (applies to every file in this package)

- ESM only. `"type": "module"`. `import` / `export`.
- Zero runtime dependencies. Node built-ins (`node:zlib`, `node:fs`, ...) are allowed.
- No `Math.random()` anywhere. All randomness comes from `createRng(seed)`.
- Deterministic: identical input + identical seed => byte-identical output.
- JSDoc types on every exported function.
- English identifiers, Spanish-language error messages are allowed only in
  `hint` fields (those are read by Spanish-speaking model authors). Error `message`
  and `code` stay English.

## Pipeline

```
source (.wrt text)
  -> tokenize(source)                -> Token[]
  -> parse(source)                   -> ParseResult { ok, scene, errors }
  -> validate(scene)                 -> ValidateResult { ok, errors, warnings }
  -> hashScene(scene)                -> 16-char hex string (canonical, order-independent)
  -> solve(scene, {seed})            -> Layout
  -> buildDrawList(layout)           -> DrawOp[]
  -> renderSvg(layout)               -> string
```

## Token

```js
{ type: 'ident'|'string'|'number'|'punct', value, line, col, pos }
```
`line` and `col` are 1-based. `punct` covers `{ } ( ) [ ] : ,`.

## ParseResult / ValidateResult

```js
ParseResult  = { ok: boolean, scene: Scene|null, errors: Diagnostic[] }
ValidateResult = { ok: boolean, errors: Diagnostic[], warnings: Diagnostic[] }

Diagnostic = {
  code: string,            // stable machine code, see errors.md
  message: string,         // English, one sentence, no trailing period
  path: string,            // JSON pointer-ish: 'root.children[0].props.material'
  line: number|null,       // 1-based source line, null when not source-bound
  col: number|null,
  hint: string|null,       // actionable instruction for the author (may be Spanish)
  near: string[]           // 0..3 closest valid alternatives
}
```

**Contract: `hint` and `near` are the product.** A diffusion model can never emit them.

## Scene (canonical IR, JSON)

The `.wrt` surface syntax is sugar. The canonical form is this IR, and `parse()` must
desugar into it. IR is valid JSON and is what the MCP `validate_scene` tool accepts too.

```js
Scene = {
  kind: 'scene',
  version: '0.1',
  name: string,
  canvas: { width: number, height: number },
  light: Light|null,
  background: Fill|null,
  root: Group
}

Group = { type:'group', id:string, layout:LayoutSpec, style:GroupStyle, children:Node[] }
Panel = { type:'panel', id:string, style:PanelStyle, children:Node[] }
Text  = { type:'text',  id:string, text:string, style:TextStyle }
Icon  = { type:'icon',  id:string, icon:string, style:IconStyle }
Image = { type:'image', id:string, label:string|null, style:PanelStyle }

Node = Group|Panel|Text|Icon|Image
```

### LayoutSpec

```js
{ dir:'vertical'|'horizontal', gap:number, align:'start'|'center'|'end'|'stretch',
  justify:'start'|'center'|'end'|'between',
  columns:number|null, padding:{top,right,bottom,left}|number }
```

### Fill

```js
{ kind:'none' }
{ kind:'color',  color:string, opacity:number }
{ kind:'linear', angle:number, stops:[{ offset:number, color:string }] }
{ kind:'radial', cx:number, cy:number, r:number, stops:[...] }
{ kind:'material', material:string, angle:number, stops:[...], params:{...} }
```

`color` is always normalized to lowercase `#rrggbb`. `stops` offsets are 0..1,
sorted ascending.

### PanelStyle / GroupStyle

```js
{ fill: Fill|null, stroke:{ color:string, width:number, dash:number[] }|null,
  radius:number, shadow:{ dx,dy,blur,spread,color }|null, opacity:number,
  size:{ width:number|null, height:number|null } }
```

### TextStyle

```js
{ content:string, size:number, weight:number, family:string, color:string,
  align:'left'|'center'|'right', lineHeight:number, tracking:number,
  uppercase:boolean, maxLines:number|null }
```

### Light

```js
{ angle:number, blur:number, opacity:number, color:string }
```
A light is not decoration: `solve()` uses it to cast every panel shadow at the same
angle, so shadows agree with each other. That is the only "the engine owns the
physics" claim v0.1 makes, and it is true.

## Layout (solver output)

```js
Layout = {
  width:number, height:number,
  background: Fill|null,
  light: Light|null,
  nodes: LayoutNode[]     // flat, paint order (parents before children)
}

LayoutNode = {
  id:string, type:string,
  box: Rect,              // absolute canvas px
  contentBox: Rect,       // after padding
  style: PanelStyle,      // normalized
  text: TextStyle|null,
  icon: string|null,
  label: string|null,
  children: LayoutNode[]  // nested, same objects as entries in Layout.nodes
}
Rect = { x:number, y:number, w:number, h:number }
```

## DrawOp / renderSvg

```js
DrawOp = { kind:'rect'|'text'|'icon'|'image', rect:Rect, ...kindSpecific }
renderSvg(layout, { pretty:boolean=true }) -> string
```
`renderSvg` output must contain no timestamps, no random ids, and must be stable
across runs. `<defs>` are emitted once, ids prefixed `wrt-`.

## Procedural texture API (`src/texture.js`)

```js
generateTexture({ kind, size=512, seed=1, params={} })
  -> { width:number, height:number, rgba:Uint8ClampedArray }
```
Every `kind` MUST be **seamlessly tileable** (periodic lattice / periodic cell wrap).
Kinds: `ruido`, `fbm`, `voro`, `madera`, `metal`, `marmol`, `asfalto`, `tejido`, `piedra`, `panal`.

## PNG encoder (`src/png.js`)

```js
encodePng({ width, height, data }) -> Buffer
```
`data` is `Uint8Array|Uint8ClampedArray` of `width*height*4` RGBA bytes. Colour type 6,
bit depth 8, filter 0 on every scanline, single IDAT, `zlib.deflateSync`.
No third-party encoder.

## Control maps (`src/controlmaps.js`)

```js
compileControlMaps(layout, { width=layout.width, height=layout.height, seed=1, sensitivity=0.08 })
  -> {
       width, height,
       depth:       { width, height, rgba },   // grayscale, brighter = nearer
       edges:       { width, height, rgba },   // grayscale, white = edge
       segmentation: { width, height, rgba, index:{ id:string -> [r,g,b] } },
       json: { width, height, seed, sensitivity, nodes:[{id,type,box,depth}] }
     }
```
This is the honest bridge to a diffusion backend: WritterArt compiles geometry and
hands over control maps. It never ships a renderer, never ships weights, never calls
an API. A separate adapter (out of scope) feeds these to ControlNet / Flux.

## Public API (`src/index.js`)

```js
export { tokenize } from './tokenize.js'
export { parse } from './parse.js'
export { validate } from './validate.js'
export { canonicalJSON, hashScene } from './hash.js'
export { createRng } from './rng.js'
export { solve } from './layout/solve.js'
export { buildDrawList } from './render/draw.js'
export { renderSvg } from './render/svg.js'
export { generateTexture } from './texture.js'
export { encodePng } from './png.js'
export { compileControlMaps } from './controlmaps.js'
export { VOCABULARY, SPEC, materialNames, lightPresets, stylePresets } from './vocabulary.js'
export { render } from './render/index.js'   // parse+validate+solve+svg in one call
```
`render(source, opts) -> { ok, svg, layout, scene, errors }` and must never throw.

## CLI (`src/cli.js`)

```
wrt spec                              print the grammar
wrt vocabulary [--json]               print materials/lights/styles/aliases
wrt validate <file...>                exit 0 ok, 1 diagnostics, 2 bad usage
wrt render <file> [-o out.svg]        deterministic SVG to stdout or file
wrt hash <file>                       print canonical hash
wrt texture <kind> [-o out.png] [--size N] [--seed N]
wrt control <file> [-o dir] [--scale N]
```
Human output goes to stdout, diagnostics to stderr. `-` means stdin.
Exit codes: 0 ok, 1 diagnostics, 2 usage error.

## MCP server (`src/mcp/server.js`)

Zero-dependency JSON-RPC 2.0 over stdio. Speaks the MCP `initialize` handshake
(`protocolVersion` echoed back, `capabilities.tools`) and exposes exactly:

- `validate_scene`  -> ValidateResult
- `render_scene`    -> { svg, hash, width, height }
- `compile_control_maps` -> writes PNGs next to a target dir, returns paths + json
- `describe_spec`   -> { grammar, vocabulary summary, diagnostics codes }
- `generate_texture`-> { path | base64 }

Every tool description must be written for an LLM caller: state what it is for, what
it cannot do, and return `hint`/`near` verbatim.