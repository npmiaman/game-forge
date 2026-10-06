import Phaser from 'phaser';
import { text, bar, clock, FONTS } from '@kit/phaser/ui';
import { audio, music } from '@kit/audio';
import { C, W, H } from '../config';
import type { RunState } from './Play';

export class Hud extends Phaser.Scene {
  constructor() { super('Hud'); }

  run!: RunState;
  hearts: Phaser.GameObjects.Image[] = [];
  xpBar!: ReturnType<typeof bar>;
  bossBar!: ReturnType<typeof bar>;
  dashBar!: ReturnType<typeof bar>;
  lvl!: Phaser.GameObjects.Text;
  score!: Phaser.GameObjects.Text;
  combo!: Phaser.GameObjects.Text;
  wave!: Phaser.GameObjects.Text;
  bossLabel!: Phaser.GameObjects.Text;
  mute!: Phaser.GameObjects.Text;
  hurtFx!: Phaser.GameObjects.Rectangle;
  pauseLayer!: Phaser.GameObjects.Container;
  lastMult = 1;
  shownScore = 0;
  lastHp = 0;

  create() {
    this.run = this.registry.get('run');
    this.hearts = [];
    this.shownScore = 0;
    this.lastMult = 1;

    this.add.image(W / 2, H / 2, 'vignette'); // under all HUD elements
    this.xpBar = bar(this, 0, 4, W, 8, C.xp, { bg: 0x0a1a12, border: 0x000000 });
    this.xpBar.set(0, true);
    this.lvl = text(this, 18, 26, 'LV 1', { size: 16, color: '#5dffa0', origin: [0, 0.5] });
    this.score = text(this, W - 20, 30, '0', { size: 30, origin: [1, 0.5] });
    this.combo = text(this, W - 20, 62, '', { size: 16, color: '#ffe14d', origin: [1, 0.5] });
    this.wave = text(this, W / 2, 28, 'WAVE 1', { size: 16, color: '#aab4ff' });
    this.bossLabel = text(this, W / 2, 56, 'HIVE MOTHER', { size: 12, color: '#ff5577' }).setVisible(false);
    this.bossBar = bar(this, W / 2 - 260, 74, 520, 12, 0xff2255, { trail: 0xffe14d }).setVisible(false);
    text(this, W / 2, H - 38, 'DASH', { size: 10, color: '#8899cc' });
    this.dashBar = bar(this, W / 2 - 50, H - 22, 100, 6, C.player, { border: 0x334466 });
    this.mute = text(this, W - 20, H - 20, '', { size: 12, color: '#8899cc', origin: [1, 0.5] });
    this.hurtFx = this.add.rectangle(0, 0, W, H, 0xff0033, 0).setOrigin(0).setBlendMode('ADD');

    const play = this.scene.get('Play');
    const onBanner = (t: string, sub = '', color = 0x33f0ff) => this.banner(t, sub, color);
    const onToast = (t: string) => this.toast(t);
    const onHurt = () => { this.hurtFx.setAlpha(0.35); this.tweens.add({ targets: this.hurtFx, alpha: 0, duration: 450 }); };
    play.events.on('banner', onBanner);
    play.events.on('toast', onToast);
    play.events.on('hurt', onHurt);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { play.events.off('banner', onBanner); play.events.off('toast', onToast); play.events.off('hurt', onHurt); });

    // pause
    this.pauseLayer = this.add.container(0, 0, [
      this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0),
      text(this, W / 2, H / 2 - 80, 'PAUSED', { size: 56, color: '#33f0ff', shadow: true }),
      text(this, W / 2, H / 2, 'ESC resume   ·   Q quit to menu   ·   M mute   ·   T auto-aim', { size: 14, color: '#aab4ff' }),
      text(this, W / 2, H / 2 + 40, 'WASD move · mouse aim · SPACE / SHIFT / right-click dash', { size: 12, color: '#667' }),
    ]).setVisible(false).setDepth(100);
    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-P', () => this.togglePause());
    kb.on('keydown-Q', () => { if (this.pauseLayer.visible) { music.stop(); this.scene.stop('Play'); this.scene.start('Menu'); } });
    kb.on('keydown-M', () => audio.toggleMute());
    const onBlur = () => { if (!this.pauseLayer.visible && this.scene.isActive('Play')) this.togglePause(); };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, onBlur));
  }

  togglePause() {
    if (this.run.over || this.scene.isActive('LevelUp')) return;
    const p = !this.pauseLayer.visible;
    this.pauseLayer.setVisible(p);
    if (p) this.scene.pause('Play'); else this.scene.resume('Play');
  }

  banner(title: string, sub: string, color: number) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const t = text(this, W / 2, H * 0.32, title, { size: 64, color: hex, shadow: true, font: FONTS.display }).setAlpha(0).setScale(1.6);
    const s = text(this, W / 2, H * 0.32 + 52, sub.toUpperCase(), { size: 16, color: '#ffffff' }).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: s, alpha: 0.8, duration: 300, delay: 150 });
    this.tweens.add({ targets: [t, s], alpha: 0, y: '-=30', delay: 1700, duration: 400, onComplete: () => { t.destroy(); s.destroy(); } });
  }

  toast(msg: string) {
    const t = text(this, W / 2, H - 80, msg, { size: 16, color: '#ffffff' }).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: H - 90, duration: 150, yoyo: true, hold: 900, onComplete: () => t.destroy() });
  }

  update(_t: number, dt: number) {
    const R = this.run;
    // hearts
    while (this.hearts.length < R.maxHp) this.hearts.push(this.add.image(26 + this.hearts.length * 30, 56, 'heart').setTint(C.heart).setBlendMode('ADD'));
    this.hearts.forEach((h, i) => {
      const full = i < R.hp;
      h.setAlpha(full ? 1 : 0.18);
      if (R.hp === 1 && full) h.setScale(1 + Math.abs(Math.sin(this.time.now / 180)) * 0.25); else h.setScale(1);
    });
    if (R.hp < this.lastHp) this.hearts[R.hp]?.setScale(1.8);
    this.lastHp = R.hp;

    this.xpBar.set(R.xp / R.xpNext, true);
    this.lvl.setText(`LV ${R.level}`);
    this.shownScore += (R.score - this.shownScore) * Math.min(1, dt / 80);
    if (Math.abs(R.score - this.shownScore) < 1) this.shownScore = R.score;
    this.score.setText(Math.round(this.shownScore).toLocaleString());
    this.combo.setText(R.combo > 1 ? `x${R.mult}  ·  ${R.combo} COMBO` : '');
    if (R.mult !== this.lastMult) {
      if (R.mult > this.lastMult) { this.combo.setScale(1.6); this.tweens.add({ targets: this.combo, scale: 1, duration: 250, ease: 'Back.Out' }); }
      this.lastMult = R.mult;
    }
    this.wave.setText(`WAVE ${R.wave}   ${clock(R.time)}`);
    this.dashBar.set(R.dash, true).setColor(R.dash >= 1 ? C.player : 0x335566);
    const showBoss = !!R.boss;
    this.bossBar.setVisible(showBoss); this.bossLabel.setVisible(showBoss);
    if (R.boss) this.bossBar.set(R.boss.hp / R.boss.max);
    this.mute.setText(audio.muted ? 'SOUND OFF (M)' : '');
  }
}
