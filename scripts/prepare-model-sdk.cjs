// Run from the repository root with Node 24 and pnpm 10.27.0, locally or in Actions.
// Preparation only: skip all lifecycle scripts; CI installs/rebuilds normally before building.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function pnpm(args, captureOutput = false) {
  // Apply to every command, including patch-commit's internal installation.
  // The CLI setting wins over local config; the child-only env covers subprocesses.
  const commandArgs = ['--config.ignore-scripts=true', ...args]
  process.stdout.write(`[model-sdk] pnpm ${commandArgs.join(' ')}\n`)
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', commandArgs, {
    stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
    shell: process.platform === 'win32'
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`pnpm failed (${result.status})`)
  return result.stdout?.trim()
}

const readPackage = () => JSON.parse(fs.readFileSync('package.json', 'utf8'))
const pkg = readPackage()
if (pkg.version !== '1.9.12') throw new Error('This preparation script targets Cherry Studio v1.9.12')
const expectedPnpm = pkg.packageManager.slice('pnpm@'.length)
const actualPnpm = pnpm(['--version'], true)
if (actualPnpm !== expectedPnpm) {
  throw new Error(`Expected pnpm ${expectedPnpm}, got ${actualPnpm}. Use the pinned pnpm version or the GitHub Actions workflow.`)
}
process.stdout.write(`[model-sdk] pnpm ${actualPnpm}; preparation skips lifecycle scripts (no native builds).\n`)
const revision = 'Cherry model profile patch revision 2'
const sdks = [
  { name: 'google', version: '3.0.138' },
  { name: 'openai', version: '3.0.131' }
].map(({ name, version }) => ({
  name,
  version,
  spec: `@ai-sdk/${name}@${version}`,
  patch: `patches/@ai-sdk__${name}@${version}.patch`,
  directory: `.model-sdk-${name}`
}))
for (const sdk of sdks) {
  if (pkg.devDependencies[`@cherrystudio/model-sdk-${sdk.name}`] !== `npm:${sdk.spec}`) {
    throw new Error(`This patch requires npm:${sdk.spec}`)
  }
  if (fs.existsSync(sdk.patch) && !fs.readFileSync(sdk.patch, 'utf8').includes(revision)) {
    throw new Error(`Outdated ${sdk.patch}: remove only this generated patch and its registration, then prepare again`)
  }
}

function registeredPatch(sdk) {
  // pnpm 10 may write registrations to pnpm-workspace.yaml. Read after installation.
  const { parse } = require('yaml')
  const workspace = parse(fs.readFileSync('pnpm-workspace.yaml', 'utf8'))
  return workspace?.patchedDependencies?.[sdk.spec] ?? readPackage().pnpm?.patchedDependencies?.[sdk.spec]
}

function verifyPatchRegistration(sdk) {
  const patch = registeredPatch(sdk)
  if (!patch || !fs.existsSync(patch) || !fs.readFileSync(patch, 'utf8').includes(revision)) {
    throw new Error(`Missing/current patch required for ${sdk.spec}; review manifests and ${sdk.patch}`)
  }
}

if (sdks.every((sdk) => fs.existsSync(sdk.patch))) {
  pnpm(['install', '--frozen-lockfile'])
  sdks.forEach(verifyPatchRegistration)
  process.stdout.write('[model-sdk] Prepared committed lock and SDK patches; lifecycle scripts were skipped. CI must install/rebuild normally before building.\n')
  process.exit(0)
}
if (!process.argv.includes('--prepare')) {
  throw new Error('SDK lock is not prepared. Run with --prepare, review and commit the generated files.')
}

// Reuse the lockfile while resolving changed manifests. Review the dependency diff.
pnpm(['install', '--no-frozen-lockfile'])
const { Project, SyntaxKind, Node } = require('ts-morph')
function only(items, description) {
  if (items.length !== 1) throw new Error(`${description}: expected one match, got ${items.length}`)
  return items[0]
}

