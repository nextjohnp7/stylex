/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 */

const fs = require('fs-extra');
const spawn = require('cross-spawn');

/**
 * Detect which package manager to use based on lock files
 * @returns {Promise<'npm'|'yarn'|'pnpm'>}
 */
async function detectPackageManager() {
  // Check lock files in current directory
  if (await fs.pathExists('package-lock.json')) return 'npm';
  if (await fs.pathExists('yarn.lock')) return 'yarn';
  if (await fs.pathExists('pnpm-lock.yaml')) return 'pnpm';

  // Default to npm
  return 'npm';
}

/**
 * Install dependencies in the target directory
 * @param {string} targetDir - Directory where dependencies should be installed
 * @param {'npm'|'yarn'|'pnpm'} packageManager - Package manager to use
 * @returns {Promise<{packageCount: number|null}>} - Installation result with package count
 */
async function installDependencies(targetDir, packageManager) {
  return new Promise((resolve, reject) => {
    const child = spawn(packageManager, ['install'], {
      cwd: targetDir,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(
          `${packageManager} install failed with exit code ${code}`,
        );
        // $FlowFixMe[prop-missing] - Adding custom properties for error context
        error.stderr = stderr;
        // $FlowFixMe[prop-missing]
        error.stdout = stdout;
        reject(error);
        return;
      }

      // Try to extract package count from npm/yarn/pnpm output
      let packageCount = null;

      if (packageManager === 'npm') {
        const npmMatch = stdout.match(/added (\d+) packages?/i);
        if (npmMatch) {
          packageCount = parseInt(npmMatch[1], 10);
        }
      } else if (packageManager === 'yarn') {
        // Yarn classic: "success Saved lockfile." / "X packages have been linked" etc.
        // Modern yarn (berry): "➤ Yarn Report... Processed N packages"
        const yarnMatch =
          stdout.match(/Processed (\d+) package/i) ||
          stdout.match(/(\d+) packages? (?:have been )?(?:linked|installed)/i);
        if (yarnMatch) {
          packageCount = parseInt(yarnMatch[1], 10);
        }
      } else if (packageManager === 'pnpm') {
        // pnpm: "Packages: +123" or "Progress: resolved 123, reused 45, downloaded 67, added 89, done"
        const pnpmAddedMatch = stdout.match(/(?:^|\D)added (\d+)(?:\D|$)/im);
        const pnpmPackagesMatch = stdout.match(/^Packages: \+(\d+)/im);
        const pnpmResolvedMatch = stdout.match(/resolved (\d+)/i);
        if (pnpmPackagesMatch) {
          packageCount = parseInt(pnpmPackagesMatch[1], 10);
        } else if (pnpmAddedMatch) {
          packageCount = parseInt(pnpmAddedMatch[1], 10);
        } else if (pnpmResolvedMatch) {
          packageCount = parseInt(pnpmResolvedMatch[1], 10);
        }
      }

      resolve({ packageCount });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = {
  detectPackageManager,
  installDependencies,
};
