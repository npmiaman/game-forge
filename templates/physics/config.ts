/** Every tuning number. Open with ?tune to edit live. */
export const TITLE = '{{TITLE}}';
export const SLUG = '{{SLUG}}';
export const W = 1280;
export const H = 720;
export const GROUND = H - 40;

export const SHOT = { power: 0.13, maxPull: 160, shots: 3, ballRadius: 16, ballDensity: 0.004, settleSeconds: 5 };
export const BREAK = { targetImpact: 3.2, blockImpact: 9 };   // relative speed needed to pop a target / crack a block
export const ANCHOR = { x: 200, y: GROUND - 160 };

/** Structures: each piece is [type, x, y]. Types: 'post' (tall), 'beam' (wide), 'box', 'target'. */
export type Piece = ['post' | 'beam' | 'box' | 'target', number, number];
const tower = (x: number, floors: number): Piece[] => {
  const out: Piece[] = [];
  for (let f = 0; f < floors; f++) {
    const y = GROUND - 50 - f * 118;
    out.push(['post', x - 40, y], ['post', x + 40, y], ['beam', x, y - 59], ['target', x, y + 25]);
  }
  return out;
};
export const LEVELS: Piece[][] = [
  [...tower(900, 2), ['box', 1080, GROUND - 20], ['box', 1080, GROUND - 60], ['target', 1080, GROUND - 100]],
  [...tower(820, 3), ...tower(1050, 2)],
];
