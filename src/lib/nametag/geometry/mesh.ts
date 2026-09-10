import earcut from 'earcut';
import type { Ring } from './path';
import type { Polygon } from './polygon';

/**
 * Angles used to retry a triangulation, in radians.
 *
 * earcut joins each hole to the rest of the polygon with a horizontal bridge. Text sits on a
 * shared baseline, so letters offer bridge points that are exactly collinear with each other,
 * and earcut then folds those vertices away - the face it returns still covers the right area
 * but its outline no longer follows the rings the walls were built from, which tears the
 * surface open. Triangulating a rotated copy breaks the coincidence. Only the resulting
 * *indices* are used, so the emitted vertices stay bit-for-bit the originals.
 */
const RETRY_ANGLES = [0, 0.4363323129985824, 0.9599310885968813, 1.3962634015954636, 2.6179938779914944, 0.0174532925199433];

/** Start index of each ring in the flattened vertex array, plus the end sentinel. */
function ringRanges(vertexCount: number, holeIndices: number[]): Array<[number, number]> {
    const starts = [0, ...holeIndices];
    const ends = [...holeIndices, vertexCount];
    return starts.map((start, i) => [start, ends[i]] as [number, number]);
}

/**
 * True when the triangulation's outline is exactly the set of ring edges it was given, which
 * is what lets the face be welded to its walls without leaving a gap.
 */
function boundaryMatchesRings(indices: number[], ranges: Array<[number, number]>, vertexCount: number): boolean {
    const counts = new Map<number, number>();
    const edge = (a: number, b: number) => a * vertexCount + b;

    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];
        for (const [from, to] of [
            [a, b],
            [b, c],
            [c, a]
        ]) {
            const id = edge(from, to);
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
    }

    let ringEdges = 0;
    for (const [start, end] of ranges) {
        for (let i = start; i < end; i++) {
            const j = i + 1 === end ? start : i + 1;
            if ((counts.get(edge(i, j)) ?? 0) !== 1) return false;
            if ((counts.get(edge(j, i)) ?? 0) !== 0) return false;
            ringEdges++;
        }
    }

    // Any further unpaired edge would be an outline the walls know nothing about.
    let unpaired = 0;
    for (const [id, count] of counts) {
        const from = Math.floor(id / vertexCount);
        const to = id % vertexCount;
        const opposite = counts.get(edge(to, from)) ?? 0;
        if (opposite !== count) unpaired += count;
    }
    return unpaired === ringEdges;
}

function triangulate(vertices: number[], holeIndices: number[]): { indices: number[]; exact: boolean } {
    const vertexCount = vertices.length / 2;
    const ranges = ringRanges(vertexCount, holeIndices);
    let best: number[] = [];

    for (const angle of RETRY_ANGLES) {
        let input = vertices;
        if (angle !== 0) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            input = new Array(vertices.length);
            for (let i = 0; i < vertices.length; i += 2) {
                input[i] = vertices[i] * cos - vertices[i + 1] * sin;
                input[i + 1] = vertices[i] * sin + vertices[i + 1] * cos;
            }
        }
        const indices = earcut(input, holeIndices, 2);
        if (boundaryMatchesRings(indices, ranges, vertexCount)) return { indices, exact: true };
        if (indices.length > best.length) best = indices;
    }

    return { indices: best, exact: false };
}

export type Vec3 = [number, number, number];

/**
 * A triangle soup in millimetres. X and Y lie in the plane of the tag, Z is thickness.
 *
 * Every helper here assumes the winding convention used throughout the generator:
 * solid boundaries run counter-clockwise and holes run clockwise when seen from +Z.
 * Wall normals then come out facing away from the solid without any extra bookkeeping.
 */
export class Mesh {
    /** Nine floats per triangle: ax, ay, az, bx, by, bz, cx, cy, cz. */
    private readonly data: number[] = [];

    /** Counters that let the geometry check spot a triangulation that came back incomplete. */
    readonly stats = { slivers: 0, incompleteFaces: 0 };

    get triangleCount(): number {
        return this.data.length / 9;
    }

    addTriangle(a: Vec3, b: Vec3, c: Vec3): void {
        this.data.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    }

