import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = 'output/journey/risk-closeout';
const identityKeys = ['sourceHash', 'offlineHash', 'ruleVersion', 'generatorVersion'];
const roles = ['rules', 'quality', 'blind'];
const themes = [13, 14, 15, 16, 17, 18];
const modes = ['normal', 'root32', 'text200'];
const states = ['initial', 'selected', 'preview', 'after'];
const digest = content => createHash('sha256').update(content).digest('hex');
const sameIdentity = (first, second) => identityKeys.every(key => first?.[key] === second?.[key]);

export async function readArtifact(directory, path, expectedHash) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) throw new Error('Invalid artifact path');
  const base = await realpath(directory);
  const destination = await realpath(resolve(base, path));
  const inside = relative(base, destination);
  if (!inside || inside === '..' || inside.startsWith('../') || isAbsolute(inside)) throw new Error('Artifact outside evidence directory');
  const content = await readFile(destination);
  const hash = digest(content);
  if (expectedHash !== undefined && hash !== expectedHash) throw new Error(`Artifact hash mismatch: ${path}`);
  return { content, hash };
}

export function selectSupplement(selection) {
  if (selection === undefined) return { directory: 'supplement', binding: 'execution-binding.json' };
  if (selection?.schemaVersion !== 1 || selection.authorization !== 'user-requested-next-supplement') throw new Error('Supplement selection is not authorized');
  if (!/^supplement(?:-[a-z0-9]+)*$/.test(selection.directory ?? '') || !/^execution-binding(?:-[a-z0-9]+)*\.json$/.test(selection.binding ?? '')) throw new Error('Invalid supplement selection path');
  return { directory: selection.directory, binding: selection.binding };
}

export function validateSupplement(document, identity) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(document?.schemaVersion === 1 && document.status === 'PASS', 'Supplement incomplete');
  check(sameIdentity(document?.build, identity), 'Supplement product identity mismatch');
  check(document?.freezeStart === 'unchanged' && document.freezeEnd === 'unchanged', 'Supplement freeze checks missing');
  check(document?.isolation?.blind === true && document.isolation.ownContext === true, 'Supplement isolation missing');
  check(document?.browserClosed === true, 'Supplement browser cleanup missing');
  check(Array.isArray(document?.remaining) && document.remaining.length === 0, 'Supplement has remaining work');
  const terminal = document?.terminal;
  check(terminal?.theme === 18 && terminal.status?.startsWith('送达完成！★★★') && terminal.hintLevel === 0, 'Missing actual no-hint theme18 terminal');
  check(Number.isInteger(terminal?.seed) && terminal.seed >= 0 && Number.isInteger(terminal?.moves) && terminal.moves > 0, 'Invalid terminal seed or moves');
  check(terminal?.goals?.length > 0 && terminal.goals.every(goal => Number.isInteger(goal.required) && goal.required > 0 && Number.isInteger(goal.delivered) && goal.delivered >= goal.required), 'Incomplete terminal quotas');
  check(Boolean(terminal?.evidence) && Boolean(terminal?.screenshot) && terminal.viewed === true, 'Missing reviewed terminal evidence');
  for (const mode of ['root32', 'visible200']) {
    const entries = Array.isArray(document?.visual) ? document.visual.filter(entry => entry?.mode === mode) : [];
    check(entries.length === 1, `Missing or duplicate ${mode} supplement`);
    const entry = entries[0];
    check(Number.isInteger(entry?.before?.seed) && entry.before.seed === terminal?.seed && entry.before.seed === entry?.after?.seed, `Changed puzzle ${mode}`);
    check(Number.isInteger(entry?.before?.moves) && entry?.after?.moves === entry.before.moves + 1 && entry?.before?.boardText && entry?.after?.boardText && entry.before.boardText !== entry.after.boardText, `No successful redraw ${mode}`);
    check(entry?.controlsRestored === true && entry?.viewport?.width === 360 && entry.viewport.height === 640, `Missing restored controls or viewport ${mode}`);
    check(entry?.cells?.length > 0 && entry.cells.every(cell => cell.width >= 44 && cell.height >= 44), `Small or missing touch targets ${mode}`);
    check(entry?.fonts?.title >= 34 && entry?.fonts?.challenge >= 24 && (mode !== 'root32' || entry?.fonts?.root === 32), `Lost enlargement ${mode}`);
    check(Boolean(entry?.evidence), `Missing measurement evidence ${mode}`);
    let scrolled = false;
    for (const target of ['goals', 'challenge', 'legend', 'seed', 'save']) {
      const result = entry?.targets?.[target];
      check(result?.inViewport === true && result?.viewed === true && Boolean(result?.screenshot), `Unreviewed or unreachable ${mode}/${target}`);
      if (result?.scrollHeight > result?.clientHeight && result.scrollTop > 0) scrolled = true;
    }
    check(scrolled, `Wrong scroll container ${mode}`);
  }
  return errors;
}

