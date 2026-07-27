import * as THREE from 'three';

export type AtlasTileName =
  | 'grass'
  | 'asphalt'
  | 'concrete'
  | 'siding'
  | 'brick'
  | 'shingles'
  | 'metal'
  | 'glass'
  | 'gravel'
  | 'soil'
  | 'wood'
  | 'roof-dark'
  | 'marking'
  | 'foliage'
  | 'bark'
  | 'paint';

export type DioramaMaterialName =
  | 'terrain'
  | 'asphalt'
  | 'concrete'
  | 'siding'
  | 'brick'
  | 'shingles'
  | 'metal'
  | 'glass'
  | 'gravel'
  | 'soil'
  | 'wood'
  | 'roof-dark'
  | 'marking'
  | 'foliage'
  | 'bark'
  | 'paint';

interface AtlasTile {
  column: number;
  row: number;
}

const ATLAS_SIZE = 1024;
const TILE_COUNT = 4;
const TILE_SIZE = ATLAS_SIZE / TILE_COUNT;
const TILE_INSET = 3 / ATLAS_SIZE;

const ATLAS_TILES: Readonly<Record<AtlasTileName, AtlasTile>> = {
  grass: { column: 0, row: 0 },
  asphalt: { column: 1, row: 0 },
  concrete: { column: 2, row: 0 },
  siding: { column: 3, row: 0 },
  brick: { column: 0, row: 1 },
  shingles: { column: 1, row: 1 },
  metal: { column: 2, row: 1 },
  glass: { column: 3, row: 1 },
  gravel: { column: 0, row: 2 },
  soil: { column: 1, row: 2 },
  wood: { column: 2, row: 2 },
  'roof-dark': { column: 3, row: 2 },
  marking: { column: 0, row: 3 },
  foliage: { column: 1, row: 3 },
  bark: { column: 2, row: 3 },
  paint: { column: 3, row: 3 },
};

function createAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Unable to create the diorama material atlas.');
  }

  const fillTile = (tile: AtlasTileName, color: string): void => {
    const definition = ATLAS_TILES[tile];
    context.fillStyle = color;
    context.fillRect(
      definition.column * TILE_SIZE,
      definition.row * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
    );
  };

  const tileOrigin = (tile: AtlasTileName): { x: number; y: number } => {
    const definition = ATLAS_TILES[tile];
    return {
      x: definition.column * TILE_SIZE,
      y: definition.row * TILE_SIZE,
    };
  };

  fillTile('grass', '#73866c');
  fillTile('asphalt', '#3d4342');
  fillTile('concrete', '#a6a79f');
  fillTile('siding', '#d5d0bd');
  fillTile('brick', '#9a6556');
  fillTile('shingles', '#5b554f');
  fillTile('metal', '#a0a7a2');
  fillTile('glass', '#88a6aa');
  fillTile('gravel', '#858077');
  fillTile('soil', '#806c54');
  fillTile('wood', '#a68b68');
  fillTile('roof-dark', '#3f4943');
  fillTile('marking', '#e5ddaa');
  fillTile('foliage', '#52735a');
  fillTile('bark', '#655445');
  fillTile('paint', '#d6d1c1');

  const grass = tileOrigin('grass');
  context.globalAlpha = 0.18;
  for (let index = 0; index < 180; index += 1) {
    const x = grass.x + ((index * 67) % TILE_SIZE);
    const y = grass.y + ((index * 37) % TILE_SIZE);
    context.strokeStyle = index % 2 === 0 ? '#b6bd8a' : '#435f4d';
    context.beginPath();
    context.moveTo(x, y + 5);
    context.lineTo(x + (index % 3) - 1, y - 4);
    context.stroke();
  }

  const asphalt = tileOrigin('asphalt');
  context.globalAlpha = 0.16;
  for (let index = 0; index < 260; index += 1) {
    context.fillStyle = index % 3 === 0 ? '#777a73' : '#222725';
    context.fillRect(
      asphalt.x + ((index * 43) % TILE_SIZE),
      asphalt.y + ((index * 97) % TILE_SIZE),
      2,
      2,
    );
  }

  const concrete = tileOrigin('concrete');
  context.globalAlpha = 0.13;
  for (let index = 0; index < 120; index += 1) {
    context.fillStyle = index % 2 === 0 ? '#d1cec0' : '#777c78';
    context.fillRect(
      concrete.x + ((index * 71) % TILE_SIZE),
      concrete.y + ((index * 29) % TILE_SIZE),
      3,
      3,
    );
  }

  const siding = tileOrigin('siding');
  context.globalAlpha = 0.2;
  context.strokeStyle = '#77776e';
  context.lineWidth = 2;
  for (let y = 12; y < TILE_SIZE; y += 18) {
    context.beginPath();
    context.moveTo(siding.x, siding.y + y);
    context.lineTo(siding.x + TILE_SIZE, siding.y + y);
    context.stroke();
  }

  const brick = tileOrigin('brick');
  context.globalAlpha = 0.24;
  context.strokeStyle = '#d2b1a0';
  context.lineWidth = 2;
  for (let y = 0; y <= TILE_SIZE; y += 24) {
    context.beginPath();
    context.moveTo(brick.x, brick.y + y);
    context.lineTo(brick.x + TILE_SIZE, brick.y + y);
    context.stroke();
    const row = y / 24;
    const offset = row % 2 === 0 ? 0 : 24;
    for (let x = offset; x < TILE_SIZE; x += 48) {
      context.beginPath();
      context.moveTo(brick.x + x, brick.y + y);
      context.lineTo(brick.x + x, brick.y + y + 24);
      context.stroke();
    }
  }

  const shingles = tileOrigin('shingles');
  context.globalAlpha = 0.22;
  context.strokeStyle = '#aaa093';
  context.lineWidth = 2;
  for (let y = 8; y < TILE_SIZE; y += 20) {
    context.beginPath();
    context.moveTo(shingles.x, shingles.y + y);
    context.lineTo(shingles.x + TILE_SIZE, shingles.y + y);
    context.stroke();
  }

  const metal = tileOrigin('metal');
  context.globalAlpha = 0.18;
  context.strokeStyle = '#e2e1d7';
  for (let x = 8; x < TILE_SIZE; x += 20) {
    context.beginPath();
    context.moveTo(metal.x + x, metal.y);
    context.lineTo(metal.x + x, metal.y + TILE_SIZE);
    context.stroke();
  }

  const glass = tileOrigin('glass');
  context.globalAlpha = 0.22;
  const glassGradient = context.createLinearGradient(
    glass.x,
    glass.y + TILE_SIZE,
    glass.x + TILE_SIZE,
    glass.y,
  );
  glassGradient.addColorStop(0, '#375b65');
  glassGradient.addColorStop(0.48, '#9fc0bf');
  glassGradient.addColorStop(0.55, '#d7ded2');
  glassGradient.addColorStop(1, '#5b777c');
  context.fillStyle = glassGradient;
  context.fillRect(glass.x, glass.y, TILE_SIZE, TILE_SIZE);

  const gravel = tileOrigin('gravel');
  context.globalAlpha = 0.2;
  for (let index = 0; index < 220; index += 1) {
    context.fillStyle = index % 2 === 0 ? '#c0b49a' : '#554f49';
    context.beginPath();
    context.arc(
      gravel.x + ((index * 83) % TILE_SIZE),
      gravel.y + ((index * 47) % TILE_SIZE),
      1 + (index % 3),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  const wood = tileOrigin('wood');
  context.globalAlpha = 0.18;
  context.strokeStyle = '#5e4738';
  for (let x = 10; x < TILE_SIZE; x += 26) {
    context.beginPath();
    context.moveTo(wood.x + x, wood.y);
    context.lineTo(wood.x + x + 5, wood.y + TILE_SIZE);
    context.stroke();
  }

  const foliage = tileOrigin('foliage');
  context.globalAlpha = 0.16;
  for (let index = 0; index < 100; index += 1) {
    context.fillStyle = index % 2 === 0 ? '#a0a873' : '#294d3c';
    context.beginPath();
    context.arc(
      foliage.x + ((index * 59) % TILE_SIZE),
      foliage.y + ((index * 101) % TILE_SIZE),
      5 + (index % 5),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.globalAlpha = 1;
  return canvas;
}

function createMaterial(
  map: THREE.Texture,
  color: THREE.ColorRepresentation,
  roughness: number,
  options: {
    metalness?: number;
    transparent?: boolean;
    opacity?: number;
    emissive?: THREE.ColorRepresentation;
    emissiveIntensity?: number;
    flatShading?: boolean;
  } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    color,
    roughness,
    metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    flatShading: options.flatShading ?? false,
    vertexColors: true,
  });
}

export class MaterialAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly materials: Readonly<
    Record<DioramaMaterialName, THREE.MeshStandardMaterial>
  >;

  constructor() {
    this.texture = new THREE.CanvasTexture(createAtlasCanvas());
    this.texture.name = 'DioramaMaterialAtlas';
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;

    this.materials = {
      terrain: createMaterial(this.texture, 0xffffff, 0.98, {
        flatShading: true,
      }),
      asphalt: createMaterial(this.texture, 0xffffff, 0.94),
      concrete: createMaterial(this.texture, 0xffffff, 0.9),
      siding: createMaterial(this.texture, 0xffffff, 0.82),
      brick: createMaterial(this.texture, 0xffffff, 0.9),
      shingles: createMaterial(this.texture, 0xffffff, 0.96),
      metal: createMaterial(this.texture, 0xffffff, 0.62, {
        metalness: 0.18,
      }),
      glass: createMaterial(this.texture, 0xffffff, 0.32, {
        metalness: 0.12,
        emissive: 0x173039,
        emissiveIntensity: 0.12,
      }),
      gravel: createMaterial(this.texture, 0xffffff, 0.98),
      soil: createMaterial(this.texture, 0xffffff, 1),
      wood: createMaterial(this.texture, 0xffffff, 0.9),
      'roof-dark': createMaterial(this.texture, 0xffffff, 0.88),
      marking: createMaterial(this.texture, 0xffffff, 0.78, {
        emissive: 0x292511,
        emissiveIntensity: 0.08,
      }),
      foliage: createMaterial(this.texture, 0xffffff, 0.94, {
        flatShading: true,
      }),
      bark: createMaterial(this.texture, 0xffffff, 0.96),
      paint: createMaterial(this.texture, 0xffffff, 0.76),
    };
  }

  get(name: DioramaMaterialName): THREE.MeshStandardMaterial {
    return this.materials[name];
  }

  cloneGeometryForTile<T extends THREE.BufferGeometry>(
    geometry: T,
    tileName: AtlasTileName,
  ): T {
    const clone = geometry.clone() as T;
    remapGeometryUvs(clone, tileName);
    return clone;
  }

  dispose(): void {
    for (const material of Object.values(this.materials)) {
      material.dispose();
    }
    this.texture.dispose();
  }
}

export function remapGeometryUvs(
  geometry: THREE.BufferGeometry,
  tileName: AtlasTileName,
): void {
  const uvAttribute = geometry.getAttribute('uv');
  if (!(uvAttribute instanceof THREE.BufferAttribute)) {
    return;
  }

  const tile = ATLAS_TILES[tileName];
  const tileScale = 1 / TILE_COUNT;
  const minimumU = tile.column * tileScale + TILE_INSET;
  const minimumV = 1 - (tile.row + 1) * tileScale + TILE_INSET;
  const usableScale = tileScale - TILE_INSET * 2;
  for (let index = 0; index < uvAttribute.count; index += 1) {
    uvAttribute.setXY(
      index,
      minimumU + uvAttribute.getX(index) * usableScale,
      minimumV + uvAttribute.getY(index) * usableScale,
    );
  }
  uvAttribute.needsUpdate = true;
}
