/**
 * Mobile controls. Does nothing on devices without touch.
 *
 *   const pad = new TouchPad(this, { buttons: ['JUMP'] });
 *   each frame: pad.x, pad.y (-1..1 floating stick on the left half), pad.down('JUMP'), pad.pressed('JUMP')
 *   call pad.endFrame() at the end of update().
 */
import Phaser from 'phaser';

export class TouchPad {
  x = 0; y = 0;
  readonly enabled: boolean;
  private stickId = -1; private ox = 0; private oy = 0;
  private held = new Set<string>(); private justPressed = new Set<string>();
  private base?: Phaser.GameObjects.Arc; private knob?: Phaser.GameObjects.Arc;

  constructor(private scene: Phaser.Scene, o: { buttons?: string[]; radius?: number } = {}) {
    this.enabled = scene.sys.game.device.input.touch;
    if (!this.enabled) return;
    const R = o.radius ?? 60;
    const { width: W, height: H } = scene.scale;
    this.base = scene.add.circle(0, 0, R, 0xffffff, 0.08).setStrokeStyle(2, 0xffffff, 0.3).setScrollFactor(0).setDepth(1000).setVisible(false);
    this.knob = scene.add.circle(0, 0, R * 0.45, 0xffffff, 0.25).setScrollFactor(0).setDepth(1001).setVisible(false);
    (o.buttons ?? []).forEach((name, i) => {
      const bx = W - 90 - i * 120, by = H - 90;
      const b = scene.add.circle(bx, by, 46, 0xffffff, 0.1).setStrokeStyle(2, 0xffffff, 0.4).setScrollFactor(0).setDepth(1000).setInteractive();
      scene.add.text(bx, by, name, { fontSize: '14px', color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
      b.on('pointerdown', () => { this.held.add(name); this.justPressed.add(name); b.setFillStyle(0xffffff, 0.3); });
      const up = () => { this.held.delete(name); b.setFillStyle(0xffffff, 0.1); };
      b.on('pointerup', up); b.on('pointerout', up);
    });
    scene.input.addPointer(2);
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over.length || p.x > W / 2 || this.stickId >= 0) return;
      this.stickId = p.id; this.ox = p.x; this.oy = p.y;
      this.base!.setPosition(p.x, p.y).setVisible(true); this.knob!.setPosition(p.x, p.y).setVisible(true);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickId) return;
      const dx = p.x - this.ox, dy = p.y - this.oy, d = Math.hypot(dx, dy), k = Math.min(d, R) / (d || 1);
      this.knob!.setPosition(this.ox + dx * k, this.oy + dy * k);
      this.x = (dx * k) / R; this.y = (dy * k) / R;
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickId) return;
      this.stickId = -1; this.x = this.y = 0; this.base!.setVisible(false); this.knob!.setVisible(false);
    });
  }
  down(name: string) { return this.held.has(name); }
  pressed(name: string) { return this.justPressed.has(name); }
  endFrame() { this.justPressed.clear(); }
}
