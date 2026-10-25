# WIZARD CHESS 3D — Enforced Landscape Auto-Rotation, Ultra-Minimal Start Menu & Production Rewarded Video Ads

This update enforces 100% horizontal Landscape gameplay even when a phone is held vertically in Portrait mode (by auto-rotating the entire game viewport 90° with full 3D touch coordinate mapping), replaces the cluttered multi-box Start Screen with a clean, ultra-minimal glass card, and configures Unity Ads strictly for live Production Rewarded Ads (`Game ID: 800410658`, `BP_Rewarded_Android`, `testMode: false`) on **Undo** and **Hint** only.

## User Review & Critical Decisions

> [!IMPORTANT]
> Summary of your confirmed choices from our clarification step:

- **Confirmed Decision 1 (Always-Landscape Auto-Rotation)**: Whenever `window.innerHeight > window.innerWidth` (a phone held vertically in Portrait mode), the entire game stage automatically rotates `90°` into horizontal Landscape (`width: 100vh; height: 100vw; transform: rotate(90deg)`) and remaps Three.js touch/pointer coordinates so the game never enters a cramped vertical portrait layout.
- **Confirmed Decision 2 (Ultra-Minimal Start Menu)**: Strip out all numbered headings (`01 / 02 / 03`), nested inner boxes, and multi-line sub-descriptions (`Single-Player Sanctum Duel`, `Novice`, `Tactical`, etc.). Present one clean, compact dark-glass card with single-line segmented pills (`Player vs AI | 2 Players`, `Beginner | Professional | Grandmaster`, `♔ White | ♚ Black`) and a `START MATCH` button.
- **Confirmed Decision 3 (Rewarded Ads Only — Production Mode)**: Trigger only `BP_Rewarded_Android` (`Game ID: 800410658`, `testMode: false`) when tapping **Undo** or **Hint**. Remove interstitial ads on New Game, remove all "Test Ad" / "Realm of Kings" mock banners, and automatically apply the Undo or Hint reward as soon as the 5-second Rewarded Video Ad finishes.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **True Landscape Lock Everywhere**: Whether opened on an Android phone with auto-rotate off, in Chrome mobile, or in an installed APK/PWA, the game viewport is always rendered in widescreen horizontal Landscape.
  2. **Minimalist Start Menu**: A sleek, zero-clutter glass card over the live 3D Gothic Sanctum chessboard that lets players start a match in 1 tap.
  3. **Production Unity Rewarded Video Ads (`800410658`)**: Tapping **Undo** or **Hint** calls the Unity Ads SDK 4.x `BP_Rewarded_Android` placement (`testMode: false`) and immediately grants the Undo or Hint upon completion.

---

## 2. User Experience & Visual Design

- **Ultra-Minimal Start Screen Layout**:
  - **Single Surface Elevation**: One clean dark-glass card (`max-width: 460px`, `padding: 22px 26px`, `border-radius: 18px`) with no inner bordered sub-panels or mechanical `01 / 02 / 03` prefixes.
  - **Top Row**: `♔ WIZARD CHESS 3D` title on the left + compact icon button `⚙` (Settings) on the right.
  - **Segmented Control Rows (Single-Line Only)**:
    - **Row 1 (Mode)**: `Player vs AI` | `Player vs Player`
    - **Row 2 (Difficulty — shown in vs AI mode)**: `Beginner` | `Professional` | `Grandmaster`
    - **Row 3 (Side — shown in vs AI mode)**: `♔ White` | `♚ Black`
  - **Primary CTA**: Full-width gold `START MATCH` button.
- **In-Match Top & Bottom HUD**:
  - **Top Bar**: Turn indicator on the left, **3D Gold Chronometer Stopwatch** (`MM:SS` count-up timer) in the center, and compact `⏸` / `⚙` buttons on the right.
  - **Bottom Bar**: Compact single-row pill dock (`Undo`, `Hint`, `Flip`, `Player`, `Top`, `Side`, `Wide`) with zero scrollbars.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: CSS 90° Stage Rotation + 3D Raycast Coordinate Remapping**
  - *Chosen Approach*: When `window.innerHeight > window.innerWidth`, apply a forced 90° clockwise rotation to `#landscape-stage` (`width: 100vh; height: 100vw`) and translate pointer events `(clientX, clientY)` into landscape space `(landscapeX = clientY, landscapeY = innerWidth - clientX)` for both Three.js `Raycaster` and `OrbitControls`.
  - *Why*: Mobile browsers block `screen.orientation.lock('landscape')` unless already in native fullscreen. Rotating the stage in CSS + remapping pointer math guarantees 100% Landscape gameplay on every phone immediately on page load.
- **Decision 2: Rewarded Video Ads Only (`BP_Rewarded_Android`)**
  - *Chosen Approach*: Remove `BP_Interstitial_Android` triggers from New Game so ads only play when the player explicitly taps **Undo** or **Hint**, and auto-grant the reward immediately when the 5-second video completes.
  - *Why*: Matches your requirement that only Rewarded Ads should appear, with zero test-ad banners or extra clicks required after watching.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌─────────────────────────────────────────────────────────────────────────┐
│             #landscape-stage (100% Forced Landscape Wrapper)            │
│   If Portrait (H > W): width=100vh, height=100vw, rotate(90deg)         │
│   Remaps Pointer (clientX, clientY) -> (clientY, W - clientX)           │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│   Ultra-Minimal Start Card            │ │   Active Match HUD            │
│  • Title + ⚙ Settings Icon           │ │  • Top: Turn + 3D Stopwatch   │
│  • [Player vs AI] [Player vs Player]  │ │    (MM:SS) + [⏸] [⚙]         │
│  • [Beginner][Professional][Grandm.]  │ │  • Bottom: [Undo][Hint][Flip] │
│  • [♔ White] [♚ Black]                │ │    [Player][Top][Side][Wide]  │
│  • [       START MATCH       ]        │ └───────────────┬───────────────┘
└───────────────────────────────────────┘                 │
                                                          ▼
                                          ┌───────────────────────────────┐
                                          │ Unity Rewarded Ad SDK 4.x     │
                                          │ Game ID: 800410658            │
                                          │ Placement: BP_Rewarded_Android│
                                          │ testMode: false (Production)  │
                                          │ Auto-executes Undo / Hint     │
                                          └───────────────────────────────┘
```

- **State & Event Flow**:
  1. **Orientation Watcher**: Checks `window.innerHeight > window.innerWidth` on load, resize, and orientation change. Sets `document.body.classList.toggle('force-landscape-rotate', isPortrait)` and resizes the Three.js `WebGLRenderer` to `(Math.max(W, H), Math.min(W, H))`.
  2. **3D Input Remapping**: In `wizardChessEngine.js`, pointer events for piece raycasting and camera orbit automatically transform `(clientX, clientY)` when `force-landscape-rotate` is active so tapping any chess square or dragging the camera works accurately in rotated landscape mode.
  3. **Rewarded Ad Completion**: When the user taps **Undo** or **Hint**, `UnityAds.show('BP_Rewarded_Android')` is invoked (`testMode: false`). When the 5-second rewarded video finishes, it automatically closes and triggers `undoFullRound()` or `showBestMoveHint()`.
