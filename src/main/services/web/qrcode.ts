/**
 * Minimal QR Code encoder (byte mode, error correction level M, versions 1-10).
 *
 * The phone remote needs a scannable code for its LAN URL and nothing else, so
 * this stays deliberately small instead of pulling in a QR dependency.
 */

const EC_LEVEL_M_BITS = 0b00
const FORMAT_MASK = 0b101010000010010
const ALIGNMENT_CENTERS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
]

interface BlockLayout {
  ecCodewordsPerBlock: number
  groups: Array<{ blocks: number; dataCodewords: number }>
}

/** Indexed by version (1-10) for error correction level M. */
const BLOCK_LAYOUT: Record<number, BlockLayout> = {
  1: { ecCodewordsPerBlock: 10, groups: [{ blocks: 1, dataCodewords: 16 }] },
  2: { ecCodewordsPerBlock: 16, groups: [{ blocks: 1, dataCodewords: 28 }] },
  3: { ecCodewordsPerBlock: 26, groups: [{ blocks: 1, dataCodewords: 44 }] },
  4: { ecCodewordsPerBlock: 18, groups: [{ blocks: 2, dataCodewords: 32 }] },
  5: { ecCodewordsPerBlock: 24, groups: [{ blocks: 2, dataCodewords: 43 }] },
  6: { ecCodewordsPerBlock: 16, groups: [{ blocks: 4, dataCodewords: 27 }] },
  7: { ecCodewordsPerBlock: 18, groups: [{ blocks: 4, dataCodewords: 31 }] },
  8: {
    ecCodewordsPerBlock: 22,
    groups: [
      { blocks: 2, dataCodewords: 38 },
      { blocks: 2, dataCodewords: 39 }
    ]
  },
  9: {
    ecCodewordsPerBlock: 22,
    groups: [
      { blocks: 3, dataCodewords: 36 },
      { blocks: 2, dataCodewords: 37 }
    ]
  },
  10: {
    ecCodewordsPerBlock: 26,
    groups: [
      { blocks: 4, dataCodewords: 43 },
      { blocks: 1, dataCodewords: 44 }
    ]
  }
}

const EXP_TABLE = new Uint8Array(256)
const LOG_TABLE = new Uint8Array(256)

for (let index = 0, value = 1; index < 255; index += 1) {
  EXP_TABLE[index] = value
  LOG_TABLE[value] = index
  value <<= 1
  if (value & 0x100) {
    value ^= 0x11d
  }
}

function galoisMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) {
    return 0
  }

  return EXP_TABLE[(LOG_TABLE[left] + LOG_TABLE[right]) % 255]
}

function buildGeneratorPolynomial(degree: number): number[] {
  let polynomial = [1]

  for (let index = 0; index < degree; index += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0)

    for (let position = 0; position < polynomial.length; position += 1) {
      next[position] ^= polynomial[position]
      next[position + 1] ^= galoisMultiply(polynomial[position], EXP_TABLE[index])
    }

    polynomial = next
  }

  return polynomial
}

function computeErrorCorrection(data: number[], ecCodewords: number): number[] {
  const generator = buildGeneratorPolynomial(ecCodewords)
  const remainder = new Array<number>(ecCodewords).fill(0)

  for (const byte of data) {
    const factor = byte ^ remainder[0]
    remainder.shift()
    remainder.push(0)

    if (factor !== 0) {
      for (let index = 0; index < ecCodewords; index += 1) {
        remainder[index] ^= galoisMultiply(generator[index + 1], factor)
      }
    }
  }

  return remainder
}

function totalDataCodewords(version: number): number {
  return BLOCK_LAYOUT[version].groups.reduce(
    (total, group) => total + group.blocks * group.dataCodewords,
    0
  )
}

function characterCountBits(version: number): number {
  return version < 10 ? 8 : 16
}

