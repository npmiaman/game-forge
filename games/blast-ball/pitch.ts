/**
 * Stadium: pitch with painted markings, goals + nets, boards, crowd stands, floodlights, zone walls.
 * Coordinates: x across the pitch (±width/2), z along it (±length/2). Team 0 defends +z, team 1 defends -z.
 */
import * as THREE from 'three';
import { PITCH } from './config';
import { loadTexture } from '@kit/assets';

export const HALF_L = PITCH.length / 2, HALF_W = PITCH.width / 2;
export const TEAM_COLOR = [0xff7a1a, 0x2a7fff];
export const TEAM_NAME = ['ORANGE', 'BLUE'];
/** z of the goal line a team defends */
export const ownGoalZ = (team: number) => (team === 0 ? HALF_L : -HALF_L);

function pitchTexture() {
  const px = 16; // pixels per metre
  const W = Math.round(PITCH.width * px), L = Math.round(PITCH.length * px);
  const c = document.createElement('canvas'); c.width = W; c.height = L;
  const g = c.getContext('2d')!;
  const stripes = 12;
  for (let i = 0; i < stripes; i++) { g.fillStyle = i % 2 ? '#3f8f3a' : '#47a042'; g.fillRect(0, (i * L) / stripes, W, L / stripes + 1); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(0,${40 + Math.random() * 60},0,${Math.random() * 0.15})`; g.fillRect(Math.random() * W, Math.random() * L, 2, 2); }
  g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 0.14 * px;
  const m = 1 * px, cx = W / 2, cy = L / 2;
  g.strokeRect(m, m, W - 2 * m, L - 2 * m);
  g.beginPath(); g.moveTo(m, cy); g.lineTo(W - m, cy); g.stroke();
  g.beginPath(); g.arc(cx, cy, 6 * px, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 0.3 * px, 0, Math.PI * 2); g.fill();
  for (const end of [m, L - m]) {
    const dir = end === m ? 1 : -1;
    const box = (w: number, d: number) => g.strokeRect(cx - (w * px) / 2, dir > 0 ? end : end - d * px, w * px, d * px);
    box(26, 11); box(12, 4);
    g.beginPath(); g.arc(cx, end + dir * 8 * px, 0.3 * px, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx, end + dir * 8 * px, 6 * px, dir > 0 ? 0.25 * Math.PI : 1.25 * Math.PI, dir > 0 ? 0.75 * Math.PI : 1.75 * Math.PI); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function netTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Stadium {
  zoneWalls: THREE.Mesh[] = [];
  private pitchMat!: THREE.MeshStandardMaterial;
  private groundMat!: THREE.MeshStandardMaterial;
  private zoneTex: THREE.CanvasTexture;
  crowd!: THREE.InstancedMesh;
  private crowdBase: Float32Array = new Float32Array(0);

  constructor(scene: THREE.Scene) {
    // ground around the pitch
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x2c5a2a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
    scene.add(ground);
    this.pitchMat = new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95 });
    this.groundMat = ground.material as THREE.MeshStandardMaterial;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.width + 2, PITCH.length + 2), this.pitchMat);
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true;
    scene.add(pitch);

    // advertising boards (walls the ball bounces off)
    const boardMat = (hue: number) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.7, 0.45), roughness: 0.5, emissive: new THREE.Color().setHSL(hue, 0.8, 0.12) });
    const H = PITCH.wall;
    const addBoard = (w: number, d: number, x: number, z: number, hue: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), boardMat(hue)); b.position.set(x, H / 2, z); b.castShadow = b.receiveShadow = true; scene.add(b);
    };
    for (let i = 0; i < 6; i++) {
      const seg = PITCH.length / 6, z = -HALF_L + seg * (i + 0.5);
      addBoard(0.3, seg - 0.1, -HALF_W - 0.15, z, i / 6); addBoard(0.3, seg - 0.1, HALF_W + 0.15, z, (i + 3) / 6);
    }
    const sideW = (PITCH.width - PITCH.goalWidth) / 2;
    for (const z of [-HALF_L - 0.15, HALF_L + 0.15]) for (const s of [-1, 1]) addBoard(sideW, 0.3, s * (PITCH.goalWidth / 2 + sideW / 2), z, z > 0 ? 0.08 : 0.6);

    // goals
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (const team of [0, 1]) {
      const z = ownGoalZ(team), dir = Math.sign(z), gw = PITCH.goalWidth, gh = PITCH.goalHeight, gd = PITCH.goalDepth;
      const g = new THREE.Group();
      const post = (h: number, x: number, y: number, zz: number, rx = 0, rz = 0) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h, 10), postMat); p.position.set(x, y, zz); p.rotation.set(rx, 0, rz); p.castShadow = true; g.add(p); };
      post(gh, -gw / 2, gh / 2, 0); post(gh, gw / 2, gh / 2, 0); post(gw, 0, gh, 0, 0, Math.PI / 2);
      const net = (w: number, h: number, x: number, y: number, zz: number, ry: number, rx = 0) => {
        const n = new THREE.Mesh(new THREE.PlaneGeometry(w, h), netMat.clone()); (n.material as THREE.MeshBasicMaterial).map = netMat.map!.clone();
        (n.material as THREE.MeshBasicMaterial).map!.repeat.set(w * 2, h * 2); (n.material as THREE.MeshBasicMaterial).map!.needsUpdate = true;
        n.position.set(x, y, zz); n.rotation.set(rx, ry, 0); g.add(n);
      };
      net(gw, gh, 0, gh / 2, dir * gd, 0);
      net(gd, gh, -gw / 2, gh / 2, (dir * gd) / 2, Math.PI / 2); net(gd, gh, gw / 2, gh / 2, (dir * gd) / 2, Math.PI / 2);
      net(gw, gd, 0, gh, (dir * gd) / 2, 0, Math.PI / 2);
      g.position.z = z;
      scene.add(g);
    }

    // stands + crowd
    const standMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.9 });
    const seats: number[] = [];
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const y = 0.6 + r * 0.9, out = 4 + r * 1.4;
      for (const side of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, PITCH.length + 2 * out), standMat); s.position.set(side * (HALF_W + out), y - 0.45, 0); s.receiveShadow = true; scene.add(s);
        for (let z = -HALF_L - out + 1; z < HALF_L + out - 1; z += 0.9) if (Math.random() < 0.85) seats.push(side * (HALF_W + out), y + 0.45, z);
        const e = new THREE.Mesh(new THREE.BoxGeometry(PITCH.width + 2 * out, 0.9, 1.4), standMat); e.position.set(0, y - 0.45, side * (HALF_L + out)); e.receiveShadow = true; scene.add(e);
        for (let x = -HALF_W - out + 1; x < HALF_W + out - 1; x += 0.9) if (Math.random() < 0.85) seats.push(x, y + 0.45, side * (HALF_L + out));
      }
    }
    const n = seats.length / 3;
    this.crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.8, 0.4), new THREE.MeshLambertMaterial(), n);
    this.crowdBase = new Float32Array(seats);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      m.makeTranslation(seats[i * 3], seats[i * 3 + 1], seats[i * 3 + 2]);
      this.crowd.setMatrixAt(i, m);
      const r = Math.random();
      this.crowd.setColorAt(i, col.setHex(r < 0.4 ? TEAM_COLOR[0] : r < 0.8 ? TEAM_COLOR[1] : [0xffffff, 0x222222, 0xeedd88][(i * 7) % 3]).offsetHSL(0, -0.1, (Math.random() - 0.5) * 0.2));
    }
    scene.add(this.crowd);

    // floodlight towers
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const tx = x * (HALF_W + 18), tz = z * (HALF_L + 16);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.8, 26, 0.8), standMat); pole.position.set(tx, 13, tz); scene.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 0.6), new THREE.MeshBasicMaterial({ color: 0xfffbe0 })); head.position.set(tx, 26, tz); head.lookAt(0, 0, 0); scene.add(head);
    }

    // zone walls: blue storm closing in from the sidelines
    const zc = document.createElement('canvas'); zc.width = 64; zc.height = 64;
    const zg = zc.getContext('2d')!;
    const grad = zg.createLinearGradient(0, 64, 0, 0); grad.addColorStop(0, 'rgba(80,170,255,.55)'); grad.addColorStop(1, 'rgba(80,170,255,0)');
    zg.fillStyle = grad; zg.fillRect(0, 0, 64, 64);
    zg.strokeStyle = 'rgba(180,230,255,.6)'; for (let i = 0; i < 64; i += 8) { zg.beginPath(); zg.moveTo(i, 64); zg.lineTo(i + 8, 0); zg.stroke(); }
    this.zoneTex = new THREE.CanvasTexture(zc); this.zoneTex.wrapS = THREE.RepeatWrapping; this.zoneTex.repeat.set(PITCH.length / 4, 1);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.length + 6, 9), new THREE.MeshBasicMaterial({ map: this.zoneTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      w.rotation.y = Math.PI / 2; w.position.set(s * HALF_W, 4.5, 0);
      scene.add(w); this.zoneWalls.push(w);
    }
  }

  /** Real grass detail (Poly Haven normal/roughness) under the painted stripes + photo grass around the pitch. */
  async addGrassDetail() {
    const g = await loadTexture('leafy_grass', { repeat: [PITCH.width / 3, PITCH.length / 3] });
    this.pitchMat.normalMap = g.normalMap ?? null; this.pitchMat.normalScale.set(0.7, 0.7);
    this.pitchMat.roughnessMap = g.roughnessMap ?? null; this.pitchMat.needsUpdate = true;
    const out = await loadTexture('leafy_grass', { repeat: 60 });
    Object.assign(this.groundMat, out, { color: new THREE.Color(0x9ab08a) }); this.groundMat.needsUpdate = true;
  }

  setZone(halfWidth: number, time: number) {
    this.zoneWalls.forEach((w, i) => { w.position.x = (i ? 1 : -1) * halfWidth; w.visible = halfWidth < HALF_W - 0.5; });
    this.zoneTex.offset.x = time * 0.3;
  }

  /** Crowd bounce: excitement 0..1 */
  cheer(excitement: number, time: number) {
    if (excitement < 0.02) return;
    const m = new THREE.Matrix4(), b = this.crowdBase;
    for (let i = 0; i < this.crowd.count; i++) {
      const j = Math.max(0, Math.sin(time * 14 + i * 1.7)) * 0.5 * excitement;
      m.makeTranslation(b[i * 3], b[i * 3 + 1] + j, b[i * 3 + 2]);
      this.crowd.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }
}
