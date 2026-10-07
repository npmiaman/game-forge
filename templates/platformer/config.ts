/** Tuning + level data. Change numbers, reload, feel it. */
export const TITLE = '{{TITLE}}';
export const SLUG = '{{SLUG}}';
export const W = 960;
export const H = 540;
export const TILE = 36;   // 18px Kenney tiles × 2

export const PLAYER = {
  runSpeed: 260,
  accelGround: 2600,
  accelAir: 1500,
  friction: 3200,
  jumpVelocity: 620,
  jumpCut: 0.45,        // velocity multiplier when jump is released early (variable jump height)
  coyoteTime: 0.1,      // seconds you can still jump after walking off a ledge
  jumpBuffer: 0.12,     // seconds a jump press is remembered before landing
  maxFall: 900,
  lives: 3,
};

export const PALETTE = {
  sky: 0x5fb4ff, skyBottom: 0xc8e8ff, ground: 0x5b3a7a, groundTop: 0x9b6bd6,
  player: 0x66e0ff, coin: 0xffd23f, spike: 0xff4d6d, enemy: 0x7dff6b, flag: 0xffffff,
};

/**
 *  # ground   c coin   ^ spikes   E enemy   P player start   F goal flag
 *  Every row must be the same length.
 */
export const LEVEL = [
  '                                                                                                    ',
  '                                                                                                    ',
  '                                                                                                    ',
  '                                                                                                    ',
  '                                                                                                    ',
  '                                                                                                    ',
  '                                                                                                    ',
  '                                                                       c c c                        ',
  '                                    c c c                             #######                       ',
  '                                   #######                                                          ',
  '                    c                                    c c                                    F   ',
  '                   ###          c c         E          ######        E           c  c  c      ####  ',
  '        c c                    #####      #####                    #####       ##########          ',
  '  P    #####          c                                    E                                        ',
  '                     ###              c c          ^^     ####   ^^^       c                        ',
  '#############     #########   ###############   ###########   #########  ####  ^^^ ##############',
  '#############^^^^^#########^^^###############^^^###########^^^#########^^####^^###^##############',
];