    /** Adds a planar quad as two triangles. Vertices must be given in order around the quad. */
    addQuad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
        this.addTriangle(a, b, c);
        this.addTriangle(a, c, d);
    }

    /**
     * Triangulates a polygon with holes and emits it as a flat face at height `z`.
     * `up` selects the normal direction: +Z when true, -Z when false.
     */
    addFace(polygon: Polygon, z: number, up: boolean): void {
        const vertices: number[] = [];
        const holeIndices: number[] = [];

        for (const [x, y] of polygon.outer) vertices.push(x, y);
        for (const hole of polygon.holes) {
            if (hole.length < 3) continue;
            holeIndices.push(vertices.length / 2);
            for (const [x, y] of hole) vertices.push(x, y);
        }
        if (vertices.length < 6) return;

        const { indices, exact } = triangulate(vertices, holeIndices);
        if (!exact) this.stats.incompleteFaces++;

        for (let i = 0; i < indices.length; i += 3) {
            const ax = vertices[indices[i] * 2];
            const ay = vertices[indices[i] * 2 + 1];
            const bx = vertices[indices[i + 1] * 2];
            const by = vertices[indices[i + 1] * 2 + 1];
            const cx = vertices[indices[i + 2] * 2];
            const cy = vertices[indices[i + 2] * 2 + 1];

            // earcut keeps the input winding, but a sliver can flip, so check each triangle.
            // Bridging two holes that share a baseline produces exactly flat triangles: they
            // carry no area but they do carry the edges that keep the face joined to its walls,
            // so they are kept and given the winding the rest of the face uses.
            const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            if (cross === 0) this.stats.slivers++;
            const counterClockwise = cross === 0 ? true : cross > 0;

            if (counterClockwise === up) this.addTriangle([ax, ay, z], [bx, by, z], [cx, cy, z]);
            else this.addTriangle([ax, ay, z], [cx, cy, z], [bx, by, z]);
        }
    }

    /** Extrudes the edges of a closed ring into a vertical wall between two heights. */
    addWalls(ring: Ring, zLow: number, zHigh: number): void {
        if (zHigh <= zLow) return;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [px, py] = ring[j];
            const [qx, qy] = ring[i];
            if (Math.abs(px - qx) < 1e-9 && Math.abs(py - qy) < 1e-9) continue;
            this.addQuad([px, py, zLow], [qx, qy, zLow], [qx, qy, zHigh], [px, py, zHigh]);
        }
    }

    /** A closed solid: bottom face, top face and walls around the outline and every hole. */
    addPrism(polygon: Polygon, zLow: number, zHigh: number): void {
        this.addFace(polygon, zHigh, true);
        this.addFace(polygon, zLow, false);
        this.addWalls(polygon.outer, zLow, zHigh);
        for (const hole of polygon.holes) this.addWalls(hole, zLow, zHigh);
    }

    /**
     * Copies another mesh in, shifted by the given offset.
     *
     * Plate mode builds each tag on its own at the origin and then places it, so a name that
     * repeats in the list is built once and stamped as many times as it appears.
     */
    appendTranslated(other: Mesh, dx: number, dy: number, dz = 0): void {
        const source = other.data;
        for (let i = 0; i < source.length; i += 3) {
            this.data.push(source[i] + dx, source[i + 1] + dy, source[i + 2] + dz);
        }
        this.stats.slivers += other.stats.slivers;
        this.stats.incompleteFaces += other.stats.incompleteFaces;
    }

    bounds(): { min: Vec3; max: Vec3 } {
        const min: Vec3 = [Infinity, Infinity, Infinity];
        const max: Vec3 = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < this.data.length; i += 3) {
            for (let axis = 0; axis < 3; axis++) {
                const v = this.data[i + axis];
                if (v < min[axis]) min[axis] = v;
                if (v > max[axis]) max[axis] = v;
            }
        }
        return { min, max };
    }

    /** Raw triangle data, for tests and mesh checks. */
    triangles(): readonly number[] {
        return this.data;
    }

    /** Encodes the mesh as a binary STL. */
    toSTL(header = 'KAKAS nametag'): Uint8Array {
        const count = this.triangleCount;
        const buffer = new ArrayBuffer(84 + count * 50);
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);

        // The 80-byte header is free-form; keep it ASCII and never start it with "solid",
        // which would make some readers treat the file as ASCII STL.
        const headerBytes = new TextEncoder().encode(header.slice(0, 79));
        bytes.set(headerBytes.subarray(0, 80), 0);
        view.setUint32(80, count, true);

        let offset = 84;
        for (let i = 0; i < this.data.length; i += 9) {
            const ax = this.data[i];
            const ay = this.data[i + 1];
            const az = this.data[i + 2];
            const bx = this.data[i + 3];
            const by = this.data[i + 4];
            const bz = this.data[i + 5];
            const cx = this.data[i + 6];
            const cy = this.data[i + 7];
            const cz = this.data[i + 8];

            let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
            let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
            let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            const length = Math.hypot(nx, ny, nz);
            if (length > 0) {
                nx /= length;
                ny /= length;
                nz /= length;
            }

            view.setFloat32(offset, nx, true);
            view.setFloat32(offset + 4, ny, true);
            view.setFloat32(offset + 8, nz, true);
            const coords = [ax, ay, az, bx, by, bz, cx, cy, cz];
            for (let k = 0; k < 9; k++) view.setFloat32(offset + 12 + k * 4, coords[k], true);
            view.setUint16(offset + 48, 0, true);
            offset += 50;
        }

        return bytes;
    }
}
