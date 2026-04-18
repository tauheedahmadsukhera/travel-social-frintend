#!/usr/bin/env node

/**
 * Prints SHA-1 (and SHA-256) for Google Sign-In / Firebase.
 * 1) Tries Gradle signingReport
 * 2) If Gradle fails: keytool on android/app/debug.keystore (what app/build.gradle uses), then ~/.android/debug.keystore
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const androidPath = path.join(__dirname, '..', 'android');

/** Gradle 8.x / AGP used by RN Expo: run Gradle with JDK 17–22 (not 25+). */
const MIN_JAVA_FOR_GRADLE = 17;
const MAX_JAVA_FOR_GRADLE = 22;

function getJavaExe(javaHome) {
  return path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
}

/** @returns {number|null} major version e.g. 17, 21, 25 */
function readJavaMajor(javaHome) {
  const javaExe = getJavaExe(javaHome);
  if (!fs.existsSync(javaExe)) return null;
  try {
    const out = execSync(`"${javaExe}" -version 2>&1`, { encoding: 'utf-8', shell: true, maxBuffer: 1024 * 1024 });
    const m = String(out).match(/version "?(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function isOkForGradle(javaHome) {
  const major = readJavaMajor(javaHome);
  return major != null && major >= MIN_JAVA_FOR_GRADLE && major <= MAX_JAVA_FOR_GRADLE;
}

/** Extra JAVA_HOME candidates (Windows: Android Studio bundled JBR, common installs). */
function collectJavaHomeCandidates() {
  const out = [];
  const push = (p) => {
    if (p && fs.existsSync(p)) out.push(p);
  };

  const explicit = process.env.GET_SHA1_JAVA_HOME || process.env.GRADLE_JAVA_HOME;
  if (explicit) push(path.resolve(explicit));

  if (process.env.JAVA_HOME) push(path.resolve(process.env.JAVA_HOME));

  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';

    push(path.join(pf, 'Android', 'Android Studio', 'jbr'));
    push(path.join(pf, 'Android', 'Android Studio', 'jbr', 'Contents', 'Home'));
    push(path.join(local, 'Programs', 'Android', 'Android Studio', 'jbr'));
    push(path.join(local, 'Programs', 'Android', 'Android Studio', 'jbr', 'Contents', 'Home'));
    push(path.join(pf, 'JetBrains', 'Android Studio', 'jbr'));
    push(path.join(pf, 'Android Studio', 'jbr'));

    const scanDirs = [path.join(pf, 'Eclipse Adoptium'), path.join(pf, 'Microsoft'), path.join(pf, 'Java'), path.join(pf86, 'Java')];
    for (const dir of scanDirs) {
      if (!fs.existsSync(dir)) continue;
      let names;
      try {
        names = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of names) {
        if (!d.isDirectory()) continue;
        const name = d.name;
        if (/^jdk-1[7-9]\b/i.test(name) || /^jdk-2[0-2]\b/i.test(name) || /^jdk-17/i.test(name) || /^jdk-21/i.test(name)) {
          push(path.join(dir, name));
        }
      }
    }
  } else {
    push('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
    push('/Applications/Android Studio.app/Contents/jbr');
    const jvms = '/Library/Java/JavaVirtualMachines';
    if (fs.existsSync(jvms)) {
      try {
        for (const name of fs.readdirSync(jvms)) {
          if (!/jdk|jre|\.jdk/i.test(name)) continue;
          push(path.join(jvms, name, 'Contents', 'Home'));
        }
      } catch {
        /* ignore */
      }
    }
  }

  return [...new Set(out)];
}

/**
 * If PATH/JAVA_HOME points to Java 23+, Gradle signingReport often breaks.
 * Prefer Android Studio JBR or JDK 17–22 for the Gradle child process only.
 */
function resolveJavaHomeForGradle() {
  const override = process.env.GET_SHA1_JAVA_HOME || process.env.GRADLE_JAVA_HOME;
  if (override && isOkForGradle(override)) {
    return { javaHome: path.resolve(override), source: 'GET_SHA1_JAVA_HOME / GRADLE_JAVA_HOME' };
  }

  if (process.env.JAVA_HOME && isOkForGradle(process.env.JAVA_HOME)) {
    return { javaHome: path.resolve(process.env.JAVA_HOME), source: 'JAVA_HOME' };
  }

  for (const candidate of collectJavaHomeCandidates()) {
    if (isOkForGradle(candidate)) {
      return { javaHome: candidate, source: candidate.includes('Android Studio') || candidate.includes('jbr') ? 'Android Studio jbr / install' : 'discovered JDK' };
    }
  }

  return { javaHome: null, source: null };
}

function envForGradle(javaHome) {
  if (!javaHome) return { ...process.env };
  const sep = path.delimiter;
  const bin = path.join(javaHome, 'bin');
  const pathEnv = `${bin}${sep}${process.env.PATH || ''}`;
  return { ...process.env, JAVA_HOME: javaHome, PATH: pathEnv };
}

function getProjectAppDebugKeystorePath() {
  return path.join(androidPath, 'app', 'debug.keystore');
}

function getDefaultDebugKeystorePath() {
  const base = process.env.USERPROFILE || process.env.HOME;
  if (!base) return null;
  return path.join(base, '.android', 'debug.keystore');
}

/** Read SHA from a debug keystore (androiddebugkey / android passwords). */
function tryKeytoolFromKeystore(keystorePath, labelForErrors) {
  if (!keystorePath || !fs.existsSync(keystorePath)) {
    return null;
  }
  const keytoolBin = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool')
    : 'keytool';
  try {
    const out = execSync(
      `"${keytoolBin}" -list -v -keystore "${keystorePath}" -alias androiddebugkey -storepass android -keypass android`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, shell: true }
    );
    const sha1m = out.match(/SHA1:\s*([A-F0-9:]+)/i);
    const sha256m = out.match(/SHA256:\s*([A-F0-9:]+)/i);
    return {
      sha1: sha1m ? sha1m[1].trim() : null,
      sha256: sha256m ? sha256m[1].trim() : null,
      path: keystorePath,
    };
  } catch (e) {
    console.log(`⚠️  keytool failed (${labelForErrors}):`, e.message);
    return null;
  }
}

/** Prefer app’s checked-in debug keystore (matches signingConfig in app/build.gradle). */
function tryKeytoolFallbackChain() {
  const appKs = getProjectAppDebugKeystorePath();
  const fromApp = tryKeytoolFromKeystore(appKs, 'android/app/debug.keystore');
  if (fromApp?.sha1) {
    return { ...fromApp, label: 'android/app/debug.keystore (used by this app for debug)' };
  }

  const userKs = getDefaultDebugKeystorePath();
  const fromUser = tryKeytoolFromKeystore(userKs, '~/.android/debug.keystore');
  if (fromUser?.sha1) {
    return { ...fromUser, label: '~/.android/debug.keystore (user default; may NOT match app/build.gradle)' };
  }

  console.log('⚠️  No debug keystore found at android/app/debug.keystore or ~/.android/debug.keystore');
  console.log(
    '   → Open Android Studio → Gradle → app → signingReport (after setting Gradle JDK to 17–22), or run a debug build once.'
  );
  return null;
}

function printFirebaseSteps() {
  console.log('\n📋 Next steps (Firebase + Google Cloud):\n');
  console.log('1. Copy the SHA-1 above and add it in Firebase → Project settings → Your apps → Android app');
  console.log('2. Google Cloud Console → APIs & Services → Credentials → your Android OAuth client');
  console.log('   → same package name + SHA-1 (Firebase fingerprint alone is sometimes not enough)');
  console.log('3. Wait a few minutes after saving, then reinstall the app and retry Sign-In\n');
}

function printJavaVersionHelp(combinedErr) {
  if (!combinedErr.includes('Unsupported class file major version')) return;
  console.log('\n--- Why Gradle failed ---');
  console.log(
    'Your default Java is too new for this project’s Gradle (e.g. "major version 69" = JDK 25).'
  );
  console.log('Fix (pick one):');
  console.log('  • Install JDK 17 (e.g. Temurin 17), set JAVA_HOME to it, reopen terminal, run: npm run get-sha1');
  console.log('  • Or Android Studio: File → Settings → Build → Build Tools → Gradle → Gradle JDK → 17');
  console.log('  • Or set GET_SHA1_JAVA_HOME to a JDK 17–22 folder (this script uses it for Gradle only).\n');
}

console.log('\n🔐 Android SHA-1 / SHA-256 (Google Sign-In / Firebase)\n');

let gradleOutput = '';
try {
  const { javaHome, source } = resolveJavaHomeForGradle();
  if (javaHome) {
    const major = readJavaMajor(javaHome);
    console.log(`📱 Trying Gradle signingReport (Java ${major} — ${source})...\n`);
  } else {
    console.log('📱 Trying Gradle signingReport (system Java; if this fails, install JDK 17 or Android Studio)...\n');
  }
  const command = process.platform === 'win32' ? 'gradlew.bat signingReport' : './gradlew signingReport';
  gradleOutput = execSync(command, {
    cwd: androidPath,
    encoding: 'utf-8',
    stdio: 'pipe',
    env: envForGradle(javaHome),
  });

  const sha1Regex = /SHA1:\s*([A-F0-9:]+)/gi;
  const matches = gradleOutput.match(sha1Regex);

  if (matches && matches.length > 0) {
    console.log('✅ From Gradle (all variants found — use Debug for local dev):\n');
    const unique = [...new Set(matches.map((m) => m.replace(/SHA1:\s*/i, '').trim()))];
    unique.forEach((fp, i) => console.log(`   ${i + 1}. ${fp}`));
    printFirebaseSteps();
    process.exit(0);
  }

  console.log('❌ Could not parse SHA-1 from Gradle output. Snippet:\n');
  console.log(gradleOutput.slice(0, 4000));
} catch (error) {
  const combined =
    String(error.stderr || '') + String(error.stdout || '') + String(error.message || '');
  console.error('❌ Gradle signingReport failed.\n');
  printJavaVersionHelp(combined);

  console.log('📱 Fallback: keytool on project debug keystore, then user default...\n');
  const kt = tryKeytoolFallbackChain();
  if (kt?.sha1) {
    console.log(`✅ SHA-1 (${kt.label}):\n`);
    console.log('   ', kt.sha1);
    if (kt.sha256) {
      console.log('\n✅ SHA-256:\n');
      console.log('   ', kt.sha256);
    }
    printFirebaseSteps();
    process.exit(0);
  }

  console.error('❌ Error:', error.message);
  console.log('\n💡 Manual Gradle (after JDK 17):');
  console.log('   cd android');
  console.log(process.platform === 'win32' ? '   .\\gradlew.bat signingReport' : '   ./gradlew signingReport');
  console.log('\nLook for SHA1: under Variant: debug\n');
  process.exit(1);
}
