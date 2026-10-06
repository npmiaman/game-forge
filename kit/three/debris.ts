/**
 * Cube debris for Three.js games: one InstancedMesh, gravity, floor bounce, per-cube colour.
 *   const debris = new Debris(scene);
 *   debris.burst(x, y, z, [0xff0000, 0x880000], 20, speed, upward, size, inheritVx, inheritVz);
 *   each frame: debris.update(dt)
 * Pass a MeshBasicMaterial for unlit (glowing) debris.
 */
import * as THREE from 'three';

export class Debris {
  /** y of the floor particles bounce on */
  floorY = 0;
  gravity = 30;
  mesh: THREE.InstancedMesh;
  private MAX: number;
  private p: Float32Array; private v: Float32Array;
  private life: Float32Array; private size: Float32Array; private rot: Float32Array;
  private next = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private e = new THREE.Euler(); private pos = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene, max = 700, material: THREE.Material = new THREE.MeshLambertMaterial({ color: 0xffffff })) {
    const MAX = (this.MAX = max);
    this.p = new Float32Array(MAX * 3); this.v = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX); this.size = new Float32Array(MAX); this.rot = new Float32Array(MAX);
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, MAX);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) { this.mesh.setColorAt(i, this.c.set(0xffffff)); this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0)); }
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, colors: number[], n = 20, speed = 8, up = 6, size = 0.28, vx = 0, vz = 0) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.MAX;
      const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.7);
      this.p.set([x + (Math.random() - 0.5), y + Math.random() * 0.5, z + (Math.random() - 0.5)], i * 3);
      this.v.set([Math.cos(a) * sp + vx, up * (0.4 + Math.random()), Math.sin(a) * sp + vz], i * 3);
      this.life[i] = 0.9 + Math.random() * 0.8;
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.rot[i] = Math.random() * 6;
      this.mesh.setColorAt(i, this.c.set(colors[k % colors.length]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15));
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < this.MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.v[j + 1] -= this.gravity * dt;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < this.floorY + this.size[i] / 2) { this.p[j + 1] = this.floorY + this.size[i] / 2; this.v[j + 1] *= -0.35; this.v[j] *= 0.7; this.v[j + 2] *= 0.7; }
      this.rot[i] += dt * 6;
      const sc = this.life[i] <= 0 ? 0 : this.size[i] * Math.min(1, this.life[i] * 3);
      this.m.compose(this.pos.set(this.p[j], this.p[j + 1], this.p[j + 2]), this.q.setFromEuler(this.e.set(this.rot[i], this.rot[i] * 0.7, 0)), this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
