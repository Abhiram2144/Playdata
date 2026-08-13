import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(__dirname, '../../.a11y-results');
mkdirSync(outDir, { recursive: true });

const fixturesPath = path.resolve(__dirname, '../../.a11y-fixtures.json');
if (!existsSync(fixturesPath)) {
  throw new Error(
    'Missing .a11y-fixtures.json — run `node --env-file=.env scripts/seed-a11y-fixtures.mjs` first.'
  );
}
const fx = JSON.parse(readFileSync(fixturesPath, 'utf-8')).rows as {
  datasetId: string; visualisationId: string; quizId: string; classroomId: string; sessionId: string;
};

/** WCAG 2.1 A/AA is the bar item 3 (contrast) and item 1 (labels/alt/ARIA) are checked against. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

function report(name: string, results: Awaited<ReturnType<typeof scan>>) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })),
  }));
  writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(summary, null, 2));
}

test.describe('Dataset management', () => {
  test('datasets list', async ({ page }) => {
    await page.goto('/teacher/datasets');
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('datasets list', results);
    expect(results.violations).toEqual([]);
  });

  test('dataset detail', async ({ page }) => {
    await page.goto(`/teacher/datasets/${fx.datasetId}`);
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('dataset detail', results);
    expect(results.violations).toEqual([]);
  });
});

test.describe('Visualisation builder', () => {
  test('visualisations list', async ({ page }) => {
    await page.goto('/teacher/visualisations');
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('visualisations list', results);
    expect(results.violations).toEqual([]);
  });

  test('builder (new)', async ({ page }) => {
    await page.goto(`/teacher/visualisations/new?dataset=${fx.datasetId}`);
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('visualisation builder', results);
    expect(results.violations).toEqual([]);
  });

  test('saved visualisation view', async ({ page }) => {
    await page.goto(`/teacher/visualisations/${fx.visualisationId}`);
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('visualisation view', results);
    expect(results.violations).toEqual([]);
  });
});

test.describe('Quiz / question builder', () => {
  test('quizzes list', async ({ page }) => {
    await page.goto('/teacher/quizzes');
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('quizzes list', results);
    expect(results.violations).toEqual([]);
  });

  test('quiz editor (existing questions)', async ({ page }) => {
    await page.goto(`/teacher/quizzes/${fx.quizId}`);
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('quiz editor', results);
    expect(results.violations).toEqual([]);
  });

  test('new quiz', async ({ page }) => {
    await page.goto('/teacher/quizzes/new');
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('new quiz', results);
    expect(results.violations).toEqual([]);
  });

  test('question bank', async ({ page }) => {
    await page.goto('/teacher/question-bank');
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('question bank', results);
    expect(results.violations).toEqual([]);
  });
});

test.describe('Classroom management', () => {
  test('classrooms list', async ({ page }) => {
    await page.goto('/teacher/classrooms');
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('classrooms list', results);
    expect(results.violations).toEqual([]);
  });

  test('classroom roster', async ({ page }) => {
    await page.goto(`/teacher/classrooms/${fx.classroomId}`);
    await page.waitForLoadState('networkidle');
    const results = await scan(page);
    report('classroom roster', results);
    expect(results.violations).toEqual([]);
  });
});

test.describe('Live session host view + leaderboard', () => {
  test('live session (host controls + leaderboard podium)', async ({ page }) => {
    await page.goto(`/teacher/sessions/${fx.sessionId}/live`);
    // Live page polls every 3s and auto-transitions waiting -> active; give it a moment to settle.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const results = await scan(page);
    report('live session host view', results);
    expect(results.violations).toEqual([]);
  });
});

test.describe('AI assistant panel', () => {
  test.skip(
    true,
    'No AI assistant panel exists in the codebase yet (OPENAI_API_KEY is provisioned but unwired — ' +
    'see TECHNICAL_SPEC.md §4.9, all AI endpoints are "Planned"). Nothing to scan; re-enable once built.'
  );
});
