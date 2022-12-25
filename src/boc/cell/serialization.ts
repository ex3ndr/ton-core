import { BitReader } from "../BitReader";
import { BitString } from "../BitString";
import { Cell } from "../Cell";
import { topologicalSort } from "./utils/topologicalSort";
import { bitsForNumber } from "../../utils/bitsForNumber";
import { BitBuilder } from "../BitBuilder";
import { getBitsDescriptor, getRefsDescriptor } from "./descriptor";
import { bitsToPaddedBuffer } from "../utils/paddedBits";
import { crc32c } from "../../utils/crc32c";

function resolveCellSize(reader: BitReader, sizeBytes: number) {

    // Save
    reader.save();

    // D1
    const d1 = reader.loadUint(8);
    const refs = d1 % 8;

    // D2
    const d2 = reader.loadUint(8);
    const dataBytesize = Math.ceil(d2 / 2);

    // Reset
    reader.reset();

    return refs * sizeBytes + dataBytesize + 2;
}

function calcCellSize(cell: Cell, sizeBytes: number) {
    return 2 /* D1+D2 */ + Math.ceil(cell.bits.length / 8) + cell.refs.length * sizeBytes;
}

function parseBoc(src: Buffer) {
    let reader = new BitReader(new BitString(src, 0, src.length * 8));
    let magic = reader.loadUint(32);
    if (magic === 0x68ff65f3) {
        let size = reader.loadUint(8);
        let offBytes = reader.loadUint(8);
        let cells = reader.loadUint(size * 8);
        let roots = reader.loadUint(size * 8); // Must be 1
        let absent = reader.loadUint(size * 8);
        let totalCellSize = reader.loadUint(offBytes * 8);
        let index = reader.loadBuffer(cells * offBytes);
        let cellData = reader.loadBuffer(totalCellSize);
        return {
            size,
            offBytes,
            cells,
            roots,
            absent,
            totalCellSize,
            index,
            cellData,
            root: [0]
        };
    } else if (magic === 0xacc3a728) {
        let size = reader.loadUint(8);
        let offBytes = reader.loadUint(8);
        let cells = reader.loadUint(size * 8);
        let roots = reader.loadUint(size * 8); // Must be 1
        let absent = reader.loadUint(size * 8);
        let totalCellSize = reader.loadUint(offBytes * 8);
        let index = reader.loadBuffer(cells * offBytes);
        let cellData = reader.loadBuffer(totalCellSize);
        let crc32 = reader.loadBuffer(4);
        if (!crc32c(src.subarray(0, src.length - 4)).equals(crc32)) {
            throw Error('Invalid CRC32C');
        }
        return {
            size,
            offBytes,
            cells,
            roots,
            absent,
            totalCellSize,
            index,
            cellData,
            root: [0]
        };
    } else if (magic === 0xb5ee9c72) {
        let hasIdx = reader.loadUint(1);
        let hasCrc32c = reader.loadUint(1);
        let hasCacheBits = reader.loadUint(1);
        let flags = reader.loadUint(2); // Must be 0
        let size = reader.loadUint(3);
        let offBytes = reader.loadUint(8);
        let cells = reader.loadUint(size * 8);
        let roots = reader.loadUint(size * 8);
        let absent = reader.loadUint(size * 8);
        let totalCellSize = reader.loadUint(offBytes * 8);
        let root: number[] = [];
        for (let i = 0; i < roots; i++) {
            root.push(reader.loadUint(size * 8));
        }
        let index: Buffer | null = null;
        if (hasIdx) {
            index = reader.loadBuffer(cells * offBytes);
        }
        let cellData = reader.loadBuffer(totalCellSize);
        if (hasCrc32c) {
            let crc32 = reader.loadBuffer(4);
            if (!crc32c(src.subarray(0, src.length - 4)).equals(crc32)) {
                throw Error('Invalid CRC32C');
            }
        }
        return {
            size,
            offBytes,
            cells,
            roots,
            absent,
            totalCellSize,
            index,
            cellData,
            root
        };
    } else {
        throw Error('Invalid magic');
    }
}

