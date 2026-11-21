import * as THREE from 'three';

// Composite 10-part procedural voxel explorer avatar with articulated limbs & neon visor
export class PlayerAvatar {
  public readonly group = new THREE.Group();
  private headGroup = new THREE.Group();
  private bodyGroup = new THREE.Group();
  private leftArmPivot = new THREE.Group();
  private rightArmPivot = new THREE.Group();
  private leftLegPivot = new THREE.Group();
  private rightLegPivot = new THREE.Group();
  private heldBlockMesh: THREE.Mesh;
  private thrusterCore: THREE.Mesh;
  private labelSprite: THREE.Sprite | null = null;
  private labelTexture: THREE.CanvasTexture | null = null;
  private currentLabel = '';

  private walkPhase = 0;
  private swingTimer = 0;

  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  constructor() {
    const jacketMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.78,
      metalness: 0.12,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.35,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xd9a882,
      roughness: 0.85,
      metalness: 0.02,
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.55,
    });
    const neonMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.4,
    });
    const bootMat = new THREE.MeshStandardMaterial({
      color: 0x0b1324,
      roughness: 0.45,
      metalness: 0.45,
    });
    const heldMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.15,
    });

    this.materials.push(jacketMat, trimMat, skinMat, helmetMat, neonMat, bootMat, heldMat);

    // Legs (bottom-center pivot at y=0, leg height = 0.68)
    const legGeo = new THREE.BoxGeometry(0.22, 0.52, 0.24);
    const bootGeo = new THREE.BoxGeometry(0.24, 0.18, 0.28);
    this.geometries.push(legGeo, bootGeo);

    const makeLeg = (pivot: THREE.Group, xOffset: number) => {
      pivot.position.set(xOffset, 0.68, 0);
      const upper = new THREE.Mesh(legGeo, trimMat);
      upper.position.set(0, -0.26, 0);
      upper.castShadow = true;
      const boot = new THREE.Mesh(bootGeo, bootMat);
      boot.position.set(0, -0.59, 0.02);
      boot.castShadow = true;
      pivot.add(upper, boot);
      this.group.add(pivot);
    };
    makeLeg(this.leftLegPivot, -0.13);
    makeLeg(this.rightLegPivot, 0.13);

    // Torso & Cyber Backpack
    this.bodyGroup.position.set(0, 0.68, 0);
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.64, 0.28);
    const chestCoreGeo = new THREE.BoxGeometry(0.18, 0.18, 0.04);
    const packGeo = new THREE.BoxGeometry(0.36, 0.42, 0.16);
    const thrusterGeo = new THREE.BoxGeometry(0.24, 0.1, 0.05);
    this.geometries.push(torsoGeo, chestCoreGeo, packGeo, thrusterGeo);

    const torso = new THREE.Mesh(torsoGeo, jacketMat);
    torso.position.set(0, 0.32, 0);
    torso.castShadow = true;
    const chestCore = new THREE.Mesh(chestCoreGeo, neonMat);
    chestCore.position.set(0, 0.38, -0.145);
    const backpack = new THREE.Mesh(packGeo, helmetMat);
    backpack.position.set(0, 0.34, 0.2);
    backpack.castShadow = true;
    this.thrusterCore = new THREE.Mesh(thrusterGeo, neonMat);
    this.thrusterCore.position.set(0, 0.22, 0.285);

    this.bodyGroup.add(torso, chestCore, backpack, this.thrusterCore);
    this.group.add(this.bodyGroup);

    // Head + Cyber Helmet + Glowing Visor (facing -Z forward)
    this.headGroup.position.set(0, 1.34, 0);
    const headGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const capGeo = new THREE.BoxGeometry(0.46, 0.16, 0.46);
    const visorGeo = new THREE.BoxGeometry(0.38, 0.12, 0.05);
    this.geometries.push(headGeo, capGeo, visorGeo);

    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.21, 0);
    head.castShadow = true;
    const helmetTop = new THREE.Mesh(capGeo, helmetMat);
    helmetTop.position.set(0, 0.36, 0);
    helmetTop.castShadow = true;
    const visor = new THREE.Mesh(visorGeo, neonMat);
    visor.position.set(0, 0.24, -0.215);

    this.headGroup.add(head, helmetTop, visor);
    this.group.add(this.headGroup);

    // Arms + Held Block
    const armGeo = new THREE.BoxGeometry(0.18, 0.56, 0.2);
    const cuffGeo = new THREE.BoxGeometry(0.2, 0.1, 0.22);
    const heldGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.geometries.push(armGeo, cuffGeo, heldGeo);

    const makeArm = (pivot: THREE.Group, xOffset: number) => {
      pivot.position.set(xOffset, 1.28, 0);
      const arm = new THREE.Mesh(armGeo, jacketMat);
      arm.position.set(0, -0.26, 0);
      arm.castShadow = true;
      const cuff = new THREE.Mesh(cuffGeo, trimMat);
      cuff.position.set(0, -0.46, 0);
      pivot.add(arm, cuff);
      this.group.add(pivot);
    };
    makeArm(this.leftArmPivot, -0.36);
    makeArm(this.rightArmPivot, 0.36);

    this.heldBlockMesh = new THREE.Mesh(heldGeo, heldMat);
    this.heldBlockMesh.position.set(0, -0.56, -0.14);
    this.heldBlockMesh.castShadow = true;
    this.rightArmPivot.add(this.heldBlockMesh);
  }

  public setLabel(name: string) {
    if (name === this.currentLabel) return;
    this.currentLabel = name;
    if (this.labelSprite) {
      this.group.remove(this.labelSprite);
      (this.labelSprite.material as THREE.SpriteMaterial).dispose();
      this.labelSprite = null;
    }
    if (this.labelTexture) {
      this.labelTexture.dispose();
      this.labelTexture = null;
    }
    if (!name) return;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(4, 12, 29, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(12, 10, 232, 44, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 16), 128, 33);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.labelTexture = tex;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, 2.25, 0);
    sprite.scale.set(1.6, 0.4, 1);
    this.labelSprite = sprite;
    this.group.add(sprite);
  }

  public setHeldColor(hexColor: string) {
    const mat = this.heldBlockMesh.material as THREE.MeshStandardMaterial;
    mat.color.set(hexColor);
    mat.emissive.set(hexColor);
    mat.emissiveIntensity = hexColor.toLowerCase() === '#38bdf8' ? 0.8 : 0.1;
  }

  public triggerSwing() {
    this.swingTimer = 0.24;
  }

  public update(
    dt: number,
    horizontalSpeed: number,
    isGrounded: boolean,
    isFlying: boolean,
    headPitch: number,
  ) {
    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
    }

    const moveFactor = Math.min(1, horizontalSpeed / 6.0);
    if (moveFactor > 0.05 && isGrounded && !isFlying) {
      this.walkPhase += dt * (4 + horizontalSpeed * 1.45);
    } else {
      // Smoothly settle limbs back toward neutral
      this.walkPhase += dt * 1.5;
    }

    const stride = isFlying
      ? 0.25
      : isGrounded
        ? Math.sin(this.walkPhase) * 0.65 * moveFactor
        : 0.45;

    this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, stride, 14, dt);
    this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, -stride, 14, dt);

    const swingAngle =
      this.swingTimer > 0
        ? Math.sin((this.swingTimer / 0.24) * Math.PI) * 1.25
        : 0;

    this.leftArmPivot.rotation.x = THREE.MathUtils.damp(
      this.leftArmPivot.rotation.x,
      -stride * 0.85,
      14,
      dt,
    );
    this.rightArmPivot.rotation.x = THREE.MathUtils.damp(
      this.rightArmPivot.rotation.x,
      stride * 0.85 + swingAngle,
      18,
      dt,
    );

    // Subtle body pitch when flying forward
    const targetTilt = isFlying ? -0.18 * moveFactor : 0;
    this.bodyGroup.rotation.x = THREE.MathUtils.damp(this.bodyGroup.rotation.x, targetTilt, 10, dt);
    this.headGroup.rotation.x = THREE.MathUtils.clamp(headPitch * 0.65, -0.5, 0.5);

    const thrusterMat = this.thrusterCore.material as THREE.MeshStandardMaterial;
    thrusterMat.emissiveIntensity = isFlying ? 2.8 : 1.1;
  }

  public dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    if (this.labelSprite) {
      (this.labelSprite.material as THREE.SpriteMaterial).dispose();
    }
    if (this.labelTexture) {
      this.labelTexture.dispose();
    }
  }
}
