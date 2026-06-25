#!/usr/bin/env node
/**
 * PinWall Manual Test Tracker
 *
 * Generates an interactive HTML page from TEST_CASES.md
 * Allows testers to check off items and save results.
 *
 * Usage: node scripts/manual-test-tracker.js
 */

const fs = require('fs');
const path = require('path');

const CASES_FILE = path.join(__dirname, '..', 'TEST_CASES.md');
const OUTPUT_FILE = path.join(__dirname, '..', 'test-results', 'manual-test-report.html');
const PACKAGE_FILE = path.join(__dirname, '..', 'package.json');

// Read test cases
const md = fs.readFileSync(CASES_FILE, 'utf-8');
const version = JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf-8')).version;

// Parse sections and items
const sections = [];
let currentSection = null;

md.split('\n').forEach(line => {
  const sectionMatch = line.match(/^## (\d+\.\d*\s+.+)/);
  const itemMatch = line.match(/^\| (\d+\.\d+) \| (.+?) \| (.+?) \| (.+?) \| [☑☐] \|/);
  const itemMatchUnchecked = line.match(/^\| (\d+\.\d+) \| (.+?) \| (.+?) \| (.+?) \| ☐ \|/);

  if (sectionMatch) {
    currentSection = { name: sectionMatch[1], items: [] };
    sections.push(currentSection);
  } else if (itemMatch || itemMatchUnchecked) {
    const match = itemMatch || itemMatchUnchecked;
    currentSection.items.push({
      id: match[1],
      name: match[2],
      steps: match[3],
      expected: match[4],
      passed: !!itemMatch,
    });
  }
});

// Generate HTML
const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PinWall 手动测试报告</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 8px; color: #333; }
    .meta { text-align: center; color: #666; margin-bottom: 20px; font-size: 14px; }
    .toolbar { display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap; }
    .toolbar button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn-save { background: #4CAF50; color: white; }
    .btn-export { background: #2196F3; color: white; }
    .btn-reset { background: #f44336; color: white; }
    .progress-bar { background: #e0e0e0; border-radius: 8px; height: 12px; margin-bottom: 20px; overflow: hidden; }
    .progress-fill { background: linear-gradient(90deg, #4CAF50, #8BC34A); height: 100%; transition: width 0.3s; }
    .progress-text { text-align: center; margin-bottom: 8px; font-size: 14px; color: #666; }
    .section { background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .section h2 { font-size: 16px; color: #333; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
    .item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f5f5f5; }
    .item:last-child { border-bottom: none; }
    .item input[type="checkbox"] { margin-top: 3px; width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; }
    .item-content { flex: 1; }
    .item-id { font-weight: 600; color: #666; font-size: 12px; margin-right: 6px; }
    .item-name { font-weight: 500; color: #333; }
    .item-steps { color: #666; font-size: 13px; margin-top: 2px; }
    .item-expected { color: #888; font-size: 12px; margin-top: 2px; font-style: italic; }
    .item.passed .item-name { color: #4CAF50; }
    .item.failed .item-name { color: #f44336; text-decoration: line-through; }
    .summary { text-align: center; padding: 16px; background: white; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .summary .pass-rate { font-size: 36px; font-weight: bold; color: #4CAF50; }
    .summary .pass-rate.fail { color: #f44336; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 PinWall 手动测试报告</h1>
    <p class="meta">版本 ${version} | 生成时间: ${new Date().toISOString().slice(0, 10)}</p>

    <div class="summary">
      <div class="pass-rate" id="passRate">--</div>
      <div id="passCount">点击复选框开始测试</div>
    </div>

    <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width: 0%"></div></div>
    <div class="progress-text" id="progressText">0 / 0 通过</div>

    <div class="toolbar">
      <button class="btn-save" onclick="saveResults()">💾 保存结果</button>
      <button class="btn-export" onclick="exportMarkdown()">📄 导出 Markdown</button>
      <button class="btn-reset" onclick="resetResults()">🔄 重置</button>
    </div>

    <div id="sections"></div>
  </div>

  <script>
    const testData = ${JSON.stringify(sections, null, 2)};

    function render() {
      const container = document.getElementById('sections');
      container.innerHTML = testData.map((section, si) => \`
        <div class="section">
          <h2>Section \${si + 1}: \${section.name}</h2>
          \${section.items.map((item, ii) => {
            const key = \`\${si}-\${ii}\`;
            const checked = localStorage.getItem('pw-\${key}') === 'true';
            return \`
              <div class="item \${checked ? 'passed' : ''}" id="item-\${key}">
                <input type="checkbox" \${checked ? 'checked' : ''} onchange="toggle('\${key}', this.checked)">
                <div class="item-content">
                  <span class="item-id">\${item.id}</span>
                  <span class="item-name">\${item.name}</span>
                  <div class="item-steps">步骤: \${item.steps}</div>
                  <div class="item-expected">预期: \${item.expected}</div>
                </div>
              </div>
            \`;
          }).join('')}
        </div>
      \`).join('');
      updateProgress();
    }

    function toggle(key, checked) {
      localStorage.setItem('pw-\${key}', checked);
      const el = document.getElementById('item-\${key}');
      el.className = 'item ' + (checked ? 'passed' : '');
      updateProgress();
    }

    function updateProgress() {
      let total = 0, passed = 0;
      testData.forEach((section, si) => {
        section.items.forEach((item, ii) => {
          total++;
          if (localStorage.getItem(\`\${si}-\${ii}\`) === 'true') passed++;
        });
      });
      const pct = total > 0 ? Math.round(passed / total * 100) : 0;
      document.getElementById('passRate').textContent = pct + '%';
      document.getElementById('passRate').className = 'pass-rate' + (pct < 100 ? ' fail' : '');
      document.getElementById('passCount').textContent = \`\${passed} / \${total} 通过\`;
      document.getElementById('progressFill').style.width = pct + '%';
      document.getElementById('progressText').textContent = \`\${passed} / \${total} 通过\`;
    }

    function saveResults() {
      const results = {};
      testData.forEach((section, si) => {
        section.items.forEach((item, ii) => {
          results[\`\${si}-\${ii}\`] = localStorage.getItem(\`\${si}-\${ii}\`) === 'true';
        });
      });
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pinwall-test-results.json';
      a.click();
    }

    function exportMarkdown() {
      let md = '# PinWall 手动测试报告\\n\\n';
      let total = 0, passed = 0;
      testData.forEach(section => {
        md += '## ' + section.name + '\\n\\n';
        section.items.forEach(item => {
          total++;
          const key = testData.indexOf(section) + '-' + section.items.indexOf(item);
          const isPassed = localStorage.getItem(key) === 'true';
          if (isPassed) passed++;
          md += '- [' + (isPassed ? 'x' : ' ') + '] ' + item.id + ' ' + item.name + '\\n';
        });
      });
      md += '\\n通过率: ' + Math.round(passed / total * 100) + '% (' + passed + '/' + total + ')\\n';
      const blob = new Blob([md], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pinwall-test-report.md';
      a.click();
    }

    function resetResults() {
      if (confirm('确定要重置所有测试结果吗？')) {
        localStorage.clear();
        render();
      }
    }

    render();
  </script>
</body>
</html>`;

// Ensure output directory exists
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
console.log(`✅ 手动测试报告已生成: ${OUTPUT_FILE}`);
console.log(`   在浏览器中打开以开始测试。`);
