/**
 * Engine-agnostic input for Three.js / raw-canvas games (Phaser games use scene.input instead).
 *   const input = createInput(canvas);
 *   each frame: input.axis() -> {x,y}, input.pressed('Space'), input.down('KeyW'), input.mouse
 *   call input.endFrame() at the end of every frame.
 */
export function createInput(target: HTMLElement = document.body) {
  const down = new Set<string>();
  const pressed = new Set<string>();
  const released = new Set<string>();
  const mouse = { x: 0, y: 0, nx: 0, ny: 0, down: false, pressed: false, right: false };
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => { down.delete(e.code); released.add(e.code); });
  window.addEventListener('blur', () => down.clear());
  target.addEventListener('pointermove', (e) => {
    const r = target.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    mouse.nx = (mouse.x / r.width) * 2 - 1; mouse.ny = -((mouse.y / r.height) * 2 - 1);
  });
  target.addEventListener('pointerdown', (e) => { if (e.button === 2) mouse.right = true; else { mouse.down = true; mouse.pressed = true; } });
  window.addEventListener('pointerup', (e) => { if (e.button === 2) mouse.right = false; else mouse.down = false; });
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  const pad = () => navigator.getGamepads?.().find((g) => g) ?? null;
  const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);

  return {
    mouse,
    down: (code: string) => down.has(code),
    pressed: (code: string) => pressed.has(code),
    released: (code: string) => released.has(code),
    anyPressed: (...codes: string[]) => codes.some((c) => pressed.has(c)),
    /** WASD/arrows/left stick, normalized. y is +down (screen space). */
    axis() {
      let x = 0, y = 0;
      if (down.has('KeyA') || down.has('ArrowLeft')) x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1;
      if (down.has('KeyW') || down.has('ArrowUp')) y -= 1;
      if (down.has('KeyS') || down.has('ArrowDown')) y += 1;
      const g = pad();
      if (g) { x += dz(g.axes[0]); y += dz(g.axes[1]); }
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    },
    gamepad: pad,
    endFrame() { pressed.clear(); released.clear(); mouse.pressed = false; },
  };
}
export type Input = ReturnType<typeof createInput>;