function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= 10; version += 1) {
    const capacityBits = totalDataCodewords(version) * 8
    const requiredBits = 4 + characterCountBits(version) + byteLength * 8

    if (requiredBits <= capacityBits) {
      return version
    }
  }

  throw new Error('Payload is too long for a version 10 QR code.')
}

function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const capacity = totalDataCodewords(version)
  const bits: number[] = []

  const pushBits = (value: number, length: number): void => {
    for (let index = length - 1; index >= 0; index -= 1) {
      bits.push((value >> index) & 1)
    }
  }

  pushBits(0b0100, 4)
  pushBits(bytes.length, characterCountBits(version))

  for (const byte of bytes) {
    pushBits(byte, 8)
  }

  const capacityBits = capacity * 8
  pushBits(0, Math.min(4, capacityBits - bits.length))

  while (bits.length % 8 !== 0) {
    bits.push(0)
  }

  const codewords: number[] = []

  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0
    for (let offset = 0; offset < 8; offset += 1) {
      byte = (byte << 1) | bits[index + offset]
    }
    codewords.push(byte)
  }

  const padBytes = [0xec, 0x11]
  let padIndex = 0

  while (codewords.length < capacity) {
    codewords.push(padBytes[padIndex % 2])
    padIndex += 1
  }

  return codewords
}

function interleave(codewords: number[], version: number): number[] {
  const layout = BLOCK_LAYOUT[version]
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  let cursor = 0

  for (const group of layout.groups) {
    for (let index = 0; index < group.blocks; index += 1) {
      const block = codewords.slice(cursor, cursor + group.dataCodewords)
      cursor += group.dataCodewords
      dataBlocks.push(block)
      ecBlocks.push(computeErrorCorrection(block, layout.ecCodewordsPerBlock))
    }
  }

  const result: number[] = []
  const longestData = Math.max(...dataBlocks.map((block) => block.length))

  for (let index = 0; index < longestData; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) {
        result.push(block[index])
      }
    }
  }

  for (let index = 0; index < layout.ecCodewordsPerBlock; index += 1) {
    for (const block of ecBlocks) {
      result.push(block[index])
    }
  }

  return result
}

type ModuleGrid = Array<Array<number | null>>

function createGrid(size: number): ModuleGrid {
  return Array.from({ length: size }, () => new Array<number | null>(size).fill(null))
}

function placeFinder(grid: ModuleGrid, row: number, column: number): void {
  for (let deltaRow = -1; deltaRow <= 7; deltaRow += 1) {
    for (let deltaColumn = -1; deltaColumn <= 7; deltaColumn += 1) {
      const targetRow = row + deltaRow
      const targetColumn = column + deltaColumn

      if (targetRow < 0 || targetRow >= grid.length || targetColumn < 0 || targetColumn >= grid.length) {
        continue
      }

      const inRing =
        (deltaRow >= 0 && deltaRow <= 6 && (deltaColumn === 0 || deltaColumn === 6)) ||
        (deltaColumn >= 0 && deltaColumn <= 6 && (deltaRow === 0 || deltaRow === 6))
      const inCore = deltaRow >= 2 && deltaRow <= 4 && deltaColumn >= 2 && deltaColumn <= 4

      grid[targetRow][targetColumn] = inRing || inCore ? 1 : 0
    }
  }
}

function placeAlignment(grid: ModuleGrid, version: number): void {
  const centers = ALIGNMENT_CENTERS[version]

  for (const row of centers) {
    for (const column of centers) {
      if (grid[row][column] !== null) {
        continue
      }

      for (let deltaRow = -2; deltaRow <= 2; deltaRow += 1) {
        for (let deltaColumn = -2; deltaColumn <= 2; deltaColumn += 1) {
          const isDark =
            Math.max(Math.abs(deltaRow), Math.abs(deltaColumn)) !== 1
          grid[row + deltaRow][column + deltaColumn] = isDark ? 1 : 0
        }
      }
    }
  }
}