for (const sdk of sdks) {
  if (registeredPatch(sdk)) {
    verifyPatchRegistration(sdk)
    continue
  }
  if (fs.existsSync(sdk.patch)) throw new Error(`Unregistered patch: ${sdk.patch}`)
  if (fs.existsSync(sdk.directory)) throw new Error(`Remove previous patch work directory: ${sdk.directory}`)
  pnpm(['patch', sdk.spec, '--edit-dir', sdk.directory])
  const sdkPackage = JSON.parse(fs.readFileSync(path.join(sdk.directory, 'package.json'), 'utf8'))
  if (sdkPackage.name !== `@ai-sdk/${sdk.name}` || sdkPackage.version !== sdk.version) {
    throw new Error(`Unexpected SDK in ${sdk.directory}`)
  }

  // Both ESM/CommonJS and public/internal entries must agree. Fail on source drift.
  for (const entry of ['dist/index.js', 'dist/index.mjs', 'dist/internal/index.js', 'dist/internal/index.mjs']) {
    const project = new Project({ compilerOptions: { allowJs: true } })
    const source = project.addSourceFileAtPath(path.join(sdk.directory, entry))
    const calls = (name) => source.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === name)

    if (sdk.name === 'google') {
      const messageCapabilities = only(calls('getGoogleModelCapabilities')
        .filter((call) => call.getArguments()[0]?.getText() === 'this.modelId'), `${entry}: message capabilities`)
      messageCapabilities.replaceWithText(
        '({ ...getGoogleModelCapabilities(this.modelId), ...providerOptions?.google?.cherryModelCapabilities })'
      )
      const toolCapabilities = only(calls('getGoogleModelCapabilities')
        .filter((call) => call.getArguments()[0]?.getText() === 'modelId'), `${entry}: tool capabilities`)
      const owner = toolCapabilities.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)
      if (owner?.getName() !== 'prepareTools') throw new Error(`${entry}: unexpected tool capability owner`)
      toolCapabilities.replaceWithText(
        '({ ...getGoogleModelCapabilities(modelId), ...arguments[0].cherryModelCapabilities })'
      )
      const toolCall = only(calls('prepareTools').filter((call) => {
        const arg = call.getArguments()[0]
        return arg && Node.isObjectLiteralExpression(arg) &&
          arg.getProperty('modelId')?.getText().includes('this.modelId')
      }), `${entry}: prepareTools call`)
      const args = toolCall.getArguments()[0]
      if (!Node.isObjectLiteralExpression(args)) throw new Error('Expected tool arguments object')
      args.addPropertyAssignment({
        name: 'cherryModelCapabilities',
        initializer: 'providerOptions?.google?.cherryModelCapabilities'
      })

      // Keep explicit Google resource paths; slash-containing channel aliases are IDs.
      // Only the URL path changes. this.modelId and response identity remain untouched.
      const modelPath = only(source.getFunctions().filter((fn) => fn.getName() === 'getModelPath'), `${entry}: getModelPath`)
      modelPath.setBodyText('return modelId.includes("models/") || /^(?:tunedModels|publishers|projects)\\//.test(modelId) ? modelId : `models/${modelId}`;')
    } else {
      // Honour explicit temperature/topP declarations without changing model identity,
      // reasoning/token mapping, logprobs, service tiers or other SDK capabilities.
      for (const [field, option, expected] of [['temperature', 'temperature', 3], ['top_p', 'topP', 2]]) {
        const conditions = source.getDescendantsOfKind(SyntaxKind.IfStatement)
          .map((statement) => statement.getExpression())
          .filter((condition) => condition.getText() === `baseArgs.${field} != null`)
        if (conditions.length !== expected) {
          throw new Error(`${entry}: ${field} filters expected ${expected}, got ${conditions.length}`)
        }
        for (const condition of conditions) {
          condition.replaceWithText(
            `(${condition.getText()}) && providerOptions?.openai?.cherryModelCapabilities?.sampling?.${option} !== true`
          )
        }
      }
    }
    source.insertText(0, `// ${revision}\n`)
    source.saveSync()
    process.stdout.write(`[model-sdk] Patched ${sdk.spec} ${entry}\n`)
  }
  pnpm(['patch-commit', sdk.directory])
  verifyPatchRegistration(sdk)
  fs.rmSync(sdk.directory, { recursive: true })
}

pnpm(['install', '--no-frozen-lockfile'])
pnpm(['install', '--frozen-lockfile'])
process.stdout.write('[model-sdk] Preparation complete; lifecycle scripts were skipped. CI must install/rebuild normally before building.\n')
process.stdout.write('[model-sdk] Review manifests, pnpm-lock.yaml and both new SDK patches before committing.\n')
