// Deterministic seeded 2D/3D value noise + FBM for procedural voxel terrain

export function hashSeed(seedStr: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class SeededNoise {
  private perm: Uint8Array;

  constructor(seed: number) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    let s = seed >>> 0 || 1337;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      const j = s % (i + 1);
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }

    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad2(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) !== 0 ? -u : u) + ((h & 2) !== 0 ? -2.0 * v : 2.0 * v);
  }

  private grad3(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.perm[this.perm[xi] + yi];
    const ab = this.perm[this.perm[xi] + yi + 1];
    const ba = this.perm[this.perm[xi + 1] + yi];
    const bb = this.perm[this.perm[xi + 1] + yi + 1];

    const x1 = this.lerp(this.grad2(aa, xf, yf), this.grad2(ba, xf - 1, yf), u);
    const x2 = this.lerp(
      this.grad2(ab, xf, yf - 1),
      this.grad2(bb, xf - 1, yf - 1),
      u,
    );

    return this.lerp(x1, x2, v) * 0.45;
  }

  noise3D(x: number, y: number, z: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = this.fade(xf);
    const v = this.fade(yf);
    const w = this.fade(zf);

    const a = this.perm[xi] + yi;
    const aa = this.perm[a] + zi;
    const ab = this.perm[a + 1] + zi;
    const b = this.perm[xi + 1] + yi;
    const ba = this.perm[b] + zi;
    const bb = this.perm[b + 1] + zi;

    const x1 = this.lerp(
      this.grad3(this.perm[aa], xf, yf, zf),
      this.grad3(this.perm[ba], xf - 1, yf, zf),
      u,
    );
    const x2 = this.lerp(
      this.grad3(this.perm[ab], xf, yf - 1, zf),
      this.grad3(this.perm[bb], xf - 1, yf - 1, zf),
      u,
    );
    const y1 = this.lerp(x1, x2, v);

    const x3 = this.lerp(
      this.grad3(this.perm[aa + 1], xf, yf, zf - 1),
      this.grad3(this.perm[ba + 1], xf - 1, yf, zf - 1),
      u,
    );
    const x4 = this.lerp(
      this.grad3(this.perm[ab + 1], xf, yf - 1, zf - 1),
      this.grad3(this.perm[bb + 1], xf - 1, yf - 1, zf - 1),
      u,
    );
    const y2 = this.lerp(x3, x4, v);

    return this.lerp(y1, y2, w);
  }

  fbm2D(x: number, y: number, octaves = 4, persistence = 0.5, lacunarity = 2.0): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxVal = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxVal += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return total / maxVal;
  }

  hash2D(x: number, z: number): number {
    const xi = Math.imul(x | 0, 374761393);
    const zi = Math.imul(z | 0, 668265263);
    let n = (xi ^ zi ^ (this.perm[0] * 2654435761)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
}