export function deserializeBoc(src: Buffer) {
    let boc = parseBoc(src);
    let reader = new BitReader(new BitString(boc.cellData, 0, boc.cellData.length * 8));

    // Index
    let getOffset: (id: number) => number;
    // if (boc.index) {
    //     let indexReader = new BitReader(new BitString(boc.index, 0, boc.index.length * 8));
    //     for (let i = 0; i < boc.cells; i++) {
    //         indexReader.reset();
    //         indexReader.skip(i * boc.offBytes * 8);
    //         let off = indexReader.loadUint(boc.offBytes * 8);
    //         console.warn(off);
    //     }
    //     getOffset = (id: number) => {
    //         indexReader.reset();
    //         indexReader.skip(id * boc.offBytes * 8);
    //         let off = indexReader.loadUint(boc.offBytes * 8);
    //         console.warn(off);
    //         return off;
    //     }
    // } else {
    let index: number[] = [];
    let offset = 0;
    for (let i = 0; i < boc.cells; i++) {
        let size = resolveCellSize(reader, boc.size);
        index.push(offset);
        offset += size;
        reader.skip(size * 8);
    }
    getOffset = (id: number) => {
        if (id < 0 || id >= index.length) {
            throw Error('Invalid cell id: ' + id);
        }
        return index[id];
    };
    // }

    // Load cell
    let loadCell = (id: number): Cell => {

        console.warn('loading cell ' + id);

        // Go to cell
        const offset = getOffset(id);
        reader.reset();
        reader.skip(offset * 8);

        // Load descriptor
        const d1 = reader.loadUint(8);
        const d2 = reader.loadUint(8);
        // const isExotic = !!(d1 & 8);
        const refNum = d1 % 8;
        const dataBytesize = Math.ceil(d2 / 2);
        const fullfilledBits = !!(d2 % 2);

        console.warn({ d1, d2, refNum, dataBytesize, fullfilledBits });

        // Load bits size
        let totalBits = dataBytesize * 8;
        if (fullfilledBits) {

            // Load padding
            let paddedBits = 0;
            while (true) {

                // Read last bit
                reader.skip(totalBits - paddedBits - 1);
                let bt = reader.preloadBit();
                reader.skip(-(totalBits - paddedBits - 1));

                // Update number of bits
                paddedBits++;

                // Check if last bit is set: exit loop
                if (bt) {
                    break;
                }
            }

            // Update total bits
            totalBits = totalBits - paddedBits;
        }

        // Load bits
        let bits = reader.loadBits(totalBits);
        reader.skip(dataBytesize * 8 - totalBits);

        // Load refs
        let refs: Cell[] = [];
        let refId: number[] = [];
        for (let i = 0; i < refNum; i++) {
            refId.push(reader.loadUint(boc.offBytes * 8));
        }
        for (let r of refId) {
            refs.push(loadCell(r));
        }

        // Return
        return new Cell({ bits, refs });
    }

    // Load roots
    let roots: Cell[] = [];
    for (let i = 0; i < boc.root.length; i++) {
        roots.push(loadCell(boc.root[i]));
    }

    console.warn(boc.root);
    console.warn(roots);

    // Return
    return roots;
}

function writeCellToBuilder(cell: Cell, refs: number[], sizeBytes: number, to: BitBuilder) {
    let d1 = getRefsDescriptor(cell);
    let d2 = getBitsDescriptor(cell);
    to.writeUint(d1, 8);
    to.writeUint(d2, 8);
    to.writeBuffer(bitsToPaddedBuffer(cell.bits));
    for (let r of refs) {
        to.writeUint(r, sizeBytes * 8);
    }
}

export function serializeBoc(root: Cell, opts?: { idx?: boolean, crc32c?: boolean }) {

    // Sort cells
    let allCells = topologicalSort(root);

    // Calculcate parameters
    let cellsNum = allCells.length;
    let has_idx = opts?.idx ?? true;
    let has_crc32c = opts?.crc32c ?? true;
    let has_cache_bits = false;
    let flags = 0;
    let sizeBytes = Math.max(Math.ceil(bitsForNumber(cellsNum, 'uint') / 8), 1);
    let totalCellSize: number = 0;
    let index: number[] = [];
    for (let c of allCells) {
        let sz = calcCellSize(c.cell, sizeBytes);
        index.push(totalCellSize);
        totalCellSize += sz;
    }
    let offsetBytes = Math.max(Math.ceil(bitsForNumber(totalCellSize, 'uint') / 8), 1);
    let totalSize = (
        4 + // magic
        1 + // flags and s_bytes
        1 + // offset_bytes
        3 * sizeBytes + // cells_num, roots, complete
        offsetBytes + // full_size
        1 * sizeBytes + // root_idx
        (has_idx ? cellsNum * offsetBytes : 0) +
        totalCellSize +
        (has_crc32c ? 4 : 0)
    ) * 8;

    // Serialize
    let builder = new BitBuilder(totalSize);
    builder.writeUint(0xb5ee9c72, 32); // Magic
    builder.writeBit(has_idx); // Has index
    builder.writeBit(has_crc32c); // Has crc32c
    builder.writeBit(has_cache_bits); // Has cache bits
    builder.writeUint(flags, 2); // Flags
    builder.writeUint(sizeBytes, 3); // Size bytes
    builder.writeUint(offsetBytes, 8); // Offset bytes
    builder.writeUint(cellsNum, sizeBytes * 8); // Cells num
    builder.writeUint(1, sizeBytes * 8); // Roots num
    builder.writeUint(0, sizeBytes * 8); // Absent num
    builder.writeUint(totalCellSize, offsetBytes * 8); // Total cell size
    builder.writeUint(0, sizeBytes * 8); // Root id == 0
    if (has_idx) { // Index
        for (let i = 0; i < cellsNum; i++) {
            builder.writeUint(index[i], offsetBytes * 8);
        }
    }
    for (let i = 0; i < cellsNum; i++) { // Cells
        writeCellToBuilder(allCells[i].cell, allCells[i].refs, sizeBytes, builder);
    }
    if (has_crc32c) {
        let crc32 = crc32c(builder.buffer()) // builder.buffer() is fast since it doesn't allocate new memory
        builder.writeBuffer(crc32);
    }

    // Sanity Check
    let res = builder.buffer();
    if (res.length !== totalSize / 8) {
        throw Error('Internal error');
    }
    return res;
}