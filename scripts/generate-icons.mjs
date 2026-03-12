/**
 * 从 logo.png 生成 Tauri 所需的全套图标。
 * 用法: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC = 'logo.png';
const OUT = 'src-tauri/icons';

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
];

async function main() {
  // 确保输出目录存在
  fs.mkdirSync(OUT, { recursive: true });

  // 生成各尺寸 RGBA PNG
  for (const { name, size } of sizes) {
    await sharp(SRC)
      .resize(size, size)
      .ensureAlpha()
      .png()
      .toFile(path.join(OUT, name));
    console.log(`✅ ${name} (${size}x${size})`);
  }

  // 生成 ICO (内嵌 32x32 + 128x128 PNG)
  const png32 = await sharp(SRC).resize(32, 32).ensureAlpha().png().toBuffer();
  const png128 = await sharp(SRC).resize(128, 128).ensureAlpha().png().toBuffer();

  // ICO: header(6) + 2 entries(32) + png data
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);   // ICO type
  icoHeader.writeUInt16LE(2, 4);   // 2 images

  const entry1 = Buffer.alloc(16);
  entry1[0] = 32; entry1[1] = 32;
  entry1.writeUInt16LE(1, 4);
  entry1.writeUInt16LE(32, 6);
  entry1.writeUInt32LE(png32.length, 8);
  entry1.writeUInt32LE(6 + 32, 12);  // offset after header + 2 entries

  const entry2 = Buffer.alloc(16);
  entry2[0] = 0; entry2[1] = 0;  // 0 = 256 in ICO spec (128 here, but we use PNG embed)
  entry2.writeUInt16LE(1, 4);
  entry2.writeUInt16LE(32, 6);
  entry2.writeUInt32LE(png128.length, 8);
  entry2.writeUInt32LE(6 + 32 + png32.length, 12);

  fs.writeFileSync(
    path.join(OUT, 'icon.ico'),
    Buffer.concat([icoHeader, entry1, entry2, png32, png128])
  );
  console.log('✅ icon.ico');

  // 生成 ICNS (使用 iconutil，仅 macOS)
  const iconsetDir = path.join(OUT, 'icon.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const icnsSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const { name, size } of icnsSizes) {
    await sharp(SRC)
      .resize(size, size)
      .ensureAlpha()
      .png()
      .toFile(path.join(iconsetDir, name));
  }

  // 尝试用 iconutil 生成 .icns（仅 macOS 可用）
  try {
    const { execSync } = await import('child_process');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(OUT, 'icon.icns')}"`);
    console.log('✅ icon.icns (via iconutil)');
  } catch {
    // 非 macOS 环境，用 PNG 包装一个最简 ICNS
    const ic07Type = Buffer.from('ic07');
    const ic07Len = Buffer.alloc(4);
    ic07Len.writeUInt32BE(8 + png128.length, 0);
    const icnsType = Buffer.from('icns');
    const icnsLen = Buffer.alloc(4);
    icnsLen.writeUInt32BE(8 + 8 + png128.length, 0);
    fs.writeFileSync(
      path.join(OUT, 'icon.icns'),
      Buffer.concat([icnsType, icnsLen, ic07Type, ic07Len, png128])
    );
    console.log('✅ icon.icns (fallback)');
  }

  // 清理 iconset 临时目录
  fs.rmSync(iconsetDir, { recursive: true, force: true });

  console.log('\n🎉 全部图标生成完成！');
}

main().catch(console.error);