import sharp from 'sharp'
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { resolve } from 'path'

const src = resolve(import.meta.dirname, '../src/assets/logoWR.png')
const iconsDir = resolve(import.meta.dirname, '../src-tauri/icons')

const sizes = [
  32, 128, 256,
  // Store logos
  30, 44, 71, 89, 107, 142, 150, 284, 310,
]

const pngFiles = []

for (const size of sizes) {
  const outName = size <= 256 ? `${size}x${size}.png` : `Square${size}x${size}Logo.png`
  const outPath = `${iconsDir}/${outName}`
  await sharp(src).resize(size, size, { fit: 'cover' }).png().toFile(outPath)
  pngFiles.push({ size, path: outPath, name: outName })
  console.log(`✓ ${outName}`)
}

// Generate @2x variants
for (const size of [256]) {
  const outPath = `${iconsDir}/128x128@2x.png`
  await sharp(src).resize(size, size, { fit: 'cover' }).png().toFile(outPath)
  console.log(`✓ 128x128@2x.png`)
}

// Generate .ico with multiple resolutions (32x32 + 256x256)
const icoImages = [
  { file: '32x32.png', width: 32, height: 32 },
  { file: '256x256.png', width: 0, height: 0 },  // 0 = 256 in ICO
]
const pngBuffers = icoImages.map(({ file }) => readFileSync(`${iconsDir}/${file}`))

const numImages = pngBuffers.length
const icoHeader = Buffer.alloc(6)
icoHeader.writeUInt16LE(0, 0)       // reserved
icoHeader.writeUInt16LE(1, 2)       // ICO type
icoHeader.writeUInt16LE(numImages, 4)

let offset = 6 + numImages * 16
const dirEntries = icoImages.map(({ width, height }, i) => {
  const buf = pngBuffers[i]
  const entry = Buffer.alloc(16)
  entry.writeUInt8(width, 0)
  entry.writeUInt8(height, 1)
  entry.writeUInt8(0, 2)            // colors
  entry.writeUInt8(0, 3)            // reserved
  entry.writeUInt16LE(1, 4)         // planes
  entry.writeUInt16LE(32, 6)        // bpp
  entry.writeUInt32LE(buf.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += buf.length
  return entry
})

const ico = Buffer.concat([icoHeader, ...dirEntries, ...pngBuffers])
writeFileSync(`${iconsDir}/icon.ico`, ico)
console.log('✓ icon.ico')

// For icon.icns we just copy the largest PNG as placeholder
// (real .icns generation requires macOS tools, but Tauri can use PNG as fallback)
writeFileSync(`${iconsDir}/icon.icns`, pngBuffers[1])
console.log('✓ icon.icns (placeholder)')

// Also copy as generic icon.png
writeFileSync(`${iconsDir}/icon.png`, pngBuffers[1])
console.log('✓ icon.png')

// Remove square store logos (they just clutter, Tauri will handle)
// Actually keep them, they're needed for Windows Store

console.log('\n✅ Done!')
