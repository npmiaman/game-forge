import Phaser from 'phaser';
import { text, button } from '@kit/phaser/ui';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { rng } from '@kit/rng';
import { makeArt } from '../art';
import { W, H, C } from '../config';
import { ENEMIES } from '../data';
import { save } from './GameOver';

export class Menu extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    makeArt(this);
    this.add.tileSprite(0, 0, W, H, 'grid').setOrigin(0).setAlpha(0.35);

    // drifting swarm in the background
    const kinds = Object.values(ENEMIES).filter((d) => d.r < 40);
    for (let i = 0; i < 40; i++) {
      const d = rng.pick(kinds);
      const img = this.add.image(rng.range(0, W), rng.range(0, H), d.tex).setTint(d.color).setBlendMode('ADD').setAlpha(0.35).setScale(rng.range(0.6, 1.2));
      this.tweens.add({ targets: img, x: img.x + rng.range(-200, 200), y: img.y + rng.range(-200, 200), angle: rng.range(-180, 180), duration: rng.range(4000, 9000), yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    const ship = this.add.image(W / 2, H / 2 + 20, 'player').setTint(C.player).setBlendMode('ADD').setScale(2).setRotation(-Math.PI / 2);
    this.tweens.add({ targets: ship, y: ship.y - 12, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.image(W / 2, H / 2, 'vignette');

    const title = text(this, W / 2, 150, 'NEON SWARM', { size: 96, color: '#33f0ff', shadow: true });
    this.tweens.add({ targets: title, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    text(this, W / 2, 222, 'SURVIVE  ·  UPGRADE  ·  CHAIN REACT', { size: 16, color: '#b26bff' });

    const start = () => {
      sfx.play('select');
      if (!music.playing) music.play(SONGS.synthwave);
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Play'));
    };
    const b = button(this, W / 2, 470, 'PLAY', start, { size: 34, pad: 18 });
    this.tweens.add({ targets: b, alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
    text(this, W / 2, 530, 'click  ·  SPACE  ·  ENTER  ·  gamepad A', { size: 12, color: '#667' });

    text(this, W / 2, 600, 'WASD move   ·   MOUSE aim (auto-fire)   ·   SPACE / SHIFT / RIGHT-CLICK dash', { size: 14, color: '#aab4ff' });
    text(this, W / 2, 628, 'ESC pause   ·   M mute   ·   T auto-aim   ·   touch: drag to move, double-tap to dash', { size: 12, color: '#667' });

    const best = save.get('best');
    if (best > 0) text(this, W / 2, 680, `BEST ${best.toLocaleString()}   ·   WAVE ${save.get('bestWave')}   ·   ${save.get('runs')} RUNS`, { size: 13, color: '#ffe14d' });

    const back = text(this, 20, 20, '← ARCADE', { size: 13, color: '#667', origin: [0, 0] }).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => (location.href = '../../'));
    const mute = text(this, W - 20, 20, '', { size: 13, color: '#667', origin: [1, 0] }).setInteractive({ useHandCursor: true });
    const upd = () => mute.setText(audio.muted ? 'SOUND OFF' : 'SOUND ON');
    upd();
    mute.on('pointerup', () => { audio.toggleMute(); upd(); });

    const kb = this.input.keyboard!;
    kb.once('keydown-SPACE', start);
    kb.once('keydown-ENTER', start);
    kb.on('keydown-M', () => { audio.toggleMute(); upd(); });
    this.input.gamepad?.once('down', start);
  }
}
