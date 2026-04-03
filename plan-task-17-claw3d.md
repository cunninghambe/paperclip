# Task 17: Claw3D 3D Office UI — Implementation Plan

## Overview
Build a React Three Fiber 3D office visualization showing agents at virtual desks with real-time status indicators.

---

## Phase 1: Dependencies & Setup (~15 min)

### 1.1 Install React Three Fiber Stack
```bash
cd ui && npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

**Version pins (critical for R3F + React 19 compatibility):**
- `three`: `^0.172.0` (latest stable)
- `@react-three/fiber`: `^8.17.0` (React 19 support added in 8.15+)
- `@react-three/drei`: `^9.117.0` (helper components)
- `@types/three`: `^0.172.0` (must match three version)

### 1.2 Vite Config Check
Verify `vite.config.ts` doesn't need changes — R3F works out of the box with Vite.

---

## Phase 2: API Layer (~20 min)

### File: `ui/src/api/office.ts` (~60 lines)

**Purpose:** Fetch agent data formatted for 3D office layout.

```typescript
// Types
export interface OfficeAgent {
  id: string;
  name: string;
  shortname: string;
  status: 'active' | 'paused' | 'idle' | 'error';
  avatarUrl?: string;
  currentTask?: string;
  deskPosition?: { x: number; z: number }; // Optional override
}

export interface OfficeLayout {
  agents: OfficeAgent[];
  gridSize: { rows: number; cols: number };
}

// API calls
export const officeApi = {
  getLayout: (companyId: string) => api.get<OfficeLayout>(`/companies/${companyId}/office-layout`),
};

// Query keys
export const officeKeys = {
  layout: (companyId: string) => ['office', 'layout', companyId] as const,
};
```

**Note:** Backend may not have `/office-layout` endpoint yet. Plan for fallback: transform existing `/agents` response into OfficeLayout shape.

---

## Phase 3: Layout Utilities (~20 min)

### File: `ui/src/components/office/layout-utils.ts` (~80 lines)

**Purpose:** Calculate 3D grid positions for agent desks.

```typescript
export interface DeskPosition {
  x: number;
  y: number;  // Always 0 for floor level
  z: number;
}

export function calculateDeskLayout(
  agentCount: number,
  options?: { spacing?: number; maxCols?: number }
): DeskPosition[];

export function getDeskDimensions(): { width: number; depth: number; height: number };

export function getOfficeFloorDimensions(deskCount: number): { width: number; depth: number };
```

**Layout algorithm:**
- Default 4 desks per row
- 3-unit spacing between desks
- Centered around origin (0, 0, 0)
- Expandable grid based on agent count

---

## Phase 4: 3D Components (~90 min)

### 4.1 File: `ui/src/components/office/AgentDesk.tsx` (~150 lines)

**Purpose:** Single agent desk with status indicator and hover interaction.

```typescript
interface AgentDeskProps {
  agent: OfficeAgent;
  position: [number, number, number];
  onSelect?: (agent: OfficeAgent) => void;
}
```

**Visual elements:**
- Desk mesh (box geometry, wood-like material)
- Monitor mesh (thin box, dark screen)
- Chair mesh (simplified)
- Status orb (floating sphere above desk, color-coded)
- Name label (Html component from drei)

**Status colors:**
- `active`: green (#22c55e)
- `paused`: amber (#f59e0b)
- `idle`: gray (#6b7280)
- `error`: red (#ef4444)

### 4.2 File: `ui/src/components/office/OfficeCanvas.tsx` (~120 lines)

**Purpose:** Main Three.js canvas container with camera, lighting, and controls.

```typescript
interface OfficeCanvasProps {
  agents: OfficeAgent[];
  onAgentSelect?: (agent: OfficeAgent) => void;
}
```

**Scene setup:**
- `<Canvas>` with `shadows` enabled
- `<OrbitControls>` for pan/zoom/rotate
- `<ambientLight>` intensity 0.5
- `<directionalLight>` for shadows
- `<gridHelper>` for floor reference
- `<Environment>` preset (optional, from drei)

**Camera:**
- PerspectiveCamera, fov 50
- Initial position: [15, 15, 15] looking at origin
- Min/max zoom bounds

### 4.3 File: `ui/src/components/office/AgentPresenceSummary.tsx` (~50 lines)

**Purpose:** 2D overlay showing counts by status.

```typescript
interface AgentPresenceSummaryProps {
  agents: OfficeAgent[];
}
```

**UI:**
- Fixed position overlay (top-right of canvas)
- Status chips: "5 active", "2 paused", etc.
- Uses existing Badge component styling

---

## Phase 5: Page Component (~40 min)

### File: `ui/src/pages/OfficePage.tsx` (~100 lines)

**Purpose:** Route component wrapping the 3D canvas.

```typescript
export default function OfficePage() {
  const { companyId } = useCompany();
  useBreadcrumbs('3D Office');

  const { data, isLoading, error } = useQuery({
    queryKey: officeKeys.layout(companyId!),
    queryFn: () => officeApi.getLayout(companyId!),
    enabled: !!companyId,
  });

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} />;
  if (!data?.agents.length) return <EmptyState ... />;

  return (
    <div className="h-full w-full relative">
      <OfficeCanvas agents={data.agents} />
      <AgentPresenceSummary agents={data.agents} />
    </div>
  );
}
```

**State:**
- Selected agent (for panel display)
- Camera position (optional persistence)

---

## Phase 6: Route & Navigation (~15 min)

### 6.1 Modify: `ui/src/App.tsx` (~5 lines)

Add inside `boardRoutes()`:
```typescript
<Route path="office" element={<OfficePage />} />
```

Import at top:
```typescript
import OfficePage from './pages/OfficePage';
```

### 6.2 Modify: `ui/src/components/Sidebar.tsx` (~10 lines)

Add nav item in Company section (after Org Chart):
```typescript
<SidebarNavItem
  to={`/${companyPrefix}/office`}
  label="3D Office"
  icon={Building2}
