export const TITLE = '{{TITLE}}';
export const SLUG = '{{SLUG}}';
export const W = 1280;
export const H = 720;
export const MOVE_MS = 90;

/**
 * Levels in standard Sokoban notation:
 *   # wall   . goal   $ box   * box on goal   @ player   + player on goal   (space) floor
 * Add levels by appending to this list. Keep them solvable — test each with the bot or by hand.
 */
export const LEVELS: string[][] = [
  [
    '#######',
    '#     #',
    '# @$ .#',
    '#     #',
    '#######',
  ],
  [
    '########',
    '#  .   #',
    '# $$ @ #',
    '#  .   #',
    '########',
  ],
  [
    '  ##### ',
    '###   # ',
    '#.@$  # ',
    '### $.# ',
    '#.##$ # ',
    '# # . ##',
    '#$ *$$.#',
    '#   .  #',
    '########',
  ],
];

export const COLORS = { wall: 0x7a5cff, floor: 0x10142a, goal: 0x5dffa0, box: 0xffb84d, boxDone: 0x5dffa0, player: 0x33f0ff };
