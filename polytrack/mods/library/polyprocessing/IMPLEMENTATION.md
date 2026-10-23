# PolyProcessing Mod — Implementation Guide

This document captures the architecture, technical decisions, and constraints discovered while implementing the PolyProcessing post-processing mod for PolyTrack.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Xenon Integration](#xenon-integration)
3. [WebGL2 & Three.js Setup](#webgl2--threejs-setup)
4. [PolyProcessing Features](#polyprocessing-features)
5. [Technical Challenges & Solutions](#technical-challenges--solutions)
6. [File Structure](#file-structure)
7. [Known Constraints](#known-constraints)
8. [Future Work](#future-work)

---

## Architecture Overview

### PML (PolyModLoader) System

PolyProcessing is installed as a **PML 0.6.0 mod** in PolyTrack. The mod system uses:

- **Ambient module declaration**: `declare module "https://cdn.polymodloader.com/cb/PolyTrackMods/PolyModLoader/0.6.0/PolyTypes.js"`
- **Lifecycle hooks**: PML discovers hooks via own-property lookup (Object.keys/hasOwnProperty), NOT prototype methods
  - Must use **class field arrow functions** (`init = (pml) => {}`) not prototype methods
  - PML looks for `init`, `postInit`, `preInit` on the mod instance directly

### Module Exports

```typescript
class PolyMod {
  init = (pml: PML): void => { /* runs when mod loads */ };
  postInit = (): void => { /* runs after all mods loaded */ };
  // Must be class fields, not methods!
}
export const polyMod = new PolyMod();
```

### Build Pipeline

- **TypeScript source**: `4.0.0/main.mod.ts`
- **Compiler**: esbuild (not tsc directly)
  - Config: `--bundle=false --format=esm --target=es2022`
  - Output: `4.0.0/main.mod.js`
- **Type checking**: `tsc --noEmit` (separate step)
- **Scripts** in package.json:
  - `npm run build` → esbuild transpilation
  - `npm run typecheck` → TypeScript type checking
  - `npm run watch` → esbuild with file watching

---

## Xenon Integration

### What is Xenon?

Xenon is a **GL-capture library** (dependency mod) that provides access to the WebGL2 context from within the PML ecosystem. It exposes a standardized interface for mods to hook into the rendering pipeline.

### Xenon API (Global Interface)

```typescript
// Detection
var __xenonInstalled: boolean | undefined;

// Context access
var __xenonGetGL: (() => WebGL2RenderingContext | null) | undefined;
var __xenonGetGLSource: (() => string | null) | undefined;

// Context lifecycle
var __xenonRegisterContextCallback:
  | ((cb: (newGL: WebGL2RenderingContext, oldGL: WebGL2RenderingContext | null, source: string) => void) => void)
  | undefined;

// Type checking
var __xenonIsWebGL2: ((gl: WebGL2RenderingContext) => boolean) | undefined;
```

### How PolyProcessing Uses Xenon

1. **Init**: Register a context callback to know when the GL context is ready
2. **Per-frame**: Retrieve the current GL context via `__xenonGetGL()`
3. **Post-render**: Hook into `requestAnimationFrame` to apply post-processing effects

```typescript
__xenonRegisterContextCallback?.((newGL, oldGL, source) => {
  console.log(`GL context available (source: ${source})`);
  // Initialize FX pipelines here
});

// Later, in RAF hook:
const gl = __xenonGetGL?.();
if (gl) {
  // Apply post-processing effects
}
```

---

## WebGL2 & Three.js Setup

### Canvas Configuration

The game uses **Three.js WebGLRenderer** with:
- `antialias: true` (creates MSAA default framebuffer)
- `stencil: true` (creates DEPTH24_STENCIL8, not DEPTH_COMPONENT24)
- `alpha: false` (opaque canvas)

### Default Framebuffer Properties

Can be queried at runtime:
```typescript
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
const sampleBuffers = gl.getParameter(gl.SAMPLE_BUFFERS) as number;
const samples = sampleBuffers > 0 ? (gl.getParameter(gl.SAMPLES) as number) : 1;
const isMSAA = samples > 1;
```

**Critical**: MSAA status affects depth capture (see Depth Map Capture section).

### Three.js Rendering Order

1. Scene renders to default framebuffer (or to texture if using post-processing)
2. Three.js updates are synchronous within RAF callback
3. Mod RAF hooks execute after Three.js rendering is complete
4. Effects are composited back to the canvas

---

## PolyProcessing Features

### 1. FX Pipeline (Color Post-Processing)

**Purpose**: Apply real-time color grading and effects.

**Implementation**:
- Fullscreen quad rendering
- Vertex shader: `VS_FULLSCREEN` (simple NDC triangle, no vertex buffer)
- Fragment shader: `FS_FX` (color processing)
- Input: color texture sampled from default FB
- Output: processed color back to default FB

**Uniforms** (user-adjustable):
- `uExposure`: brightness multiplier
- `uContrast`: contrast adjustment
- `uSaturation`: color saturation
- `uVignette`: edge darkening

**State Management**:
```typescript
gl.__ppFxReady?: boolean;
gl.__ppFxProg?: WebGLProgram;
gl.__ppFxVAO?: WebGLVertexArrayObject;
gl.__ppFxTex?: WebGLTexture;  // Input color texture
gl.__ppFxTexW?: number;
gl.__ppFxTexH?: number;
gl.__ppFxDrawing?: boolean;
gl.__ppLastAppliedTick?: number;  // Prevent duplicate frames
gl.__ppForceDrawOnce?: boolean;   // Force redraw on next RAF
```

### 2. Bloom Pipeline

**Purpose**: Simulate light bloom/glow on bright pixels.

**Implementation**:
1. **Prefilter**: Extract bright pixels above threshold (`FS_BLOOM_PREFILTER`)
   - Samples color texture, outputs pixels > threshold
2. **Downsampling + Blur**: Multi-pass Gaussian blur (`FS_BLOOM_BLUR`)
   - Repeatedly blur and downsample to create glow falloff
3. **Composite**: Blend bloom back onto color using additive blending

**Uniforms**:
- `uThreshold`: brightness cutoff for bloom
- `uIntensity`: bloom contribution to final image
- `uRadius`: blur radius (in texels)

**State Management**:
```typescript
gl.__ppBloomReady?: boolean;
gl.__ppBloomPrefilterProg?: WebGLProgram;
gl.__ppBloomBlurProg?: WebGLProgram;
gl.__ppBloomVAO?: WebGLVertexArrayObject;
gl.__ppBloomTexA?: WebGLTexture;  // Working textures
gl.__ppBloomTexB?: WebGLTexture;
gl.__ppBloomFboA?: WebGLFramebuffer;
gl.__ppBloomFboB?: WebGLFramebuffer;
gl.__ppBloomW?: number;
gl.__ppBloomH?: number;
```

### 3. LUT (Look-Up Table) Color Grading

**Purpose**: Apply a pre-baked color grade via 3D LUT texture.

**Format**: 
- 3D texture (32×32×32 typical)
- Each voxel is an output color for a given input (R, G, B)
- Can be binary (.bin) or PNG (flattened 2D representation)

**Implementation**:
- User picks or clears a LUT file
- Stores as 3D texture in GL context
- Fragment shader samples LUT: `vec3 graded = texture(uLUT, inputColor).rgb`

**State Management**:
```typescript
gl.__ppLutTex?: WebGLTexture;
gl.__ppLutW?: number;
gl.__ppLutH?: number;
gl.__ppLutReady?: boolean;
gl.__ppLutMeta?: LUTMeta | null;
```

**LUTMeta Structure**:
```typescript
interface LUTMeta {
  format: "bin" | "png";
  width: number;
  height: number;
  depth: number;
  name: string;
}
```

### 4. Depth Map Capture

**Purpose**: Export scene depth as a greyscale PNG for use in external tools (e.g., Photoshop depth-of-field).

**Depth Linearization**:
```glsl
float z = d * 2.0 - 1.0;  // NDC depth
float eye = (2.0 * near * far) / (far + near - z * (far - near));
float normalized = (eye - near) / (far - near);
float grey = 1.0 - clamp(normalized, 0.0, 1.0);
```

**Process**:
1. Query default FB MSAA status
2. If MSAA: return error (spec limitation, see constraints)
3. Create depth texture + FBO
4. **Format detection**: Try DEPTH24_STENCIL8 first, fall back to DEPTH_COMPONENT24
5. Blit default FB depth → depth texture FBO
6. Render depth texture through `FS_DEPTH_VIZ` shader to greyscale
7. Read greyscale pixels
8. Flip Y (WebGL is bottom-up, PNG is top-down)
9. Download as PNG

**Y-Flip Loop**:
```typescript
const flipped = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) {
  const src = (h - 1 - y) * w * 4;
  flipped.set(rgba.subarray(src, src + w * 4), y * w * 4);
}
```

### 5. Public API (Console & GUI)

**Global Functions** (callable from browser console):
- `__ppGetSavedSettings()`: Retrieve current settings
- `__ppSetSavedSettings(partial)`: Update settings
- `__ppResetSavedSettings()`: Restore defaults
- `__ppMirrorSettingsToLegacyGlobals(s)`: Copy to legacy global vars (if needed)
- `__ppRequestOneFrame()`: Force redraw next RAF
- `__ppToggleGUI()`: Show/hide settings panel
- `__ppPickLUT()` / `__ppClearLUT()`: Manage LUT texture
- `__ppExportLUTBytes()` / `__ppImportLUTBytes()`: LUT I/O
- `__ppCaptureDepthMap(near?, far?)`: Export depth as PNG

**Settings Object**:
```typescript
interface Settings {
  enabled: boolean;
  fxEnabled: boolean;
  fxExposure: number;
  fxContrast: number;
  fxSaturation: number;
  fxVignette: number;
  bloomEnabled: boolean;
  bloomThreshold: number;
  bloomIntensity: number;
  bloomRadius: number;
  lutEnabled: boolean;
  lutName: string | null;
}
```

**Storage**: LocalStorage key `polyprocessing-settings` (JSON)

---

## Technical Challenges & Solutions

### Challenge 1: PML Lifecycle Hook Discovery

**Problem**: Class prototype methods weren't being called by PML.

**Root Cause**: PML uses `Object.keys()` / `hasOwnProperty()` for own-property lookup, not prototype chain traversal.

**Solution**: Convert prototype methods to **class field arrow functions**:
```typescript
// ❌ Wrong (not discovered by PML)
class Mod {
  init(pml: PML): void { }
}

// ✅ Correct (own property, discoverable)
class Mod {
  init = (pml: PML): void => { };
}
```

### Challenge 2: Depth Capture with MSAA

**Problem**: WebGL2 spec **forbids blitting depth from any MSAA source**, even to another MSAA target.

**Attempted Solutions & Failures**:
1. `readPixels(DEPTH_COMPONENT, FLOAT)` from default FB → INVALID_ENUM in Chrome
2. `blitFramebuffer` default MSAA → single-sample FBO → INVALID_OPERATION
3. `texStorage2DMultisample` for MSAA texture → not a function in Chrome/ANGLE/macOS

**Final Solution**: Early return with clear error message if MSAA detected. User must disable antialiasing:
```typescript
if (isMSAA) {
  console.error("Depth capture requires antialias: false");
  return;
}
```

### Challenge 3: Depth Format Mismatch

**Problem**: Guessing depth format from `contextAttributes.stencil` didn't always match the default FB's actual format.

**Solution**: Try both formats at runtime:
```typescript
const tryFormats = [
  { fmt: gl.DEPTH24_STENCIL8, external: gl.DEPTH_STENCIL, ... },
  { fmt: gl.DEPTH_COMPONENT24, external: gl.DEPTH_COMPONENT, ... },
];

for (const fmt of tryFormats) {
  // Create texture with fmt
  // Try blit
  // If success: break
  // If error: clean up and try next format
}
```

### Challenge 4: PolyModLoader Module Resolution

**Problem**: TypeScript couldn't resolve the PML module from CDN URL.

**Solution**: Create ambient module declaration in `4.0.0/types/pml.d.ts`:
```typescript
declare module "https://cdn.polymodloader.com/cb/PolyTrackMods/PolyModLoader/0.6.0/PolyTypes.js" {
  export class PML { /* ... */ }
  export class PolyMod { /* ... */ }
  // ... other types
}
```

---

## File Structure

```
PolyProcessing/
├── package.json                    # Build config, dependencies
├── tsconfig.json                   # TypeScript configuration
├── IMPLEMENTATION.md               # This file
│
├── 4.0.0/
│   ├── main.mod.ts                # Main source file (~1200 lines)
│   ├── main.mod.js                # Compiled output (60+ KB)
│   │
│   └── types/
│       ├── globals.d.ts           # Global type augmentations
│       │                           # - __pp* globals
│       │                           # - __xenon* globals
│       │                           # - WebGL2RenderingContext.TEXTURE_2D_MULTISAMPLE
│       │
│       └── pml.d.ts               # PML ambient module declaration
│
└── manifest.json                   # Mod metadata (if used by loader)
```

---

## Known Constraints

### WebGL2 Limitations

1. **Depth Blit from MSAA**: Forbidden by spec. No workaround.
   - Solution: Disable antialiasing if depth capture needed

2. **texStorage2DMultisample Unavailable**: Chrome on macOS (ANGLE/Metal backend) doesn't expose this WebGL2 core function.
   - Workaround: Use format fallback for non-MSAA targets

3. **readPixels(DEPTH_COMPONENT, FLOAT)**: Not supported from default framebuffer in Chrome.
   - Workaround: Use blit to texture FBO + readPixels from FBO

### Chrome/ANGLE Specific

- MSAA resolve blits are restricted
- Some depth formats may not be queryable from the default FB (must try/catch)

### Three.js Integration

- Assumes `WebGLRenderer` context, not Canvas API
- Xenon must be installed and have captured the GL context before PolyProcessing init runs
- RAF hook wrapping assumes no conflicting RAF overwrites

---

## Future Work

### Potential Enhancements

1. **Screenshot/Recording Mod** (separate):
   - Capture visible canvas to PNG/video
   - Should capture WITH post-processing effects (they're already on the default FB)
   - Optional: "before effects" variant (more complex, requires hooking before RAF)

2. **Depth of Field in Shader**:
   - Use exported depth map concept but apply DOF as a real-time shader effect
   - Sample depth at each fragment, apply blur based on distance from focus plane

3. **LUT Editor GUI**:
   - Interactive 3D LUT adjustment in-game
   - Preview live color grading

4. **Multi-Pass Rendering**:
   - Separate renderpass for outline/edge detection
   - Composite outlines onto final image

5. **Performance Monitoring**:
   - GPU query timers for each effect
   - Show FPS impact of each feature

### Testing Recommendations

- Test on multiple GPU + browser combos (especially MSAA behavior)
- Verify depth linearization matches expected near/far values
- Check Y-flip correctness (test with text or directional patterns)
- Profile impact on frame time (bloom especially expensive)

---

## Quick Reference: Debugging

### Check if Xenon is Available
```javascript
console.log(__xenonInstalled);
const gl = __xenonGetGL?.();
console.log(gl ? "GL ready" : "GL not ready");
```

### Check Module Installation
```javascript
console.log(__polyprocessingInstalled);
console.log(__ppSettings);
```

### Manual Settings Update
```javascript
__ppSetSavedSettings?.({
  fxEnabled: true,
  fxExposure: 1.2,
  bloomEnabled: true,
});
```

### Force GUI Refresh
```javascript
__ppToggleGUI?.();
__ppToggleGUI?.();
```

### Test Depth Capture
```javascript
__ppCaptureDepthMap?.(0.5, 500.0);  // Custom near/far
```

---

## References

- PML (PolyModLoader): https://cdn.polymodloader.com/cb/PolyTrackMods/PolyModLoader/0.6.0/PolyTypes.js
- Xenon GL Capture: (bundled with PML ecosystem)
- WebGL2 Spec: https://www.khronos.org/registry/webgl/specs/latest/2.0/
- Three.js WebGLRenderer: https://threejs.org/docs/#api/en/renderers/WebGLRenderer