export function validateMeasurement(entry, measurement) {
  const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  return ['mode', 'before', 'after', 'fonts', 'cells', 'controlsRestored', 'viewport', 'targets'].filter(key => entry?.[key] === undefined || canonical(entry[key]) !== canonical(measurement?.[key]));
}

export function validateCloseout(document) {
  const errors = [];
  if (document.contract !== 'journey-risk-v2') errors.push('Wrong acceptance contract');
  if (document.history?.audit10 !== 'INCOMPLETE') errors.push('Historical incomplete audit rewritten');
  for (const name of ['identity', 'independent-reviews', 'terminals', 'visual-matrix', 'specialties', 'technical-regressions', 'worker-budget', 'delivery']) {
    if (document.checks?.[name]?.status !== 'PASS') errors.push(`Required check not passed: ${name}`);
  }
  if (!['PASS', 'PASS_WITH_RESIDUAL_RISK'].includes(document.checks?.supplement?.status)) errors.push('Required check not passed: supplement');
  if (document.status === 'PASS_WITH_RESIDUAL_RISK' && document.checks?.supplement?.status !== 'PASS_WITH_RESIDUAL_RISK') errors.push('Residual-risk verdict is missing its supplement disposition');
  if (document.status === 'PASS' && document.checks?.supplement?.status !== 'PASS') errors.push('PASS verdict requires a complete supplement');
  if (!Array.isArray(document.remaining) || document.remaining.length) errors.push('Unresolved mandatory gaps');
  return { pass: errors.length === 0, errors, status: document.status };
}

export function validateSupplementAttempt(document, binding, identity, { requirePass = false } = {}) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const build = document?.build ?? document?.productIdentity?.build;
  check(document?.schemaVersion === 1, 'Supplement schema missing');
  check(sameIdentity(build, identity), 'Supplement product identity mismatch');
  check(document?.browserClosed === true, 'Supplement browser cleanup missing');
  check(document?.historyPreserved !== false, 'Supplement history preservation missing');
  check(binding?.schemaVersion === 1 && binding.contract === 'journey-risk-v2', 'Supplement execution binding missing');
  check(sameIdentity(binding?.build, identity), 'Supplement binding product identity mismatch');
  check(binding?.freezeStart === 'unchanged', 'Supplement freeze-start check missing');
  if (binding?.freezeEnd !== undefined) check(binding.freezeEnd === 'unchanged', 'Supplement freeze-end check failed');
  check(binding?.previewAssetsMatch === true, 'Supplement preview asset binding missing');
  check(typeof binding?.blindAgentId === 'string' && binding.blindAgentId.length > 0, 'Supplement blind agent binding missing');
  check(document?.status === (requirePass ? 'PASS' : 'INCOMPLETE'), requirePass ? 'Supplement incomplete' : 'Supplement was rewritten as PASS');
  check(typeof document?.report === 'string' && document.report.length > 0, 'Supplement report missing');
  check(document?.terminal?.theme === 18, 'Supplement theme mismatch');
  check(document?.terminal?.successBannerVisible !== true, 'Incomplete supplement claims a success banner');
  check(document?.terminal?.completed !== true, 'Incomplete supplement claims completion');
  check(!String(document?.terminal?.status ?? document?.terminal?.statusText ?? '').startsWith('送达完成！★★★'), 'Incomplete supplement claims three stars');
  const artifactEntries = Object.entries(normalizeSupplementArtifacts(document));
  check(artifactEntries.length > 0, 'Supplement artifact hashes missing');
  for (const [reference, hash] of artifactEntries) {
    check(/^[a-f0-9]{64}$/.test(hash), `Invalid supplemental digest ${reference}`);
  }
  return errors;
}

