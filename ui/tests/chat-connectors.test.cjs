const { test } = require('node:test');
const assert = require('node:assert/strict');

for (const locale of ['en', 'tr']) {
  test(`${locale} chat connector instructions render mentions and provider names`, async () => {
    const { t } = await import('../src/locales/index.ts');
    const instructions = t('chatgptConnector.instructions', undefined, locale);
    assert.ok(instructions.includes('@'));
    assert.ok(instructions.includes('DCR'));
    assert.ok(!instructions.includes("{'@'}"));
    for (const app of ['ChatGPT', 'Claude']) {
      for (const key of ['chatPromptCopied', 'chatPromptReady', 'chatPromptLabel', 'chatPromptHint', 'openChatApp']) {
        const rendered = t(`calendarPlan.${key}`, { app }, locale);
        assert.ok(rendered.includes(app), `${key} should name ${app}`);
        assert.ok(!rendered.includes('{app}'));
      }
    }
  });
}
