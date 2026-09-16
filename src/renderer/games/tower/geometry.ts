import { planck, decomp } from '../../lib/tower-physics.js';
import { ANIMALS } from './animals.js';
import { ANIMAL_SIZE } from './sizes.js';

/**
 * Box2D is tuned for objects roughly 0.1m-10m across and its tolerances (contact
 * slop, sleep thresholds, polygon skin) are absolute, so the silhouettes have to
 * be simulated at a plausible physical size rather than in raw screen pixels.
 * Gameplay, rendering and the wire format all stay in pixels; this is the only
 * place the two frames meet. At 1/30 the cast spans 0.6m to 3.7m.
 */
export const METRES_PER_PIXEL = 1 / 30;
/** Box2D caps a convex polygon's vertex count; longer pieces are fanned into several. */
const MAX_HULL_VERTICES = 12;
/** Convex pieces below this drop out: they add contacts without changing the outline. */
const MIN_PART_AREA = 1;

type Point = { x: number; y: number };

/** Area centroid of a simple polygon, so ink and physics share one origin. */
function centroid(points: Point[]): Point {
  let twiceArea = 0, x = 0, y = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
}

function area(points: number[][]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

/**
 * A convex ring of any length can be covered by fans from its first vertex, and
 * every fan of a convex polygon is itself convex, so this keeps the silhouette
 * exact while respecting Box2D's vertex cap.
 */
function withinHullLimit(part: number[][]): number[][][] {
  if (part.length <= MAX_HULL_VERTICES) return [part];
  const fans: number[][][] = [];
  const span = MAX_HULL_VERTICES - 1;
  for (let i = 1; i < part.length - 1; i += span - 1) {
    fans.push([part[0], ...part.slice(i, Math.min(i + span, part.length))]);
  }
  return fans;
}

/** Centroid shift is shared by rendering and physics; ears/legs stay where the ink says they are. */
export const GEOMETRY = ANIMALS.map((animal) => {
  const xs = animal.vertices.map(v => v[0]), ys = animal.vertices.map(v => v[1]);
  const extent = ANIMAL_SIZE[animal.id];
  const scale = extent / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const vertices = animal.vertices.map(([x, y]) => ({ x: x * scale, y: y * scale }));
  const centre = centroid(vertices);
  const outline = vertices.map(v => [v.x - centre.x, v.y - centre.y]);
  decomp.makeCCW(outline);
  const parts = decomp.quickDecomp(outline.map(p => [...p]))
    .flatMap(withinHullLimit)
    .filter(part => part.length >= 3 && area(part) >= MIN_PART_AREA)
    .map(part => part.map(([x, y]) => planck.Vec2(x * METRES_PER_PIXEL, y * METRES_PER_PIXEL)));
  return { vertices, centre, scale, extent, parts,
    radius: Math.max(...vertices.map(v => Math.hypot(v.x - centre.x, v.y - centre.y))) };
});

/**
 * Grip and weight. Box2D clamps friction impulse to the Coulomb limit and keeps
 * position correction out of the velocity state, so a high `friction` buys grip
 * without the stored impulse that would later fire a piece off the tower.
 */
export const SURFACE = { friction: 0.8, restitution: 0 } as const;
const DENSITY = 1;
/** Matches the old engine's air drag, which kept a dropped piece from skating. */
const LINEAR_DAMPING = 2.5;
const ANGULAR_DAMPING = 2.5;

export function createAnimalBody(world: planck.World, kind: number, x: number, y: number, angle = 0): planck.Body {
  const body = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(x * METRES_PER_PIXEL, y * METRES_PER_PIXEL),
    angle,
    linearDamping: LINEAR_DAMPING,
    angularDamping: ANGULAR_DAMPING,
    // Thin ears and legs on a long drop would otherwise step straight through a
    // resting outline between frames.
    bullet: true
  });
  for (const part of GEOMETRY[kind].parts) {
    body.createFixture(planck.Polygon(part), { density: DENSITY, ...SURFACE });
  }
  return body;
}

/** Tight world-space bounds in pixels; Box2D's broadphase AABB is padded and too loose to aim with. */
export function bodyBounds(body: planck.Body): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const transform = body.getTransform();
  for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
    const shape = fixture.getShape() as planck.PolygonShape;
    for (const vertex of shape.m_vertices) {
      const point = planck.Transform.mulVec2(transform, vertex);
      const px = point.x / METRES_PER_PIXEL, py = point.y / METRES_PER_PIXEL;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  return { minX, minY, maxX, maxY };
}