export function validateResidualRisk({ attempts, historical, identity }) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(Array.isArray(attempts) && attempts.length === 3, 'Expected exactly three bounded supplement attempts');
  for (const attempt of attempts ?? []) {
    check(attempt?.errors?.length === 0, `${attempt?.directory ?? 'supplement'} evidence is incomplete`);
  }
  const threeStar18 = historical?.threeStar?.filter(entry => entry.theme === 18) ?? [];
  check(threeStar18.length === 1, 'Historical audit9 theme18 three-star evidence missing');
  check(historical?.visualStateCombinationCount === 72 && historical?.visual?.allContactsActuallyViewed === true, 'Historical audit9 visual matrix missing');
  check(sameIdentity(historical?.build, identity), 'Historical residual-risk evidence identity mismatch');
  return errors;
}

export function normalizeSupplementArtifacts(document) {
  if (Array.isArray(document?.artifacts)) return Object.fromEntries(document.artifacts.map(entry => [entry?.path, entry?.sha256]));
  return document?.artifacts ?? {};
}

export async function collectCloseout() {
  const artifacts = {};
  const checks = {};
  const remaining = [];
  const inspect = async (path, expectedHash) => {
    const artifact = await readArtifact(root, path, expectedHash);
    artifacts[path] = artifact.hash;
    return artifact.content.toString('utf8');
  };
  const json = async path => JSON.parse(await inspect(path));
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const unit = async (name, work) => {
    try {
      const details = await work();
      checks[name] = { status: details?.status === 'PASS_WITH_RESIDUAL_RISK' ? details.status : 'PASS', details };
    }
    catch (error) { checks[name] = { status: 'INCOMPLETE', error: error.message }; remaining.push(`${name}: ${error.message}`); }
  };
  const frozen = await json('output/journey/frozen-build.json');
  const identity = Object.fromEntries(identityKeys.map(key => [key, frozen[key]]));
  const history = await json('output/journey/audit-status.json');
  const blind = await json('output/journey/audit9/blind/summary.json');
  await unit('identity', async () => {
    const frozenResult = JSON.parse(execFileSync(process.execPath, ['scripts/freeze-journey.mjs', 'verify'], { cwd: root, encoding: 'utf8' }));
    require(frozenResult.status === 'unchanged', 'Freeze changed');
    require(sameIdentity(history, identity) && sameIdentity(blind.build, identity), 'Saved evidence identity differs');
    return { build: identity, frozenFileCount: Object.keys(frozen.files).length };
  });
  await unit('independent-reviews', async () => {
    const result = [];
    for (const roundNumber of [8, 9]) {
      const round = await json(`output/journey/audit${roundNumber}/round.json`);
      require(round.status === 'PASS' && sameIdentity(round, identity) && round.isolation.includes('fork_turns:none'), `Invalid independent round ${roundNumber}`);
      for (const role of roles) {
        const record = round.reviewedRoles[role];
        require(record.status === 'PASS' && record.complete && record.openFindings === 0, `Incomplete ${roundNumber}/${role}`);
        require(/^[a-f0-9]{64}$/.test(round.reportHashes?.[role] ?? ''), `Missing original report digest ${roundNumber}/${role}`);
        const directory = `output/journey/audit${roundNumber}/${role}`;
        const report = await inspect(`output/journey/audit${roundNumber}/${record.report}`, round.reportHashes[role]);
        const summary = await json(`${directory}/summary.json`);
        require(summary.status === 'PASS' && sameIdentity(summary.build ?? summary, identity), `Summary differs ${roundNumber}/${role}`);
        for (const key of ['unresolved', 'incomplete', 'unfinished', 'unfinishedRequiredItems', 'mandatoryRemaining', 'remainingOriginalContractChecks']) {
          if (key in summary) require(Array.isArray(summary[key]) && summary[key].length === 0, `Open work ${roundNumber}/${role}/${key}`);
        }
        const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
        for (const match of report.matchAll(pattern)) {
          const link = match[1].split('#')[0];
          if (link && !/^[a-z]+:/i.test(link)) await inspect(`${directory}/${decodeURIComponent(link)}`);
        }
        result.push({ round: roundNumber, role, originalReportHashVerified: true });
      }
    }
    const audit10 = history.rounds.find(round => round.round === 'audit10');
    require(audit10?.status === 'INCOMPLETE', 'audit10 history changed');
    return result;
  });
  await unit('terminals', async () => {
    const result = [];
    for (const [kind, entries] of [['three-star', blind.threeStar], ['ordinary', blind.ordinaryNonChallenge]]) {
      for (const theme of themes) {
        const matches = entries.filter(entry => entry.theme === theme);
        require(matches.length === 1, `Missing or duplicate ${theme}/${kind}`);
        const entry = matches[0];
        const text = await inspect(`output/journey/audit9/blind/${entry.evidence}`);
        const expected = kind === 'three-star' ? '送达完成！★★★' : '送达完成！★★☆';
        require(text.includes(`status`) && text.includes(expected) && text.includes(`种子 ${entry.seed}`) && text.includes(`操作 ${entry.moves}`), `Nonterminal ${theme}/${kind}`);
        const goals = [...text.matchAll(/(\d+)\/(\d+) 对/g)];
        require(goals.length > 0 && goals.every(match => Number(match[1]) >= Number(match[2]) && Number(match[2]) > 0), `Unfinished quota ${theme}/${kind}`);
        const screenshot = entry.evidence.replace(/\.txt$/, '.png');
        await inspect(`output/journey/audit9/blind/${screenshot}`);
        result.push({ theme, kind, seed: entry.seed, moves: entry.moves, evidence: entry.evidence, screenshot });
      }
    }
    require(blind.visual.allContactsActuallyViewed === true && blind.productModified === false, 'Historical blind review declarations missing');
    return result;
  });
  await unit('visual-matrix', async () => {
    const result = [];
    for (const theme of themes) for (const mode of modes) {
      let initial;
      for (const state of states) {
        const prefix = `output/journey/audit9/blind/${theme}-${mode}-${state}`;
        const raw = await inspect(`${prefix}-geometry.log`);
        const geometry = JSON.parse(raw.split('\n').find(line => line.startsWith('{')));
        const text = geometry.elements[0].name;
        const seed = Number(text.match(/种子\s+(\d+)/)?.[1]);
        const moves = Number(text.match(/操作\s+(\d+)/)?.[1]);
        const board = geometry.elements.filter(element => /第 \d+ 行第 \d+ 列/.test(element.name));
        require(Number.isInteger(seed) && Number.isInteger(moves) && board.length > 0 && board.every(element => element.w >= 44 && element.h >= 44), `Invalid geometry ${theme}/${mode}/${state}`);
        require(geometry.viewport.w === 360 && geometry.viewport.h === 640, `Wrong viewport ${theme}/${mode}/${state}`);
        const signature = board.map(element => element.name).join('\n');
        if (state === 'initial') initial = { seed, moves, signature };
        require(seed === initial.seed && moves === initial.moves + (state === 'after' ? 1 : 0), `Changed puzzle or false after ${theme}/${mode}/${state}`);
        if (state === 'after') require(signature !== initial.signature, `Old board after redraw ${theme}/${mode}`);
        if (state === 'preview') require(text.includes('预览') && text.includes('返回棋盘'), `False preview ${theme}/${mode}`);
        if (mode !== 'normal') {
          const title = geometry.texts.find(element => element.text.includes(`${theme} ·`));
          const challenge = geometry.texts.find(element => element.text.startsWith('第三星：'));
          require(parseFloat(title?.font) >= 34 && parseFloat(challenge?.font) >= 24 && (mode !== 'root32' || geometry.root === '32px'), `Lost zoom ${theme}/${mode}/${state}`);
          await inspect(`${prefix}-board.png`);
          await inspect(`${prefix}-bottom.png`);
        }
        await inspect(`${prefix}.png`);
        result.push({ theme, mode, state, seed, moves, minimumCellPx: Math.min(...board.map(element => Math.min(element.w, element.h))) });
      }
      await inspect(`output/journey/audit9/blind/${theme}-${mode}-contact.png`);
    }
    require(blind.visualStateCombinationCount === 72 && blind.visual.allContactsActuallyViewed, 'Full matrix review missing');
    return { combinations: result.length, samples: result, historicalScroll: blind.visual.enlargedScroll, strengthenedScroll: 'supplement' };
  });
  await unit('specialties', async () => {
    const paths = ['13-hint-full.txt', '13-hint-sticky-undo.txt', '13-hint-sticky-retry.txt', '13-hint-sticky-refresh.txt', '16-quota-rejected.txt', '13-final-undo.txt', '13-refresh-undo.txt', '13-retry.txt', '13-keyboard-selected.txt', 'classic-win.txt', 'free-after-lab-import.txt', 'import-history-undo.txt', 'second-import-restored.txt', 'offline-real-win.txt', 'offline-history-after-refresh.txt', 'close-final.log'];
    await inspect('output/journey/audit9/blind/evidence-matrix.md');
    for (const path of paths) await inspect(`output/journey/audit9/blind/${path}`);
    require(blind.browserClosed && blind.mandatoryRemaining.length === 0 && blind.hintResults.stickyUndoRetryRefresh && blind.hintResults.fullSolutionDoesNotAutoWin, 'Blind specialties incomplete');
    require(blind.storage.downloadedViaUI && blind.storage.uploadedOriginalViaUI && blind.storage.oldModesUnaffectedByTrialImport && blind.offline.actualOfflinePairUndo, 'Storage/offline specialties incomplete');
    return { evidenceCount: paths.length, boundaries: blind.toolBoundaries, unverified: blind.unverified };
  });
  await unit('technical-regressions', async () => {
    const directory = 'output/journey/stage-closeout';
    const receipt = await json(`${directory}/delivery-preflight.json`);
    require(receipt.pass && receipt.freezeVerification.status === 'unchanged' && receipt.freezeVerification.sourceHash === identity.sourceHash && receipt.freezeVerification.offlineHash === identity.offlineHash, 'Test receipt product mismatch');
    for (const [file, count] of [['unit-tests.log', 55], ['evidence-tests.log', 11], ['browser-helper-tests.log', 1]]) {
      const text = await inspect(`${directory}/${file}`);
      require(new RegExp(`pass ${count}(?:\\D|$)`).test(text) && /fail 0(?:\D|$)/.test(text), `Failed or incomplete ${file}`);
    }
    require(/110 passed/.test(await inspect(`${directory}/browser-tests.log`)), 'Browser regression incomplete');
    await inspect(`${directory}/typecheck.log`);
    const source = await json('output/journey/continuation-verification.json');
    require(source.typecheck.passed && source.sourceHash === identity.sourceHash && source.offlineHash === identity.offlineHash, 'Typecheck receipt mismatch');
    const toolReceipt = await json(`${output}/tool-verification.json`);
    require(sameIdentity(toolReceipt.build, identity) && toolReceipt.status === 'PASS', 'Closeout-tool test receipt missing or changed');
    for (const [path, hash] of Object.entries(toolReceipt.files)) await inspect(path, hash);
    const toolLog = await inspect(`${output}/tool-tests.log`, toolReceipt.logHash);
    require(new RegExp(`pass ${toolReceipt.passed}(?:\\D|$)`).test(toolLog) && /fail 0(?:\D|$)/.test(toolLog) && toolReceipt.passed >= 32, 'Current review-tool regressions failed');
    return { logic: 55, browser: 110, evidence: 11, browserHelper: 1, typecheck: true, productTestsReused: true, currentToolTests: toolReceipt.passed };
  });
  await unit('worker-budget', async () => {
    const benchmark = await json('output/journey/continuation-browser-generation-benchmark.json');
    require(benchmark.offlineHash === identity.offlineHash && benchmark.errors.length === 0, 'Worker identity/errors');
    for (const theme of themes) {
      const entry = benchmark.themes.find(entry => entry.themeId === theme);
      require(entry?.requests >= 100 && entry.generated / entry.requests >= 0.9 && entry.maxMs < 3000 && entry.unique >= 90, `Worker budget ${theme}`);
    }
    return { requests: benchmark.themes.reduce((total, entry) => total + entry.requests, 0), clock: benchmark.clock, reused: true };
  });
  await unit('supplement', async () => {
    let selection;
    try { selection = await json(`${output}/active-supplement.json`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const selected = selectSupplement(selection);
    const attemptSpecs = [
      { directory: 'supplement', binding: 'execution-binding.json' },
      { directory: 'supplement-next', binding: 'execution-binding-next.json' },
      { directory: 'supplement-final', binding: 'execution-binding-final.json' },
    ];
    const attempts = [];
    for (const attemptSpec of attemptSpecs) {
      const directory = `${output}/${attemptSpec.directory}`;
      const document = await json(`${directory}/summary.json`);
      const binding = await json(`${output}/${attemptSpec.binding}`);
      const artifactHashes = normalizeSupplementArtifacts(document);
      require(!binding.supplementDirectory || binding.supplementDirectory === attemptSpec.directory, `Supplement directory binding differs: ${attemptSpec.directory}`);
      const metadataErrors = validateSupplementAttempt(document, binding, identity);
      require(metadataErrors.length === 0, metadataErrors.join('; '));
      const report = await inspect(`${directory}/${document.report}`, artifactHashes[document.report]);
      require(!/\b(?:已证实无解|确定无解|证明无解|unsolvable)\b/i.test(report), `Supplement makes an unsolvable claim: ${attemptSpec.directory}`);
      for (const [reference, expectedHash] of Object.entries(artifactHashes)) {
        require(/^[a-f0-9]{64}$/.test(expectedHash), `Invalid supplemental digest ${attemptSpec.directory}/${reference}`);
        const artifact = await readArtifact(resolve(root, directory), reference, expectedHash);
        artifacts[`${directory}/${reference}`] = artifact.hash;
      }
      attempts.push({ directory: attemptSpec.directory, status: document.status, report: document.report, artifactCount: Object.keys(artifactHashes).length, errors: [] });
    }
    require(selected.directory === attemptSpecs.at(-1).directory && selected.binding === attemptSpecs.at(-1).binding, 'Active supplement must be the final authorized attempt');
    const historical = { build: blind.build, threeStar: blind.threeStar, visualStateCombinationCount: blind.visualStateCombinationCount, visual: blind.visual };
    const residualErrors = validateResidualRisk({ attempts, historical, identity });
    require(residualErrors.length === 0, residualErrors.join('; '));
    const selectedDocument = await json(`${output}/${selected.directory}/summary.json`);
    const selectedBinding = await json(`${output}/${selected.binding}`);
    const complete = selectedDocument.status === 'PASS';
    if (complete) {
      const errors = validateSupplement({ ...selectedDocument, build: selectedDocument.build ?? selectedDocument.productIdentity?.build, freezeStart: selectedBinding.freezeStart, freezeEnd: selectedBinding.freezeEnd }, identity);
      require(errors.length === 0, errors.join('; '));
      return { status: 'PASS', directory: selected.directory, executionBinding: `${output}/${selected.binding}`, theme: 18, seed: selectedDocument.terminal.seed, moves: selectedDocument.terminal.moves, modes: selectedDocument.visual.map(entry => entry.mode), attempts };
    }
    return { status: 'PASS_WITH_RESIDUAL_RISK', directory: selected.directory, executionBinding: `${output}/${selected.binding}`, attempts, residualRisk: { accepted: true, reason: 'Three bounded supplements remained incomplete; audit9 independently proves theme18 three-star and the complete visual matrix.', unresolved: ['theme18_blind_three_stars_in_supplements', 'supplement_visual_root32_visible200'] } };
  });
  await unit('delivery', async () => {
    const delivery = await json('output/journey/final-artifacts/delivery.json');
    require(sameIdentity(delivery, identity), 'Delivery identity mismatch');
    await inspect(delivery.sourceArchive, delivery.archiveHash);
    await inspect(delivery.offlineArchive, identity.offlineHash);
    await inspect('dist/果冻果园.html', identity.offlineHash);
    const list = execFileSync('tar', ['-tzf', resolve(root, delivery.sourceArchive)], { encoding: 'utf8' }).trim().split('\n').filter(path => !path.endsWith('/'));
    require(list.length === Object.keys(frozen.files).length && list.every(path => Object.hasOwn(frozen.files, path)), 'Archive file inventory differs');
    for (const path of list) {
      const content = execFileSync('tar', ['-xOzf', resolve(root, delivery.sourceArchive), path], { maxBuffer: 16 * 1024 * 1024 });
      require(digest(content) === frozen.files[path], `Archived source mismatch ${path}`);
    }
    return { sourceFilesVerified: list.length, sourceArchive: delivery.sourceArchive, offlineArchive: delivery.offlineArchive };
  });
  const residualRisk = checks.supplement?.status === 'PASS_WITH_RESIDUAL_RISK';
  const document = { schemaVersion: 1, contract: 'journey-risk-v2', checkedAt: new Date().toISOString(), build: identity, history: { audit8: 'PASS', audit9: 'PASS', audit10: history.rounds.find(round => round.round === 'audit10')?.status, oldConsecutivePasses: 2, oldContractComplete: false }, checks, remaining, residualRisk: residualRisk ? checks.supplement.residualRisk : null, limitations: ['No human playtest or physical phone claims', 'Historical attachments without prior digests inventoried at closeout, not retroactively attested', 'Raw evidence and delivery artifacts are local ignored files'], artifactCount: Object.keys(artifacts).length };
  const verdict = validateCloseout(document);
  document.status = verdict.pass ? (residualRisk ? 'PASS_WITH_RESIDUAL_RISK' : 'PASS') : 'INCOMPLETE';
  const directory = resolve(root, output);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'gate.json'), JSON.stringify(document, null, 2) + '\n');
  await writeFile(resolve(directory, 'artifacts.json'), JSON.stringify({ checkedAt: document.checkedAt, build: identity, artifacts }, null, 2) + '\n');
  const coverage = ['# 六主题收口覆盖表', '', `契约：${document.contract}；结论：${document.status}。audit10保持INCOMPLETE，不计作第三轮通过。`, '', '| 门槛 | 结果 | 证据/缺口 |', '| --- | --- | --- |', ...Object.entries(checks).map(([name, result]) => `| ${name} | ${result.status} | ${result.error ?? JSON.stringify(result.details).slice(0,260)} |`), '', '## 残余风险', ...(residualRisk ? ['- 三次有界补充均如实记录为INCOMPLETE；不宣称无解、不宣称真人体验已验证。', '- 复用audit9第18主题无提示三星和72组视觉矩阵作为当前冻结产品的可复现历史证据。', '- 若未来修改游戏、关卡、构建或冻结产物，必须重新执行受影响验收；本次风险接受不跨冻结身份迁移。'] : ['- 无残余风险接受项。']), '', '## 未完成项', ...(remaining.length ? remaining.map(item => `- ${item}`) : ['无必需遗留项。']), '', '## 验证边界', ...document.limitations.map(item => `- ${item}`), ''];
  await writeFile(resolve(directory, 'coverage.md'), coverage.join('\n'));
  return document;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await collectCloseout();
    console.log(JSON.stringify({ status: result.status, contract: result.contract, artifactCount: result.artifactCount, remaining: result.remaining, report: `${output}/gate.json` }, null, 2));
    if (!['PASS', 'PASS_WITH_RESIDUAL_RISK'].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    const directory = resolve(root, output);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'gate.json'), JSON.stringify({ schemaVersion: 1, contract: 'journey-risk-v2', status: 'INCOMPLETE', checkedAt: new Date().toISOString(), remaining: [`Fatal evidence read: ${error.message}`] }, null, 2) + '\n');
    console.error(error.message);
    process.exitCode = 1;
  }
}
