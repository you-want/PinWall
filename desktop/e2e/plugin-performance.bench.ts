import { readFileSync } from 'node:fs';
import { platform, arch, cpus } from 'node:os';
import { test, expect } from './fixtures/tauri';
import { OFFICIAL_WIDGETS } from '../src/data/officialWidgets';
import type { PinCardData } from '../src/types';

test('12 stored cards (5 visible) browser baseline: no plugins, 16 disabled, and one idle launcher', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const manifests = OFFICIAL_WIDGETS.filter(item => item.manifest.defaultEnabled === false).map(item => item.manifest);
  expect(manifests).toHaveLength(16);
  const launcher = manifests.find(item => item.id === 'com.pinwall.local-tools')!;
  const html = readFileSync('resources/widgets/widget-local-tools/index.html', 'utf8');
  const cards: PinCardData[] = Array.from({ length: 12 }, (_, i) => ({
    id: `perf-${i}`, title: `Benchmark ${i}`, content: 'Synthetic public fixture',
    x: 20 + (i % 4) * 390, y: 40 + Math.floor(i / 4) * 260,
    collapsed: false, colorIndex: i % 8, createdAt: 1, updatedAt: 1,
    cardType: i === 11 ? 'hydration' : 'note', hydrationCount: 0, hydrationGoal: 8, hydrationDate: new Date().toISOString().slice(0, 10), reminderEnabled: false, reminderTime: null,
    reminderFired: false, checkinDone: false, lastCheckinDate: null,
  }));
  await page.goto('/'); // Warm Vite modules; cold app launch is a separate native measurement.
  await expect(page.locator('.floating-add-btn')).toBeVisible();
  const samples = [];
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const metrics = async () => {
    const result = await session.send('Performance.getMetrics');
    return Object.fromEntries(result.metrics.map(item => [item.name, item.value]));
  };
  for (let round = 0; round < 5; round++) {
    for (const scenario of ['none', 'disabled', 'launcher'] as const) {
      await page.evaluate(({ cards, manifests, launcher, html, scenario }) => {
        const prefix = 'pinwall-e2e:';
        localStorage.setItem(`${prefix}store:cards`, JSON.stringify({ cards, zIndexMap: Object.fromEntries(cards.map((c, i) => [c.id, 100 + i])) }));
        const installed = scenario === 'none' ? [] : manifests;
        localStorage.setItem(`${prefix}widgets:installed`, JSON.stringify(installed));
        localStorage.setItem(`${prefix}widgets:package`, JSON.stringify({ manifest: launcher, html }));
        localStorage.setItem(`${prefix}store:widgets`, JSON.stringify({ widgets: installed.map(manifest => ({
          manifest, enabled: scenario === 'launcher' && manifest.id === launcher.id,
          x: 50, y: 50, size: manifest.defaultSize, zIndex: 50, settings: {}, installedAt: 1, updatedAt: 1,
        })) }));
        localStorage.setItem(`${prefix}ipc:measure`, 'true');
        localStorage.setItem(`${prefix}ipc:counts`, '{}');
      }, { cards, manifests, launcher, html, scenario });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const notes = page.locator('[data-card-id^="perf-"]');
      await expect(notes).toHaveCount(5);
      await expect(page.locator('iframe')).toHaveCount(scenario === 'launcher' ? 1 : 0);
      if (scenario === 'launcher') await expect(page.frameLocator(`iframe[title="${launcher.name}"]`).getByRole('button', { name: 'Open local tools' })).toBeVisible();
      const startupMs = await page.evaluate(() => performance.now());
      // Snapshot command counts only after initialization; check zero ongoing native work.
      await page.evaluate(() => localStorage.setItem('pinwall-e2e:ipc:counts', '{}'));
      const before = await metrics();
      const began = Date.now();
      await page.waitForTimeout(1500);
      const after = await metrics();
      const idleWindowMs = Date.now() - began;
      const calls = await page.evaluate(() => JSON.parse(localStorage.getItem('pinwall-e2e:ipc:counts') ?? '{}') as Record<string, number>);
      expect(Object.keys(calls).filter(name => /^(widget_|read_widget_|write_widget_)/.test(name))).toEqual([]);
      const header = notes.first().locator('.card-title');
      const box = await header.boundingBox();
      expect(box).not.toBeNull();
      await page.evaluate(() => {
        const gaps: number[] = [];
        let last = performance.now();
        const tick = (time: number) => { gaps.push(time - last); last = time; requestAnimationFrame(tick); };
        (window as unknown as { perfGaps: number[] }).perfGaps = gaps;
        requestAnimationFrame(tick);
      });
      const initialPosition = await notes.first().getAttribute('style');
      await page.mouse.move(box!.x + 25, box!.y + 8);
      await page.mouse.down();
      await page.mouse.move(box!.x + 120, box!.y + 100, { steps: 30 });
      await page.mouse.up();
      await expect(notes.first()).not.toHaveAttribute('style', initialPosition!);
      const frameGaps = await page.evaluate(() => (window as unknown as { perfGaps: number[] }).perfGaps.slice(1).sort((a, b) => a - b));
      expect(frameGaps.length).toBeGreaterThan(5);
      samples.push({ round, scenario, startupMs, idleWindowMs,
        rendererTaskMs: (after.TaskDuration - before.TaskDuration) * 1000,
        jsHeapMiB: after.JSHeapUsedSize / 1024 / 1024,
        dragFrameP95Ms: frameGaps[Math.ceil(frameGaps.length * 0.95) - 1],
        dragFrameMaxMs: frameGaps.at(-1), idleNativeCalls: calls,
      });
    }
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = ['none', 'disabled', 'launcher'].map(scenario => {
    const group = samples.filter(sample => sample.scenario === scenario);
    return { scenario, startupMedianMs: median(group.map(s => s.startupMs)),
      idleTaskMedianMs: median(group.map(s => s.rendererTaskMs)),
      heapMedianMiB: median(group.map(s => s.jsHeapMiB)),
      dragP95MedianMs: median(group.map(s => s.dragFrameP95Ms)),
    };
  });
  const report = { environment: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    browser: page.context().browser()?.version(), viewport: '1600x1000', mode: 'Vite dev + synthetic IPC, warm navigation', storedNotes: 12, visibleNotes: 5, stashedNotes: 7 },
    limitations: 'Renderer CDP metrics only. Not macOS process CPU, energy, wakeups, RSS, WKWebView, cold launch or active native-tool performance.',
    samples, summary };
  await testInfo.attach('plugin-browser-baseline.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(JSON.stringify(summary));
});