function placeTimingAndReserved(grid: ModuleGrid, version: number): void {
  const size = grid.length

  for (let index = 8; index < size - 8; index += 1) {
    const value = index % 2 === 0 ? 1 : 0
    grid[6][index] = value
    grid[index][6] = value
  }

  // Dark module.
  grid[size - 8][8] = 1

  // Format information areas are reserved with a placeholder, filled in later.
  for (let index = 0; index <= 8; index += 1) {
    if (grid[8][index] === null) {
      grid[8][index] = 0
    }
    if (grid[index][8] === null) {
      grid[index][8] = 0
    }
  }

  for (let index = 0; index < 8; index += 1) {
    if (grid[size - 1 - index][8] === null) {
      grid[size - 1 - index][8] = 0
    }
    if (grid[8][size - 1 - index] === null) {
      grid[8][size - 1 - index] = 0
    }
  }

  if (version >= 7) {
    for (let index = 0; index < 18; index += 1) {
      const row = Math.floor(index / 3)
      const column = index % 3
      grid[row][size - 11 + column] = 0
      grid[size - 11 + column][row] = 0
    }
  }
}

function placeData(grid: ModuleGrid, codewords: number[]): Array<{ row: number; column: number; bit: number }> {
  const size = grid.length
  const placed: Array<{ row: number; column: number; bit: number }> = []
  let bitIndex = 0
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    // The vertical timing pattern owns column 6, so the column pairs shift left past it.
    if (right === 6) {
      right = 5
    }

    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step

      for (const column of [right, right - 1]) {
        if (grid[row][column] !== null) {
          continue
        }

        const byte = codewords[bitIndex >> 3] ?? 0
        const bit = (byte >> (7 - (bitIndex & 7))) & 1
        bitIndex += 1
        grid[row][column] = bit
        placed.push({ row, column, bit })
      }
    }

    upward = !upward
  }

  return placed
}

const MASK_PREDICATES: Array<(row: number, column: number) => boolean> = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => ((((row * column) % 2) + ((row * column) % 3)) % 2) === 0,
  (row, column) => ((((row + column) % 2) + ((row * column) % 3)) % 2) === 0
]

function computeFormatBits(mask: number): number {
  const data = (EC_LEVEL_M_BITS << 3) | mask
  let remainder = data << 10

  for (let index = 14; index >= 10; index -= 1) {
    if ((remainder >> index) & 1) {
      remainder ^= 0b10100110111 << (index - 10)
    }
  }

  return ((data << 10) | remainder) ^ FORMAT_MASK
}

function computeVersionBits(version: number): number {
  let remainder = version << 12

  for (let index = 17; index >= 12; index -= 1) {
    if ((remainder >> index) & 1) {
      remainder ^= 0b1111100100101 << (index - 12)
    }
  }

  return (version << 12) | remainder
}

function applyFormatInformation(matrix: number[][], mask: number): void {
  const size = matrix.length
  const bits = computeFormatBits(mask)

  for (let index = 0; index < 15; index += 1) {
    const bit = (bits >> index) & 1

    if (index < 6) {
      matrix[index][8] = bit
    } else if (index === 6) {
      matrix[7][8] = bit
    } else if (index === 7) {
      matrix[8][8] = bit
    } else if (index === 8) {
      matrix[8][7] = bit
    } else {
      matrix[8][14 - index] = bit
    }

    if (index < 8) {
      matrix[8][size - 1 - index] = bit
    } else {
      matrix[size - 15 + index][8] = bit
    }
  }

  matrix[size - 8][8] = 1
}

function applyVersionInformation(matrix: number[][], version: number): void {
  if (version < 7) {
    return
  }

  const size = matrix.length
  const bits = computeVersionBits(version)

  for (let index = 0; index < 18; index += 1) {
    const bit = (bits >> index) & 1
    const row = Math.floor(index / 3)
    const column = index % 3
    matrix[row][size - 11 + column] = bit
    matrix[size - 11 + column][row] = bit
  }
}

