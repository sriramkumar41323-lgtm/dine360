import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const distInstallerDir = path.join(projectRoot, 'dist_installer');
const winUnpackedDir = path.join(distInstallerDir, 'win-unpacked');

console.log(`[Release Packager] Packaging Dine360 v${version}...`);

// 1. Run Vite build
console.log('Running Vite build...');
execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });

// 2. Run electron-builder --win dir
console.log('Packaging Electron executable (win-unpacked)...');
execSync('npx electron-builder --win dir', { cwd: projectRoot, stdio: 'inherit' });

// 3. Compress win-unpacked into zip installer
const zipFileName = `Dine360_POS_v${version}_Setup.zip`;
const zipFilePath = path.join(distInstallerDir, zipFileName);

if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
}

console.log(`Creating release archive: ${zipFileName}...`);
execSync(`powershell -Command "Compress-Archive -Path '${winUnpackedDir}\\*' -DestinationPath '${zipFilePath}' -Force"`, { cwd: projectRoot, stdio: 'inherit' });

// 4. Calculate SHA-512 base64 and size
const fileBuffer = fs.readFileSync(zipFilePath);
const fileSize = fileBuffer.length;
const sha512Base64 = crypto.createHash('sha512').update(fileBuffer).digest('base64');
const releaseDate = new Date().toISOString();

// 5. Generate latest.yml
const latestYmlContent = `version: ${version}
files:
  - url: ${zipFileName}
    sha512: ${sha512Base64}
    size: ${fileSize}
path: ${zipFileName}
sha512: ${sha512Base64}
releaseDate: '${releaseDate}'
`;

const latestYmlPath = path.join(distInstallerDir, 'latest.yml');
fs.writeFileSync(latestYmlPath, latestYmlContent, 'utf8');

console.log(`\n✨ RELEASE READY FOR GITHUB! ✨`);
console.log(`Location: ${distInstallerDir}`);
console.log(`Upload both files to your GitHub Release (v${version}):`);
console.log(`  1. 📄 latest.yml`);
console.log(`  2. 📦 ${zipFileName}`);