/>
```

Import:
```typescript
import { Building2 } from 'lucide-react';
```

---

## Phase 7: Package.json Update (~5 min)

### Modify: `ui/package.json`

Add to `dependencies`:
```json
"three": "^0.172.0",
"@react-three/fiber": "^8.17.0",
"@react-three/drei": "^9.117.0"
```

Add to `devDependencies`:
```json
"@types/three": "^0.172.0"
```

---

## File Summary

| File | Lines | Type |
|------|-------|------|
| `ui/src/api/office.ts` | ~60 | Create |
| `ui/src/components/office/layout-utils.ts` | ~80 | Create |
| `ui/src/components/office/AgentDesk.tsx` | ~150 | Create |
| `ui/src/components/office/OfficeCanvas.tsx` | ~120 | Create |
| `ui/src/components/office/AgentPresenceSummary.tsx` | ~50 | Create |
| `ui/src/pages/OfficePage.tsx` | ~100 | Create |
| `ui/src/App.tsx` | +5 | Modify |
| `ui/src/components/Sidebar.tsx` | +10 | Modify |
| `ui/package.json` | +4 | Modify |
| **Total** | **~580** | |

---

## TypeScript Considerations for React Three Fiber

### Type Imports
```typescript
// Three.js types
import type { Mesh, Group } from 'three';
import type { ThreeEvent } from '@react-three/fiber';

