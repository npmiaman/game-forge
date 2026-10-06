/** Voxel car built from boxes. Front faces -z. */
import * as THREE from 'three';

export interface CarMesh { root: THREE.Group; body: THREE.Group; wheels: THREE.Mesh[]; shadow: THREE.Mesh; flames: THREE.Mesh[] }

export function makeCar(color = 0xe0392b): CarMesh {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, emissive = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), emissive ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c }));
    m.position.set(x, y, z);
    body.add(m);
    return m;
  };
  box(2.0, 0.6, 3.8, color, 0, 0.75, 0);                 // chassis
  box(1.9, 0.25, 1.1, color, 0, 1.15, -1.25);            // hood
  box(1.7, 0.7, 1.6, 0x2b3a55, 0, 1.4, 0.35);            // cabin (glass)
  box(1.75, 0.12, 1.65, color, 0, 1.8, 0.35);            // roof
  box(2.2, 0.15, 0.5, 0x222222, 0, 1.25, 1.85);          // spoiler
  box(0.15, 0.4, 0.15, 0x222222, -0.8, 1.05, 1.85); box(0.15, 0.4, 0.15, 0x222222, 0.8, 1.05, 1.85);
  box(0.45, 0.25, 0.1, 0xfff6c0, -0.65, 0.85, -1.92, true); box(0.45, 0.25, 0.1, 0xfff6c0, 0.65, 0.85, -1.92, true); // headlights
  box(0.45, 0.2, 0.1, 0xff2020, -0.65, 0.85, 1.92, true); box(0.45, 0.2, 0.1, 0xff2020, 0.65, 0.85, 1.92, true);     // tail lights
  box(2.02, 0.12, 3.82, 0xffffff, 0, 0.5, 0);            // racing stripe base
  const wheels: THREE.Mesh[] = [];
  const wheelGeo = new THREE.BoxGeometry(0.45, 0.8, 0.8);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
  for (const [x, z] of [[-1.05, -1.25], [1.05, -1.25], [-1.05, 1.25], [1.05, 1.25]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.4, z);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0xbbbbbb }));
    w.add(hub);
    body.add(w);
    wheels.push(w);
  }
  const flames: THREE.Mesh[] = [];
  for (const x of [-0.5, 0.5]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.9), new THREE.MeshBasicMaterial({ color: 0x5ff0ff }));
    f.position.set(x, 0.6, 2.3);
    f.visible = false;
    body.add(f);
    flames.push(f);
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.position.y = 0.03;
  root.add(shadow);
  return { root, body, wheels, shadow, flames };
}
