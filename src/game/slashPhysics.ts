import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

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
  step: (dt: number) => void;
  dispose: () => void;
};

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
  const gravity = { x: 0, y: -9.8, z: 0 };
  const world = new RAPIER.World(gravity);
  const bodies: PhysBody[] = [];

  const addMesh: SlashPhysics['addMesh'] = (mesh, kind) => {
    const t = mesh.position;
    const q = mesh.quaternion;
    const fixed = kind === 'staticBox' || kind === 'staticConvex';
    const desc = fixed
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic().setCanSleep(true);
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
    colliderDesc.setFriction(0.55);
    colliderDesc.setRestitution(0.08);
    const collider = world.createCollider(colliderDesc, body);
    const rec = { mesh, body, collider };
    bodies.push(rec);
    return rec;
  };

  const removeMesh: SlashPhysics['removeMesh'] = (mesh) => {
    const i = bodies.findIndex((b) => b.mesh === mesh);
    if (i < 0) return;
    const rec = bodies[i];
    world.removeRigidBody(rec.body);
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
    step,
    dispose: () => {
      world.free();
      bodies.length = 0;
    },
  };
}
