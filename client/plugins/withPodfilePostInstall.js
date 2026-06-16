const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withPodfilePostInstall = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const filePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(filePath, 'utf-8');

      // ──────────────────────────────────────────────────────────
      //  Fix Xcode 16 / Apple Clang 21 consteval crash in {fmt}
      //
      //  The fmt library's base.h has an #if/#elif chain that
      //  re-defines FMT_USE_CONSTEVAL internally, so passing
      //  -DFMT_USE_CONSTEVAL=0 via GCC_PREPROCESSOR_DEFINITIONS
      //  does NOT work — the header overwrites it.
      //
      //  Two-pronged fix:
      //    1. Force C++17 for the 'fmt' pod target so consteval
      //       is not available as a language feature.
      //    2. Patch fmt/base.h source to force FMT_USE_CONSTEVAL=0
      //       so even if C++20 leaks through, the consteval path
      //       is disabled.
      // ──────────────────────────────────────────────────────────

      const fmtFixBlock = `
    # ── Fix {fmt} consteval crash on Xcode 16 ──
    # 1) Force C++17 for the 'fmt' pod so consteval isn't available
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |bc|
          bc.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
        end
      end
    end

    # 2) Patch fmt/base.h to force FMT_USE_CONSTEVAL 0
    fmt_base_path = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_path)
      fmt_content = File.read(fmt_base_path)
      unless fmt_content.include?('EXPO_FMT_CONSTEVAL_WORKAROUND')
        # Replace the consteval detection to always set it to 0
        patched = fmt_content.gsub(
          /^(#elif\\s+defined\\(__cpp_consteval\\)\\n#\\s*define\\s+FMT_USE_CONSTEVAL)\\s+1/,
          "// EXPO_FMT_CONSTEVAL_WORKAROUND: Xcode 16 fix\\n\\\\1 0"
        )
        # If the above regex didn't match, try a broader approach
        if patched == fmt_content
          patched = fmt_content.gsub(
            /^(#\\s*define\\s+FMT_USE_CONSTEVAL)\\s+1\\s*$/,
            "\\\\1 0 // EXPO_FMT_CONSTEVAL_WORKAROUND"
          )
        end
        if patched != fmt_content
          File.chmod(0644, fmt_base_path) rescue nil
          File.write(fmt_base_path, patched)
          puts '[withPodfilePostInstall] Successfully patched fmt/base.h to disable consteval'
        else
          puts '[withPodfilePostInstall] WARNING: Could not find consteval pattern in fmt/base.h'
        end
      else
        puts '[withPodfilePostInstall] fmt/base.h already patched'
      end
    else
      puts '[withPodfilePostInstall] WARNING: fmt/base.h not found at expected path'
    end
`;

      if (!contents.includes("EXPO_FMT_CONSTEVAL_WORKAROUND")) {
        // Remove any old patch we applied
        contents = contents.replace(
          /\n\s*# Fix Xcode 16.*?end\n\s*end\n\s*end\n/s,
          '\n'
        );

        const anchor = /post_install do\s*\|\s*(\w+)\s*\|/;
        const match = contents.match(anchor);

        if (match) {
          // Case 1: post_install block exists — inject right after 'post_install do |installer|'
          console.log('[withPodfilePostInstall] Found existing post_install block. Injecting fmt fix...');
          const index = match.index + match[0].length;
          contents = contents.substring(0, index) + "\n" + fmtFixBlock + contents.substring(index);
        } else {
          // Case 2: No post_install block — append one
          console.log('[withPodfilePostInstall] No post_install block found. Appending new block...');
          contents += `

post_install do |installer|
  react_native_post_install(installer, config[:reactNativePath]) if defined?(react_native_post_install)
${fmtFixBlock}
end
`;
        }
        fs.writeFileSync(filePath, contents);
        console.log('[withPodfilePostInstall] Podfile successfully patched with fmt consteval fix.');
      } else {
        console.log('[withPodfilePostInstall] fmt consteval fix already applied.');
      }

      return config;
    },
  ]);
};

module.exports = withPodfilePostInstall;
