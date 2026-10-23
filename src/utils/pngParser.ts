/**
 * PNG tEXt Chunk Parser for SillyTavern Character Cards
 * 
 * SillyTavern stores character card JSON in PNG tEXt chunks with keyword "chara".
 * The value is base64-encoded JSON.
 */

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

function readUint32(data: Uint8Array, offset: number): number {
    return (
        ((data[offset] << 24) >>> 0) +
        ((data[offset + 1] << 16) >>> 0) +
        ((data[offset + 2] << 8) >>> 0) +
        data[offset + 3]
    )
}

export async function extractJsonFromPng(file: File): Promise<string | null> {
    const buffer = await file.arrayBuffer()
    const data = new Uint8Array(buffer)

    // Verify PNG signature
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (data[i] !== PNG_SIGNATURE[i]) {
            throw new Error('Not a valid PNG file')
        }
    }

    // Parse chunks
    let offset = 8 // Skip signature
    while (offset < data.length) {
        const chunkLength = readUint32(data, offset)
        const chunkType = String.fromCharCode(
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7]
        )

        if (chunkType === 'tEXt') {
            // tEXt chunk: keyword\0text
            const chunkData = data.slice(offset + 8, offset + 8 + chunkLength)

            // Find null separator between keyword and text
            let nullIdx = -1
            for (let i = 0; i < chunkData.length; i++) {
                if (chunkData[i] === 0) {
                    nullIdx = i
                    break
                }
            }

            if (nullIdx !== -1) {
                const keyword = new TextDecoder().decode(chunkData.slice(0, nullIdx))
                if (keyword === 'chara') {
                    const base64Text = new TextDecoder().decode(chunkData.slice(nullIdx + 1))
                    // Decode base64 to bytes, then decode bytes as UTF-8
                    const binaryString = atob(base64Text)
                    const bytes = new Uint8Array(binaryString.length)
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i)
                    }
                    const jsonString = new TextDecoder('utf-8').decode(bytes)
                    return jsonString
                }
            }
        }

        if (chunkType === 'IEND') break

        // Move to next chunk: 4 (length) + 4 (type) + chunkLength + 4 (CRC)
        offset += 12 + chunkLength
    }

    return null
}

/**
 * CRC32 calculation for PNG chunks
 */
function crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    const table = new Uint32Array(256)
    
    // Build CRC table
    for (let i = 0; i < 256; i++) {
        let c = i
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
        }
        table[i] = c
    }
    
    // Calculate CRC
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff]
    }
    
    return (crc ^ 0xffffffff) >>> 0
}

/**
 * Write a 32-bit unsigned integer in big-endian format
 */
function writeUint32(value: number): Uint8Array {
    return new Uint8Array([
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff
    ])
}

/**
 * Embed JSON character card data into a PNG image
 * 
 * @param pngFile - The source PNG file/blob
 * @param jsonData - The character card JSON object to embed
 * @returns A new Blob containing the PNG with embedded character data
 */
export async function embedJsonInPng(pngFile: File | Blob, jsonData: any): Promise<Blob> {
    const buffer = await pngFile.arrayBuffer()
    const data = new Uint8Array(buffer)

    // Verify PNG signature
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (data[i] !== PNG_SIGNATURE[i]) {
            throw new Error('Not a valid PNG file')
        }
    }

    // Prepare tEXt chunk data
    const jsonString = JSON.stringify(jsonData)
    // Use TextEncoder + manual base64 to handle Unicode (btoa only supports Latin1)
    const utf8Bytes = new TextEncoder().encode(jsonString)
    let binaryStr = ''
    for (let i = 0; i < utf8Bytes.length; i++) {
        binaryStr += String.fromCharCode(utf8Bytes[i])
    }
    const base64Json = btoa(binaryStr)
    const keyword = 'chara'
    
    // Build tEXt chunk content: keyword + null byte + base64 data
    const keywordBytes = new TextEncoder().encode(keyword)
    const base64Bytes = new TextEncoder().encode(base64Json)
    const chunkData = new Uint8Array(keywordBytes.length + 1 + base64Bytes.length)
    chunkData.set(keywordBytes, 0)
    chunkData[keywordBytes.length] = 0 // Null separator
    chunkData.set(base64Bytes, keywordBytes.length + 1)
    
    // Build complete tEXt chunk with type
    const chunkType = new TextEncoder().encode('tEXt')
    const chunkWithType = new Uint8Array(4 + chunkData.length)
    chunkWithType.set(chunkType, 0)
    chunkWithType.set(chunkData, 4)
    
    // Calculate CRC for type + data
    const crc = crc32(chunkWithType)
    
    // Build complete chunk: length + type + data + CRC
    const length = writeUint32(chunkData.length)
    const crcBytes = writeUint32(crc)
    const textChunk = new Uint8Array(length.length + chunkWithType.length + crcBytes.length)
    textChunk.set(length, 0)
    textChunk.set(chunkWithType, 4)
    textChunk.set(crcBytes, 4 + chunkWithType.length)
    
    // Find IEND chunk and insert tEXt chunk before it
    let offset = 8 // Skip signature
    let iendOffset = -1
    
    while (offset < data.length) {
        const chunkLength = readUint32(data, offset)
        const chunkType = String.fromCharCode(
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7]
        )
        
        if (chunkType === 'IEND') {
            iendOffset = offset
            break
        }
        
        offset += 12 + chunkLength
    }
    
    if (iendOffset === -1) {
        throw new Error('Invalid PNG: IEND chunk not found')
    }
    
    // Build new PNG: original data up to IEND + our tEXt chunk + IEND chunk
    const beforeIend = data.slice(0, iendOffset)
    const iendChunk = data.slice(iendOffset)
    const newPng = new Uint8Array(beforeIend.length + textChunk.length + iendChunk.length)
    newPng.set(beforeIend, 0)
    newPng.set(textChunk, beforeIend.length)
    newPng.set(iendChunk, beforeIend.length + textChunk.length)
    
    return new Blob([newPng], { type: 'image/png' })
}
