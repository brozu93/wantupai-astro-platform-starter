import polygonClipping from 'polygon-clipping';
import type { Ring } from './path';
import type { Polygon } from './polygon';
import { boundsOf, nestRings } from './polygon';

interface Box {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

function overlaps(a: Box, b: Box): boolean {
    return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function toClipperFormat(shape: Polygon): number[][][] {
    // polygon-clipping expects explicitly closed rings.
    return [close(shape.outer), ...shape.holes.map(close)];
}

function close(ring: Ring): number[][] {
    return [...ring.map(([x, y]) => [x, y]), [ring[0][0], ring[0][1]]];
}

function fromClipperFormat(result: number[][][][]): Polygon[] {
    const polygons: Polygon[] = [];
    for (const poly of result) {
        const rings = poly
            .map((ring) => {
                const points = ring.map(([x, y]) => [x, y] as [number, number]);
                // Drop the repeated closing point.
                if (points.length > 1) {
                    const first = points[0];
                    const last = points[points.length - 1];
                    if (first[0] === last[0] && first[1] === last[1]) points.pop();
                }
                return points;
            })
            .filter((ring) => ring.length > 2);
        // Re-nest rather than trusting the order, so outers and holes are unambiguous.
        polygons.push(...nestRings(rings));
    }
    return polygons;
}

/**
 * Merges relief outlines that physically overlap into single shapes.
 *
 * Most of the time nothing overlaps and this returns the input untouched. It matters for
 * letters whose accent is drawn as a separate contour that runs into the body - Ç and Ą are
 * the usual ones - because two overlapping outlines cannot be described as one polygon with
 * holes, and the face they are cut from would come out torn. Only the clusters that actually
 * touch are sent through the boolean union, so ordinary text pays nothing for it.
 */
export function mergeOverlapping(shapes: Polygon[]): { shapes: Polygon[]; merged: number } {
    if (shapes.length < 2) return { shapes, merged: 0 };

    const boxes = shapes.map((shape) => boundsOf([shape.outer]));

    // Union-find over shapes whose bounding boxes touch.
    const parent = shapes.map((_, i) => i);
    const find = (i: number): number => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    const join = (a: number, b: number) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[rb] = ra;
    };

    for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
            if (overlaps(boxes[i], boxes[j])) join(i, j);
        }
    }

    const clusters = new Map<number, number[]>();
    shapes.forEach((_, i) => {
        const root = find(i);
        const cluster = clusters.get(root);
        if (cluster) cluster.push(i);
        else clusters.set(root, [i]);
    });

    const out: Polygon[] = [];
    let merged = 0;
    for (const cluster of clusters.values()) {
        if (cluster.length === 1) {
            out.push(shapes[cluster[0]]);
            continue;
        }
        const geometries = cluster.map((i) => toClipperFormat(shapes[i]));
        try {
            const united = polygonClipping.union(geometries[0] as never, ...(geometries.slice(1) as never[]));
            const rebuilt = fromClipperFormat(united as unknown as number[][][][]);
            if (rebuilt.length === 0) throw new Error('union kosong');
            if (rebuilt.length < cluster.length) merged += cluster.length - rebuilt.length;
            out.push(...rebuilt);
        } catch {
            // A failed union is not worth failing the whole tag over: fall back to the
            // separate outlines, which still slice correctly even if the face is not welded.
            out.push(...cluster.map((i) => shapes[i]));
        }
    }

    return { shapes: out, merged };
}