// Drei component types
import { Html, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
```

### Common Patterns

**1. Ref typing for meshes:**
```typescript
const meshRef = useRef<Mesh>(null);
```

**2. Event typing:**
```typescript
const handleClick = (event: ThreeEvent<MouseEvent>) => {
  event.stopPropagation();
  // ...
};
```

**3. useFrame typing:**
```typescript
import { useFrame } from '@react-three/fiber';
useFrame((state, delta) => {
  // state.clock, state.camera, etc.
});
```

**4. JSX intrinsic elements (no imports needed):**
```tsx
<mesh position={[0, 0, 0]}>
  <boxGeometry args={[1, 1, 1]} />
  <meshStandardMaterial color="orange" />
</mesh>
```

### Strict Mode Considerations
- R3F components work in React StrictMode
- `useFrame` callbacks run outside React lifecycle
- Refs are preferred over state for animated values

---

## Test Strategy

### Unit Tests (Vitest)
1. `layout-utils.test.ts`
   - Grid calculation edge cases (0, 1, 5, 20 agents)
   - Spacing calculations
   - Dimension calculations

2. `office.test.ts` (API)
   - Response transformation
   - Fallback behavior when endpoint missing

### Integration Tests
3. `OfficePage.test.tsx`
   - Renders loading skeleton
   - Renders empty state when no agents
   - Renders canvas when data loaded
   - Mock WebGL context (use `jest-webgl-canvas-mock` or skip canvas tests)

### Manual E2E Tests
4. Visual validation:
   - Desks render at correct positions
   - Status colors are correct
   - Orbit controls work (pan, zoom, rotate)
   - Hover/click interactions
   - Responsive on window resize

### Performance Tests
5. Stress test with 50+ agents
   - Frame rate stays above 30 FPS
   - No memory leaks on unmount

---

## Reviewer Checklist

### Functionality
- [ ] Route `/office` loads OfficePage
- [ ] Sidebar shows "3D Office" nav item with Building2 icon
- [ ] 3D canvas renders without console errors
- [ ] Agents display at desks with correct status colors
- [ ] OrbitControls work (rotate, pan, zoom)
- [ ] Click on desk triggers agent selection
- [ ] Presence summary shows correct counts
- [ ] Empty state shows when no agents

### Code Quality
- [ ] All TypeScript strict checks pass
- [ ] No `any` types (except justified edge cases)
- [ ] Components follow existing naming conventions
- [ ] Imports use absolute paths (`@/` alias if configured)
- [ ] No console.log statements left

### Performance
- [ ] Canvas disposes properly on unmount
- [ ] No unnecessary re-renders (React DevTools check)
- [ ] Geometries/materials are reused, not recreated

### Accessibility
- [ ] Canvas has `role="img"` and `aria-label`
- [ ] Summary overlay is keyboard accessible
- [ ] Status colors have sufficient contrast

### Browser Compatibility
- [ ] Works in Chrome, Firefox, Safari
- [ ] WebGL fallback message for unsupported browsers

### Dependencies
- [ ] package.json versions are pinned correctly
- [ ] No duplicate three.js instances (check bundle)
- [ ] Lock file updated (npm ci works)

---

## Risks & Gotchas

### 1. React 19 Compatibility
**Risk:** R3F 8.15+ required for React 19 concurrent features.
**Mitigation:** Pin to `@react-three/fiber@^8.17.0` or higher.

### 2. WebGL Context Limits
**Risk:** Browser limits concurrent WebGL contexts (~8-16).
**Mitigation:** Dispose canvas on unmount, don't render when tab hidden.

```typescript
// In OfficeCanvas.tsx
useEffect(() => {
  return () => {
    // Canvas auto-disposes, but verify in tests
  };
}, []);
```

### 3. Bundle Size
**Risk:** Three.js adds ~500KB to bundle.
**Mitigation:**
- Use tree-shaking (Vite handles this)
- Lazy load OfficePage: `const OfficePage = lazy(() => import('./pages/OfficePage'))`
- Consider splitting office components into separate chunk

### 4. Missing Backend Endpoint
**Risk:** `/office-layout` API may not exist.
**Mitigation:** Implement fallback in `office.ts`:
```typescript
export async function getOfficeLayout(companyId: string): Promise<OfficeLayout> {
  try {
    return await api.get(`/companies/${companyId}/office-layout`);
  } catch {
    // Fallback: transform agents list
    const agents = await agentsApi.list(companyId);
    return transformAgentsToLayout(agents);
  }
}
```

### 5. HMR Issues with Three.js
**Risk:** Hot module replacement can leave orphaned WebGL resources.
**Mitigation:** Full page refresh when editing 3D components during dev.

### 6. SSR Incompatibility
**Risk:** Three.js requires `window` object.
**Mitigation:** Not an issue (Vite SPA), but if SSR added later, use dynamic import.

### 7. Mobile Touch Controls
**Risk:** OrbitControls touch events may conflict with scroll.
**Mitigation:** Add `touch-action: none` to canvas container CSS.

---

## Dependency Versions (Pin These)

```json
{
  "dependencies": {
    "three": "^0.172.0",
    "@react-three/fiber": "^8.17.0",
    "@react-three/drei": "^9.117.0"
  },
  "devDependencies": {
    "@types/three": "^0.172.0"
  }
}
```

**Why these versions:**
- `three@0.172.0`: Latest stable as of April 2026
- `@react-three/fiber@8.17.0`: Full React 19 support, reconciler fixes
- `@react-three/drei@9.117.0`: Compatible with fiber 8.17, includes Html, OrbitControls, Environment
- `@types/three`: Must match three.js major.minor version

---

## Implementation Order

1. **Phase 7** first — install dependencies, verify build works
2. **Phase 2** — API layer (can mock data initially)
3. **Phase 3** — Layout utilities (pure functions, easy to test)
4. **Phase 4** — 3D components (iterative, visual feedback)
5. **Phase 5** — Page component (wire everything together)
6. **Phase 6** — Route and sidebar (final integration)
7. **Tests** — Unit tests for utils, manual 3D tests

---

## Estimated Time

| Phase | Time |
|-------|------|
| 1. Dependencies | 15 min |
| 2. API Layer | 20 min |
| 3. Layout Utils | 20 min |
| 4. 3D Components | 90 min |
| 5. Page Component | 40 min |
| 6. Route & Nav | 15 min |
| 7. Testing | 30 min |
| **Total** | **~4 hours** |

---

## Open Questions

1. **Agent avatars:** Should desks show agent avatar images? (Requires texture loading)
2. **Desk customization:** Should agents have assigned desk positions, or auto-layout only?
3. **Real-time updates:** Should agent status update live via polling or WebSocket?
4. **Navigation:** Click desk → open agent detail in panel, or navigate to agent page?
5. **Backend endpoint:** Create new `/office-layout` or reuse `/agents`?

---

*Plan created: 2026-04-02*
*Ready for developer implementation*
