/** Every tuning number. Open the game with ?tune for live sliders. */
import { tune } from '@kit/tune';

export const SLUG = 'block-racer';

export const CAR = {
  maxSpeed: 38,          // units/sec at the start (HUD shows ×4 as km/h)
  speedPerCheckpoint: 3,
  maxSpeedCap: 64,
  accel: 26,
  brake: 50,
  coast: 6,
  turnRate: 2.1,         // rad/s at full steer
  driftTurn: 2.8,
  grip: 10,              // how fast velocity follows heading
  driftGrip: 2.3,
  boostSpeed: 22,        // extra top speed while boosting
  boostAccel: 70,
};

export const DRIFT = { chargeRate: 1, tier1: 0.6, tier2: 1.3, tier3: 2.1, boost1: 0.7, boost2: 1.1, boost3: 1.7 };

export const RACE = {
  startTime: 25,
  checkpointEvery: 450,
  // checkpoint bonus = (time to drive the next stretch at top speed) × factor; factor shrinks each checkpoint
  bonusFactor: 1.2, bonusFactorDecay: 0.06, bonusFactorMin: 0.7,
  crashKeep: 0.3,        // speed kept after hitting stone
  crateKeep: 0.85,       // speed kept after smashing a crate
  coinTime: 0.25,
};

export const TRACK = {
  roadHalf: 6, shoulder: 3, chunk: 24, ahead: 11, behind: 2,
  amp1: 14, amp2: 6, ampGrowth: 1.5,
  density: 0.55, densityGrowth: 0.08,
};

export const PHYS = { gravity: 34, rampLaunch: 0.3, rampLift: 3 };

export const CAM = { distance: 7.5, height: 3.6, baseFov: 68, fovPerSpeed: 0.35, boostFov: 10 };

tune(CAR, 'Car');
tune(DRIFT, 'Drift boost');
tune(RACE, 'Race');
tune(PHYS, 'Physics');
tune(CAM, 'Camera');