function scorePenalty(matrix: number[][]): number {
  const size = matrix.length
  let penalty = 0

  const scoreLine = (getModule: (primary: number, secondary: number) => number): void => {
    for (let primary = 0; primary < size; primary += 1) {
      let runValue = getModule(primary, 0)
      let runLength = 1

      for (let secondary = 1; secondary < size; secondary += 1) {
        const value = getModule(primary, secondary)

        if (value === runValue) {
          runLength += 1
          continue
        }

        if (runLength >= 5) {
          penalty += runLength - 2
        }

        runValue = value
        runLength = 1
      }

      if (runLength >= 5) {
        penalty += runLength - 2
      }
    }
  }

  scoreLine((row, column) => matrix[row][column])
  scoreLine((column, row) => matrix[row][column])

  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const value = matrix[row][column]
      if (
        value === matrix[row][column + 1] &&
        value === matrix[row + 1][column] &&
        value === matrix[row + 1][column + 1]
      ) {
        penalty += 3
      }
    }
  }

  const patterns = [
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  ]

  const matchesPattern = (values: number[], start: number, pattern: number[]): boolean =>
    pattern.every((bit, offset) => values[start + offset] === bit)

  for (let index = 0; index < size; index += 1) {
    const rowValues = matrix[index]
    const columnValues = matrix.map((row) => row[index])

    for (let start = 0; start + 11 <= size; start += 1) {
      for (const pattern of patterns) {
        if (matchesPattern(rowValues, start, pattern)) {
          penalty += 40
        }
        if (matchesPattern(columnValues, start, pattern)) {
          penalty += 40
        }
      }
    }
  }

  const darkModules = matrix.reduce(
    (total, row) => total + row.reduce((rowTotal, value) => rowTotal + value, 0),
    0
  )
  const darkRatio = (darkModules * 100) / (size * size)
  penalty += Math.floor(Math.abs(darkRatio - 50) / 5) * 10

  return penalty
}

export interface QrCode {
  size: number
  version: number
  modules: boolean[][]
}

export function encodeQrCode(text: string): QrCode {
  const bytes = new TextEncoder().encode(text)
  const version = chooseVersion(bytes.length)
  const size = version * 4 + 17
  const codewords = interleave(buildCodewords(bytes, version), version)

  const layout = createGrid(size)
  placeFinder(layout, 0, 0)
  placeFinder(layout, 0, size - 7)
  placeFinder(layout, size - 7, 0)
  placeAlignment(layout, version)
  placeTimingAndReserved(layout, version)

  const dataCells = placeData(layout, codewords)

  let best: { matrix: number[][]; penalty: number } | null = null

  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = layout.map((row) => row.map((value) => value ?? 0))

    for (const cell of dataCells) {
      matrix[cell.row][cell.column] = MASK_PREDICATES[mask](cell.row, cell.column)
        ? cell.bit ^ 1
        : cell.bit
    }

    applyFormatInformation(matrix, mask)
    applyVersionInformation(matrix, version)

    const penalty = scorePenalty(matrix)

    if (!best || penalty < best.penalty) {
      best = { matrix, penalty }
    }
  }

  return {
    size,
    version,
    modules: best!.matrix.map((row) => row.map((value) => value === 1))
  }
}

/** Renders the code as a compact single-path SVG suitable for inlining. */
export function renderQrCodeSvg(text: string, options?: { margin?: number }): string {
  const { size, modules } = encodeQrCode(text)
  const margin = options?.margin ?? 2
  const total = size + margin * 2
  const path: string[] = []

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (modules[row][column]) {
        path.push(`M${column + margin} ${row + margin}h1v1h-1z`)
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${path.join('')}" fill="#000000"/>`,
    '</svg>'
  ].join('')
}
