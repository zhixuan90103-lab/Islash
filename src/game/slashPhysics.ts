import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PHYS } from './design';

export type PhysBody = {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
};

export type SlashPhysics = {
  world: RAPIER.World;
  bodies: PhysBody[];
  addMesh: (
    mesh: THREE.Mesh,
    kind: 'box' | 'convex' | 'staticBox' | 'staticConvex',
  ) => PhysBody;
  removeMesh: (mesh: THREE.Mesh) => void;
  setGravityY: (y: number) => void;
  step: (dt: number) => void;
  dispose: () => void;
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function forEachTri(
  geometry: THREE.BufferGeometry,
  fn: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => void,
): void {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const index = geometry.getIndex();
  const read = (i: number, t: THREE.Vector3) => t.fromBufferAttribute(pos, i);
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      read(index.getX(i), _a);
      read(index.getX(i + 1), _b);
      read(index.getX(i + 2), _c);
      fn(_a, _b, _c);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      read(i, _a);
      read(i + 1, _b);
      read(i + 2, _c);
      fn(_a, _b, _c);
    }
  }
}

/** Closed-mesh volume centroid; fallback to AABB center. */
function volumeCom(geometry: THREE.BufferGeometry): THREE.Vector3 {
  let vol = 0;
  const com = new THREE.Vector3();
  const cr = new THREE.Vector3();
  forEachTri(geometry, (a, b, c) => {
    cr.copy(b).cross(c);
    const v = a.dot(cr) / 6;
    vol += v;
    com.x += v * (a.x + b.x + c.x) * 0.25;
    com.y += v * (a.y + b.y + c.y) * 0.25;
    com.z += v * (a.z + b.z + c.z) * 0.25;
  });
  if (Math.abs(vol) < 1e-8) {
    geometry.computeBoundingBox();
    const c = new THREE.Vector3();
    geometry.boundingBox?.getCenter(c);
    return c;
  }
  return com.multiplyScalar(1 / vol);
}

function centerOnVolumeCom(mesh: THREE.Mesh): void {
  mesh.updateMatrixWorld(true);
  const com = volumeCom(mesh.geometry);
  mesh.geometry.translate(-com.x, -com.y, -com.z);
  mesh.position.add(com);
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

function geomVerts(mesh: THREE.Mesh): Float32Array {
  const pos = mesh.geometry.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    arr[i * 3] = pos.getX(i);
    arr[i * 3 + 1] = pos.getY(i);
    arr[i * 3 + 2] = pos.getZ(i);
  }
  return arr;
}

export async function createSlashPhysics(): Promise<SlashPhysics> {
  await RAPIER.init();
  const gravity = { x: 0, y: PHYS.gravityY, z: 0 };
  const world = new RAPIER.World(gravity);
  const bodies: PhysBody[] = [];

  const addMesh: SlashPhysics['addMesh'] = (mesh, kind) => {
    const dynamic = kind === 'box' || kind === 'convex';
    if (dynamic) centerOnVolumeCom(mesh);
    const t = mesh.position;
    const q = mesh.quaternion;
    const desc = dynamic
      ? RAPIER.RigidBodyDesc.dynamic()
          .setCanSleep(true)
          .setLinearDamping(PHYS.linearDamping)
          .setAngularDamping(PHYS.angularDamping)
      : RAPIER.RigidBodyDesc.fixed();
    desc.setTranslation(t.x, t.y, t.z);
    desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    const body = world.createRigidBody(desc);

    let colliderDesc: RAPIER.ColliderDesc | null = null;
    if (kind === 'staticBox' || kind === 'box') {
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!;
      const hx = Math.max(0.02, (bb.max.x - bb.min.x) * 0.5);
      const hy = Math.max(0.02, (bb.max.y - bb.min.y) * 0.5);
      const hz = Math.max(0.02, (bb.max.z - bb.min.z) * 0.5);
      colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    } else {
      colliderDesc = RAPIER.ColliderDesc.convexHull(geomVerts(mesh));
    }
    if (!colliderDesc) {
      colliderDesc = RAPIER.ColliderDesc.cuboid(0.2, 0.2, 0.2);
    }
    colliderDesc.setDensity(PHYS.density);
    colliderDesc.setFriction(PHYS.friction);
    colliderDesc.setRestitution(PHYS.restitution);
    const collider = world.createCollider(colliderDesc, body);
    const rec: PhysBody = { mesh, body, collider };
    bodies.push(rec);
    return rec;
  };

  const removeMesh: SlashPhysics['removeMesh'] = (mesh) => {
    const i = bodies.findIndex((b) => b.mesh === mesh);
    if (i < 0) return;
    world.removeRigidBody(bodies[i].body);
    bodies.splice(i, 1);
  };

  const step: SlashPhysics['step'] = (dt) => {
    world.timestep = Math.min(1 / 30, Math.max(1 / 120, dt));
    world.step();
    for (const rec of bodies) {
      const t = rec.body.translation();
      const r = rec.body.rotation();
      rec.mesh.position.set(t.x, t.y, t.z);
      rec.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  };

  return {
    world,
    bodies,
    addMesh,
    removeMesh,
    setGravityY: (y) => {
      world.gravity.y = y;
    },
    step,
    dispose: () => {
      world.free();
      bodies.length = 0;
    },
  };
}
