/**
 * Build a level from ASCII. Each character maps to a handler that receives pixel centre + tile coords.
 *
 *   const lvl = buildLevel(LEVEL_ROWS, 32, {
 *     '#': (x, y) => walls.create(x, y, 'wall'),
 *     'c': (x, y) => coins.create(x, y, 'coin'),
 *     'P': (x, y) => (spawn = { x, y }),
 *   });
 *   lvl.width / lvl.height (pixels), lvl.cols / lvl.rows, lvl.grid (kit Grid<string>)
 * Characters with no handler (like ' ' or '.') are ignored. Rows may differ in length.
 */
import { Grid } from '../grid';

export type TileHandler = (x: number, y: number, tx: number, ty: number, grid: Grid<string>) => void;

export function buildLevel(rows: string[], tile: number, handlers: Record<string, TileHandler>) {
  const grid = Grid.fromAscii(rows);
  grid.forEach((ch, tx, ty) => handlers[ch]?.(tx * tile + tile / 2, ty * tile + tile / 2, tx, ty, grid));
  return { grid, cols: grid.w, rows: grid.h, width: grid.w * tile, height: grid.h * tile, tile };
}
