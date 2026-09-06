import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const distInstallerDir = path.join(projectRoot, 'dist_installer');

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.USE_SYSTEM_7ZA = 'true';

console.log(`[Release Packager] Packaging Dine360 v${version}...`);

if (fs.existsSync(distInstallerDir)) {
    console.log('Cleaning old build directory...');
    try {
        fs.rmSync(distInstallerDir, { recursive: true, force: true });
    } catch (e) {
        console.warn('Warning: Could not clean old dist_installer directory:', e.message);
    }
}

// Ensure 64-bit 7zip wrapper is used by electron-builder to prevent 32-bit 7za exit code crash
const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const builder7zDir = path.join(localAppData, 'electron-builder', 'Cache', '7zip@1.0.0', '7zip-win-x64-a34pt', 'bin');
const local64Bit7z = path.join(projectRoot, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
const wrapperExe = path.join(projectRoot, '7za_wrapper.exe');

if (fs.existsSync(local64Bit7z) && fs.existsSync(wrapperExe)) {
    try {
        fs.mkdirSync(builder7zDir, { recursive: true });
        fs.copyFileSync(local64Bit7z, path.join(builder7zDir, '7za_real.exe'));
        fs.copyFileSync(wrapperExe, path.join(builder7zDir, '7za.exe'));
        console.log('Successfully set 64-bit 7-Zip wrapper binary for installer packaging.');
    } catch (err) {
        console.warn('Warning: Could not set up 64-bit 7zip wrapper:', err.message);
    }
}

// 1. Run Vite build
console.log('Running Vite build...');
execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });

// 2. Run electron-builder --win nsis
console.log('Packaging Electron NSIS installer...');
execSync('npx electron-builder --win nsis', { cwd: projectRoot, stdio: 'inherit' });

console.log(`\n✨ RELEASE READY FOR GITHUB! ✨`);
console.log(`Location: ${distInstallerDir}`);
console.log(`Upload the generated .exe installer and latest.yml to your GitHub Release (v${version}).`);

