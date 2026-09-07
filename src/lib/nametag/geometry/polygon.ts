import type { Point, Ring } from './path';

/** A closed area: one outer boundary plus any number of holes inside it. */
export interface Polygon {
    outer: Ring;
    holes: Ring[];
}

/** Shoelace area; positive means the ring is wound counter-clockwise. */
export function signedArea(ring: Ring): number {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return sum / 2;
}

export function isCounterClockwise(ring: Ring): boolean {
    return signedArea(ring) > 0;
}

/** Returns the ring wound the requested way, reversing a copy only when needed. */
export function orient(ring: Ring, counterClockwise: boolean): Ring {
    return isCounterClockwise(ring) === counterClockwise ? ring : [...ring].reverse();
}

export function boundsOf(rings: Ring[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
        for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    return { minX, minY, maxX, maxY };
}

export function pointInRing(point: Point, ring: Ring): boolean {
    const [px, py] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/**
 * Groups a flat list of contours into polygons by containment rather than winding
 * direction, so outlines from any source nest correctly (letter counters, a hole
 * inside a hole, and so on). Even nesting depth is solid, odd depth is a hole.
 */
export function nestRings(rings: Ring[]): Polygon[] {
    const usable = rings.filter((r) => r.length > 2 && Math.abs(signedArea(r)) > 1e-9);
    const depths = usable.map((ring) => {
        // A vertex of the ring can sit exactly on another ring's edge, so test the
        // centroid of the first triangle instead - it is strictly inside for our shapes.
        const probe = interiorProbe(ring);
        let depth = 0;
        for (const other of usable) {
            if (other === ring) continue;
            if (pointInRing(probe, other)) depth++;
        }
        return depth;
    });

    const polygons: Polygon[] = [];
    const outerIndices: number[] = [];
    usable.forEach((ring, i) => {
        if (depths[i] % 2 === 0) {
            outerIndices.push(i);
            polygons.push({ outer: orient(ring, true), holes: [] });
        }
    });

    usable.forEach((ring, i) => {
        if (depths[i] % 2 === 0) return;
        const probe = interiorProbe(ring);
        // Attach the hole to the smallest solid ring that contains it.
        let bestSlot = -1;
        let bestArea = Infinity;
        outerIndices.forEach((outerIndex, slot) => {
            if (!pointInRing(probe, usable[outerIndex])) return;
            const area = Math.abs(signedArea(usable[outerIndex]));
            if (area < bestArea) {
                bestArea = area;
                bestSlot = slot;
            }
        });
        if (bestSlot >= 0) polygons[bestSlot].holes.push(orient(ring, false));
    });

    return polygons;
}

/** A point guaranteed to be strictly inside the ring. */
function interiorProbe(ring: Ring): Point {
    // Walk the vertices looking for a convex corner whose triangle midpoint is inside.
    for (let i = 0; i < ring.length; i++) {
        const a = ring[(i + ring.length - 1) % ring.length];
        const b = ring[i];
        const c = ring[(i + 1) % ring.length];
        const candidate: Point = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
        if (pointInRing(candidate, ring)) return candidate;
    }
    // Degenerate ring; the centroid is the best available answer.
    const sum = ring.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]] as Point, [0, 0] as Point);
    return [sum[0] / ring.length, sum[1] / ring.length];
}

export function translateRing(ring: Ring, dx: number, dy: number): Ring {
    return ring.map(([x, y]) => [x + dx, y + dy] as Point);
}

export function scaleRing(ring: Ring, scale: number): Ring {
    return ring.map(([x, y]) => [x * scale, y * scale] as Point);
}

/** Rounded rectangle centred on (cx, cy), wound counter-clockwise. */
export function roundedRect(cx: number, cy: number, width: number, height: number, radius: number, segments = 12): Ring {
    const hw = width / 2;
    const hh = height / 2;
    const r = Math.max(0, Math.min(radius, hw, hh));
    if (r < 1e-6) {
        return [
            [cx - hw, cy - hh],
            [cx + hw, cy - hh],
            [cx + hw, cy + hh],
            [cx - hw, cy + hh]
        ];
    }

    const ring: Ring = [];
    const corners: Array<[number, number, number]> = [
        [cx + hw - r, cy - hh + r, -Math.PI / 2],
        [cx + hw - r, cy + hh - r, 0],
        [cx - hw + r, cy + hh - r, Math.PI / 2],
        [cx - hw + r, cy - hh + r, Math.PI]
    ];
    for (const [ox, oy, startAngle] of corners) {
        for (let s = 0; s <= segments; s++) {
            const angle = startAngle + (s / segments) * (Math.PI / 2);
            ring.push([ox + r * Math.cos(angle), oy + r * Math.sin(angle)]);
        }
    }
    return ring;
}

/** Circle wound counter-clockwise. */
export function circle(cx: number, cy: number, radius: number, segments = 48): Ring {
    const ring: Ring = [];
    for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        ring.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
    return ring;
}

/** Stadium shape (rectangle with semicircular ends), used for lanyard slots. */
export function slot(cx: number, cy: number, length: number, width: number, segments = 16): Ring {
    const r = width / 2;
    const straight = Math.max(0, length - width) / 2;
    const ring: Ring = [];
    for (let s = 0; s <= segments; s++) {
        const angle = -Math.PI / 2 + (s / segments) * Math.PI;
        ring.push([cx + straight + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    for (let s = 0; s <= segments; s++) {
        const angle = Math.PI / 2 + (s / segments) * Math.PI;
        ring.push([cx - straight + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return ring;
}
