import { expect, test } from '@playwright/test'

test('completes first-run setup after a real connection check', async ({ page }) => {
  await page.goto('/?onboarding=1')

  await page.getByRole('button', { name: '开始设置' }).click()
  await page.getByLabel('你的名字').fill('小航')
  await page.getByLabel('希望她怎么称呼你').fill('阿航')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel('API Key').fill('test-onboarding-key')
  await page.getByRole('button', { name: '测试连接' }).click()

  await expect(page.getByRole('status')).toContainText('连接成功')
  await page.getByRole('button', { name: '进入灵伴' }).click()
  await expect(page.getByPlaceholder('输入消息...')).toBeVisible()
})

test('stores API credentials without exposing the saved value', async ({ page }) => {
  await page.goto('/')

  await page.getByTitle('设置').click()
  const apiKeyInput = page.getByPlaceholder('sk-...')
  await apiKeyInput.fill('test-secret-key')
  await page.getByTitle('保存 API Key').click()

  await expect(page.getByPlaceholder('已安全保存')).toHaveValue('')
  await expect(page.getByTitle('移除 API Key')).toBeVisible()
})

test('closes settings with Escape and restores focus', async ({ page }) => {
  await page.goto('/')

  const settingsButton = page.getByTitle('设置')
  await settingsButton.click()
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(page.getByRole('dialog', { name: '设置' })).toBeHidden()
  await expect(settingsButton).toBeFocused()
})

test('sends a message and completes the streamed reply', async ({ page }) => {
  await page.goto('/')

  await page.getByTitle('设置').click()
  await page.getByPlaceholder('sk-...').fill('test-secret-key')
  await page.getByTitle('保存 API Key').click()
  await page.locator('.settings-header').getByRole('button').click()

  await page.getByPlaceholder('输入消息...').fill('测试消息')
  await page.getByPlaceholder('输入消息...').press('Enter')

  await expect(page.locator('.user-bubble').last()).toContainText('测试消息')
  await expect(page.locator('.ai-bubble').last()).toContainText('这是来自测试模型的回复')
})

test('creates a second persona from the always-visible manager', async ({ page }) => {
  await page.goto('/')

  await page.getByTitle('管理角色').click()
  await page.getByRole('button', { name: '新建角色' }).click()
  await page.locator('.form-group').filter({ hasText: '名字' }).locator('input').fill('小雨')
  await page.getByRole('button', { name: '保存' }).click()
  await page.locator('.persona-header').getByRole('button').click()

  await expect(page.locator('.header-name')).toContainText('小雨')
})

test('updates a persona avatar and keeps save button clickable', async ({ page }) => {
  await page.goto('/')

  await page.getByTitle('编辑角色').click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAHxcCBAuYWAQAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.locator('.avatar-preview img')).toHaveAttribute('src', /^data:image\/jpeg/)
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.locator('.persona-panel')).toBeHidden()
  await expect(page.locator('.avatar-img-header')).toHaveAttribute('src', /^data:image\/jpeg/)
})

test('loads an old search result before scrolling to it', async ({ page }) => {
  await page.goto('/')

  await page.getByTitle(/搜索/).click()
  await page.getByPlaceholder('搜索消息...').fill('电影')
  await page.locator('.search-result-item').click()

  await expect(page.locator('[data-message-id="old-message"]')).toContainText('记得那场电影吗')
})

test('exports the complete conversation from SQLite', async ({ page }) => {
  await page.goto('/')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTitle(/导出/).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^soulmate-chat-\d+\.md$/)
})

test('exports a complete portable backup from data settings', async ({ page }) => {
  await page.goto('/')

  await page.getByTitle('设置').click()
  await page.getByRole('tab', { name: '数据' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出完整备份' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^soulmate-backup-.*\.json$/)
  await expect(page.getByRole('status')).toContainText('完整备份已导出')
})

test('enables the optional app lock from data settings', async ({ page }) => {
  await page.goto('/')

  await page.getByTitle('设置').click()
  await page.getByRole('tab', { name: '数据' }).click()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByLabel('确认 PIN').fill('1234')
  await page.getByRole('button', { name: '启用应用锁' }).click()

  await expect(page.getByRole('status')).toContainText('应用锁已启用')
  await expect(page.getByRole('button', { name: '关闭应用锁' })).toBeVisible()
})

test('adds and removes a user-controlled memory', async ({ page }) => {
  await page.goto('/')

  await page.getByTitle('设置').click()
  await page.getByRole('tab', { name: '记忆' }).click()
  await page.getByPlaceholder('手动添加一条可靠记忆').fill('用户喜欢爵士乐')
  await page.getByTitle('添加记忆').click()

  await expect(page.locator('.memory-item')).toContainText('用户喜欢爵士乐')
  await page.getByTitle('删除记忆').click()
  await expect(page.locator('.memory-item')).toHaveCount(0)
})
