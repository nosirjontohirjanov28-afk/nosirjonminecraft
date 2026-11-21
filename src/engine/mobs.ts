import * as THREE from 'three';
import { BlockType, ItemId } from '../types/game';

export type MobKind = 'sheep' | 'zombie';

export interface MobEntity {
  id: string;
  kind: MobKind;
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  wanderTimer: number;
  wanderAngle: number;
  fleeTimer: number;
  hurtTimer: number;
  attackCooldown: number;
  walkPhase: number;
  group: THREE.Group;
  legs: THREE.Mesh[];
  bodyMesh: THREE.Mesh;
}

export interface MobDrop {
  itemId: ItemId;
  count: number;
}

export class MobManager {
  public readonly rootGroup = new THREE.Group();
  private mobs: MobEntity[] = [];
  private nextId = 1;
  private spawnTimer = 1.5;

  // Shared geometries for lightweight rendering
  private sheepBodyGeo = new THREE.BoxGeometry(0.75, 0.56, 1.02);
  private sheepHeadGeo = new THREE.BoxGeometry(0.42, 0.4, 0.44);
  private sheepLegGeo = new THREE.BoxGeometry(0.18, 0.38, 0.18);

  private zombieTorsoGeo = new THREE.BoxGeometry(0.56, 0.72, 0.3);
  private zombieHeadGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46);
  private zombieLimbGeo = new THREE.BoxGeometry(0.2, 0.66, 0.2);

  private sheepMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.9 });
  private sheepFaceMat = new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.8 });
  private sheepLegMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });

  private zombieSkinMat = new THREE.MeshStandardMaterial({ color: 0x3b7a57, roughness: 0.75 });
  private zombieShirtMat = new THREE.MeshStandardMaterial({ color: 0x0f3b6e, roughness: 0.8 });
  private zombiePantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
  private zombieEyeMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.5,
  });

  private createMobMesh(kind: MobKind): {
    group: THREE.Group;
    legs: THREE.Mesh[];
    bodyMesh: THREE.Mesh;
  } {
    const group = new THREE.Group();
    const legs: THREE.Mesh[] = [];

    if (kind === 'sheep') {
      const bodyMat = this.sheepMat.clone();
      const bodyMesh = new THREE.Mesh(this.sheepBodyGeo, bodyMat);
      bodyMesh.position.set(0, 0.66, 0);
      bodyMesh.castShadow = true;
      group.add(bodyMesh);

      const head = new THREE.Mesh(this.sheepHeadGeo, this.sheepFaceMat);
      head.position.set(0, 0.84, -0.64);
      head.castShadow = true;
      group.add(head);

      const legOffsets: Array<[number, number]> = [
        [-0.22, -0.34],
        [0.22, -0.34],
        [-0.22, 0.34],
        [0.22, 0.34],
      ];
      for (const [lx, lz] of legOffsets) {
        const leg = new THREE.Mesh(this.sheepLegGeo, this.sheepLegMat);
        leg.position.set(lx, 0.2, lz);
        leg.castShadow = true;
        group.add(leg);
        legs.push(leg);
      }
      return { group, legs, bodyMesh };
    }

    // Neon Zombie
    const bodyMat = this.zombieShirtMat.clone();
    const bodyMesh = new THREE.Mesh(this.zombieTorsoGeo, bodyMat);
    bodyMesh.position.set(0, 1.02, 0);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    const head = new THREE.Mesh(this.zombieHeadGeo, this.zombieSkinMat);
    head.position.set(0, 1.62, 0);
    head.castShadow = true;
    group.add(head);

    const eyeGeo = new THREE.BoxGeometry(0.1, 0.06, 0.04);
    const eyeL = new THREE.Mesh(eyeGeo, this.zombieEyeMat);
    eyeL.position.set(-0.1, 1.64, -0.23);
    const eyeR = new THREE.Mesh(eyeGeo, this.zombieEyeMat);
    eyeR.position.set(0.1, 1.64, -0.23);
    group.add(eyeL, eyeR);

    // Outstretched arms
    const armL = new THREE.Mesh(this.zombieLimbGeo, this.zombieSkinMat);
    armL.position.set(-0.39, 1.24, -0.25);
    armL.rotation.x = Math.PI * 0.42;
    const armR = new THREE.Mesh(this.zombieLimbGeo, this.zombieSkinMat);
    armR.position.set(0.39, 1.24, -0.25);
    armR.rotation.x = Math.PI * 0.42;
    group.add(armL, armR);

    const legL = new THREE.Mesh(this.zombieLimbGeo, this.zombiePantsMat);
    legL.position.set(-0.14, 0.33, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(this.zombieLimbGeo, this.zombiePantsMat);
    legR.position.set(0.14, 0.33, 0);
    legR.castShadow = true;
    group.add(legL, legR);
    legs.push(legL, legR);

    return { group, legs, bodyMesh };
  }

  public spawnMob(kind: MobKind, x: number, y: number, z: number): MobEntity {
    const { group, legs, bodyMesh } = this.createMobMesh(kind);
    group.position.set(x, y, z);
    this.rootGroup.add(group);

    const entity: MobEntity = {
      id: `mob_${this.nextId++}`,
      kind,
      name: kind === 'sheep' ? 'Qo‘y' : 'Neon Zombi',
      hp: kind === 'sheep' ? 10 : 20,
      maxHp: kind === 'sheep' ? 10 : 20,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.random() * Math.PI * 2,
      wanderTimer: 1 + Math.random() * 3,
      wanderAngle: Math.random() * Math.PI * 2,
      fleeTimer: 0,
      hurtTimer: 0,
      attackCooldown: 0,
      walkPhase: Math.random() * 6,
      group,
      legs,
      bodyMesh,
    };
    this.mobs.push(entity);
    return entity;
  }

  public clearAll() {
    for (const mob of this.mobs) {
      this.rootGroup.remove(mob.group);
      (mob.bodyMesh.material as THREE.Material).dispose();
    }
    this.mobs = [];
  }

  public raycastMob(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
  ): MobEntity | null {
    let best: MobEntity | null = null;
    let bestT = maxDist;

    for (const mob of this.mobs) {
      const cx = mob.x;
      const cy = mob.y + (mob.kind === 'sheep' ? 0.6 : 1.0);
      const cz = mob.z;
      const radius = mob.kind === 'sheep' ? 0.65 : 0.6;

      const lx = ox - cx;
      const ly = oy - cy;
      const lz = oz - cz;
      const b = lx * dx + ly * dy + lz * dz;
      const c = lx * lx + ly * ly + lz * lz - radius * radius;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0.2 && t < bestT) {
        bestT = t;
        best = mob;
      }
    }
    return best;
  }

  public damageMob(
    mobId: string,
    damage: number,
    knockDirX: number,
    knockDirZ: number,
  ): { killed: boolean; drops: MobDrop[]; mobName: string } | null {
    const idx = this.mobs.findIndex((m) => m.id === mobId);
    if (idx === -1) return null;
    const mob = this.mobs[idx];
    mob.hp = Math.max(0, mob.hp - damage);
    mob.hurtTimer = 0.24;
    mob.vx += knockDirX * 6.5;
    mob.vz += knockDirZ * 6.5;
    mob.vy = 3.8;
    if (mob.kind === 'sheep') {
      mob.fleeTimer = 3.5;
      mob.wanderAngle = Math.atan2(-knockDirX, -knockDirZ);
    }

    if (mob.hp <= 0) {
      const drops: MobDrop[] =
        mob.kind === 'sheep'
          ? [{ itemId: 'raw_meat', count: 1 + (Math.random() > 0.45 ? 1 : 0) }]
          : [
              {
                itemId: Math.random() > 0.55 ? 'neon_shard' : Math.random() > 0.4 ? 'coal' : 'raw_iron',
                count: 1 + (Math.random() > 0.6 ? 1 : 0),
              },
            ];
      this.rootGroup.remove(mob.group);
      (mob.bodyMesh.material as THREE.Material).dispose();
      this.mobs.splice(idx, 1);
      return { killed: true, drops, mobName: mob.name };
    }

    return { killed: false, drops: [], mobName: mob.name };
  }

  public update(
    dt: number,
    playerX: number,
    playerY: number,
    playerZ: number,
    isNight: boolean,
    isSurvival: boolean,
    isSolidAt: (x: number, y: number, z: number) => boolean,
    getBlock: (x: number, y: number, z: number) => BlockType,
    getSurfaceHeight: (x: number, z: number) => number,
    onDamagePlayer: (amount: number, knockX: number, knockZ: number) => void,
  ) {
    // Spawn & despawn management (keep max 8 mobs around player)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.8;
      // Despawn far mobs
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        if (Math.hypot(m.x - playerX, m.z - playerZ) > 46) {
          this.rootGroup.remove(m.group);
          (m.bodyMesh.material as THREE.Material).dispose();
          this.mobs.splice(i, 1);
        }
      }

      if (this.mobs.length < 8) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 18;
        const sx = Math.floor(playerX + Math.cos(angle) * dist) + 0.5;
        const sz = Math.floor(playerZ + Math.sin(angle) * dist) + 0.5;
        const sy = getSurfaceHeight(Math.floor(sx), Math.floor(sz));
        const surfBlock = getBlock(sx, sy, sz);
        if (surfBlock !== BlockType.WATER && surfBlock !== BlockType.AIR && sy > 13) {
          const zombieCount = this.mobs.filter((m) => m.kind === 'zombie').length;
          const sheepCount = this.mobs.filter((m) => m.kind === 'sheep').length;
          const shouldZombie = isSurvival && (isNight ? zombieCount < 4 : zombieCount < 1 && Math.random() > 0.72);
          if (shouldZombie) {
            this.spawnMob('zombie', sx, sy + 1.1, sz);
          } else if (sheepCount < 4) {
            this.spawnMob('sheep', sx, sy + 1.1, sz);
          }
        }
      }
    }

    for (const mob of this.mobs) {
      if (mob.attackCooldown > 0) mob.attackCooldown -= dt;
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const mat = mob.bodyMesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(0xef4444);
        mat.emissiveIntensity = mob.hurtTimer > 0 ? 0.85 : 0;
      }

      const toPlayerX = playerX - mob.x;
      const toPlayerZ = playerZ - mob.z;
      const distPlayer = Math.hypot(toPlayerX, toPlayerZ);

      let wishSpeed = 0;
      let moveAngle = mob.wanderAngle;

      if (mob.kind === 'zombie' && isSurvival && distPlayer < 16) {
        moveAngle = Math.atan2(-toPlayerX, -toPlayerZ);
        wishSpeed = 2.65;
        if (distPlayer < 1.45 && Math.abs(playerY - mob.y) < 1.8 && mob.attackCooldown <= 0) {
          mob.attackCooldown = 1.15;
          const len = Math.max(0.01, distPlayer);
          onDamagePlayer(3, (toPlayerX / len) * 5.5, (toPlayerZ / len) * 5.5);
        }
      } else if (mob.fleeTimer > 0) {
        mob.fleeTimer -= dt;
        wishSpeed = 3.2;
      } else {
        mob.wanderTimer -= dt;
        if (mob.wanderTimer <= 0) {
          mob.wanderTimer = 2 + Math.random() * 4;
          mob.wanderAngle = Math.random() * Math.PI * 2;
        }
        wishSpeed = mob.wanderTimer > 1.2 ? 1.25 : 0;
        moveAngle = mob.wanderAngle;
      }

      const wishVx = -Math.sin(moveAngle) * wishSpeed;
      const wishVz = -Math.cos(moveAngle) * wishSpeed;
      mob.vx = THREE.MathUtils.damp(mob.vx, wishVx, 8, dt);
      mob.vz = THREE.MathUtils.damp(mob.vz, wishVz, 8, dt);
      mob.vy = Math.max(-20, mob.vy - 22 * dt);

      // Horizontal collision & auto step-up 1 block
      const nx = mob.x + mob.vx * dt;
      const nz = mob.z + mob.vz * dt;
      const blockedX = isSolidAt(Math.floor(nx), Math.floor(mob.y + 0.3), Math.floor(mob.z));
      if (!blockedX) {
        mob.x = nx;
      } else if (!isSolidAt(Math.floor(nx), Math.floor(mob.y + 1.3), Math.floor(mob.z)) && mob.vy <= 0.1) {
        mob.vy = 5.6;
      } else {
        mob.vx = 0;
        mob.wanderAngle += Math.PI * 0.7;
      }

      const blockedZ = isSolidAt(Math.floor(mob.x), Math.floor(mob.y + 0.3), Math.floor(nz));
      if (!blockedZ) {
        mob.z = nz;
      } else if (!isSolidAt(Math.floor(mob.x), Math.floor(mob.y + 1.3), Math.floor(nz)) && mob.vy <= 0.1) {
        mob.vy = 5.6;
      } else {
        mob.vz = 0;
        mob.wanderAngle += Math.PI * 0.7;
      }

      const ny = mob.y + mob.vy * dt;
      const hitFloor = isSolidAt(Math.floor(mob.x), Math.floor(ny), Math.floor(mob.z));
      if (hitFloor && mob.vy < 0) {
        mob.y = Math.floor(ny) + 1;
        mob.vy = 0;
      } else {
        mob.y = ny;
      }

      if (mob.y < 1) {
        mob.y = getSurfaceHeight(Math.floor(mob.x), Math.floor(mob.z)) + 1.1;
        mob.vy = 0;
      }

      const horiz = Math.hypot(mob.vx, mob.vz);
      if (horiz > 0.25) {
        mob.yaw = Math.atan2(-mob.vx, -mob.vz);
        mob.walkPhase += horiz * dt * 3.8;
      }

      mob.group.position.set(mob.x, mob.y, mob.z);
      mob.group.rotation.y = mob.yaw;

      const swing = horiz > 0.25 ? Math.sin(mob.walkPhase) * 0.5 : 0;
      if (mob.legs.length >= 2) {
        mob.legs[0].rotation.x = swing;
        mob.legs[1].rotation.x = -swing;
        if (mob.legs.length === 4) {
          mob.legs[2].rotation.x = -swing;
          mob.legs[3].rotation.x = swing;
        }
      }
    }
  }

  public dispose() {
    this.clearAll();
    this.sheepBodyGeo.dispose();
    this.sheepHeadGeo.dispose();
    this.sheepLegGeo.dispose();
    this.zombieTorsoGeo.dispose();
    this.zombieHeadGeo.dispose();
    this.zombieLimbGeo.dispose();
    this.sheepMat.dispose();
    this.sheepFaceMat.dispose();
    this.sheepLegMat.dispose();
    this.zombieSkinMat.dispose();
    this.zombieShirtMat.dispose();
    this.zombiePantsMat.dispose();
    this.zombieEyeMat.dispose();
  }
}
