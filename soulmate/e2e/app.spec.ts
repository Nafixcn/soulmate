import { expect, test } from '@playwright/test'

async function configureChat(page: import('@playwright/test').Page) {
  await page.getByTitle('设置').click()
  await page.getByLabel('API Key', { exact: true }).fill('test-secret-key')
  await page.getByTitle('保存 API Key').click()
  await expect(page.getByPlaceholder('已安全保存')).toBeVisible()
  await page.getByLabel('关闭设置').click()
}

test('confirms Chinese composition without sending the unfinished draft', async ({ page }) => {
  await page.goto('/')
  await configureChat(page)
  const input = page.getByLabel('消息内容')
  await input.fill('还在选字')
  await input.dispatchEvent('compositionstart')
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await expect(input).toHaveValue('还在选字')
  await expect(page.locator('.user-bubble')).toHaveCount(0)

  // WebKit can end composition before dispatching the confirming Enter.
  await input.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }))
  })
  await expect(input).toHaveValue('还在选字')
  await expect(page.locator('.user-bubble')).toHaveCount(0)
  // The next intentional Enter occurs after the candidate-confirmation frame.
  await input.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await input.press('Enter')
  await expect(page.locator('.user-bubble')).toHaveText('还在选字')
})

test('keeps the line breaks entered with Shift+Enter in a sent message', async ({ page }) => {
  await page.goto('/')
  await configureChat(page)
  const input = page.getByLabel('消息内容')
  await input.fill('第一行')
  await input.press('Shift+Enter')
  await input.press('Shift+Enter')
  await input.pressSequentially('第二行')
  await input.press('Enter')
  await expect(page.locator('.user-bubble')).toBeVisible()
  expect(await page.locator('.user-bubble').innerText()).toBe('第一行\n\n第二行')
})

test('applies dark and custom theme colors to the actual conversation surfaces', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('设置').click()
  await page.getByRole('tab', { name: '主题' }).click()
  await page.getByLabel('预设主题').selectOption({ label: '暗夜' })
  await expect(page.getByLabel('预设主题')).toHaveCSS('color', 'rgb(232, 216, 224)')
  await expect(page.getByLabel('左上角应用标志')).toHaveCSS('color', 'rgb(232, 216, 224)')
  await expect(page.locator('.settings-eyebrow')).toHaveCSS('color', 'rgb(160, 144, 152)')
  await page.getByLabel('关闭设置').click()
  await expect(page.locator('.chat-window')).toHaveCSS('background-color', 'rgb(26, 20, 24)')
  await expect(page.locator('.chat-body')).toHaveCSS('background-color', 'rgb(34, 26, 30)')

  await page.getByTitle('设置').click()
  await page.getByRole('tab', { name: '主题' }).click()
  await page.getByLabel('预设主题').selectOption({ label: '自定义' })
  await page.getByLabel('背景色', { exact: true }).fill('#123456')
  await page.getByLabel('聊天区背景').fill('#234567')
  await page.getByLabel('用户气泡', { exact: true }).fill('#345678')
  await page.getByLabel('AI 气泡', { exact: true }).fill('#456789')
  await page.getByLabel('关闭设置').click()
  await expect(page.locator('.chat-window')).toHaveCSS('background-color', 'rgb(18, 52, 86)')
  await expect(page.locator('.chat-body')).toHaveCSS('background-color', 'rgb(35, 69, 103)')
  await configureChat(page)
  await page.getByLabel('消息内容').fill('颜色验证')
  await page.getByLabel('消息内容').press('Enter')
  await expect(page.locator('.user-bubble')).toHaveCSS('background-color', 'rgb(52, 86, 120)')
  await expect(page.locator('.ai-bubble').last()).toHaveCSS('background-color', 'rgb(69, 103, 137)')
})

test('lets a reader stay above the latest message during a streamed reply', async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 820 })
  await page.goto('/?history=long&stream=slow')
  await configureChat(page)
  await expect
    .poll(() =>
      page
        .locator('.chat-messages')
        .evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
    )
    .toBeLessThan(100)
  await page.getByLabel('消息内容').fill('慢慢回复')
  await page.getByLabel('消息内容').press('Enter')
  await expect(page.locator('.streaming-markdown')).toContainText('第 1 段')
  const scrollPosition = await page.locator('.chat-messages').evaluate((element) => {
    element.scrollTop = 200
    return element.scrollTop
  })
  await expect(page.getByRole('button', { name: '回到最新消息' })).toBeVisible()
  await expect.poll(() => page.locator('.streaming-markdown').innerText()).toContain('第 8 段')
  expect(await page.locator('.chat-messages').evaluate((element) => element.scrollTop)).toBeCloseTo(scrollPosition, 0)
  await page.getByRole('button', { name: '回到最新消息' }).click()
  await expect(page.getByRole('button', { name: '回到最新消息' })).toBeHidden()
  await expect(page.locator('.streaming-markdown')).toContainText('第 12 段')
  await expect
    .poll(() =>
      page
        .locator('.chat-messages')
        .evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
    )
    .toBeLessThan(100)
})

test('uses immediate scrolling when reduced motion is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (options) {
      if (typeof options === 'object') this.setAttribute('data-scroll-behavior', options.behavior || 'auto')
      original.call(this, options)
    }
  })
  await page.goto('/')
  await configureChat(page)
  await page.getByLabel('消息内容').fill('减少动态效果')
  await page.getByLabel('消息内容').press('Enter')
  await expect(page.locator('.ai-bubble').last()).toBeVisible()
  await page.getByTitle(/搜索/).click()
  await page.getByRole('textbox', { name: '搜索聊天消息', exact: true }).fill('电影')
  await page.locator('.search-result-item').click()
  await expect(page.locator('[data-message-id="old-message"]')).toHaveAttribute('data-scroll-behavior', 'auto')
  await expect(page.locator('[data-scroll-behavior="smooth"]')).toHaveCount(0)
})

test('makes first-run form actions reachable by scrolling a short window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto('/?onboarding=1')
  await page.getByRole('button', { name: '开始设置' }).click()
  await page.getByLabel('你的名字').fill('小航')
  await page.getByLabel('希望她怎么称呼你').fill('阿航')
  await page.locator('.onboarding-shell').hover({ position: { x: 350, y: 150 } })
  await page.mouse.wheel(0, 1000)
  await expect(page.getByRole('button', { name: '下一步' })).toBeInViewport()
})

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

test('restores the draft when saving a user message fails', async ({ page }) => {
  await page.goto('/?fail-save=1')
  await page.getByTitle('设置').click()
  await page.getByPlaceholder('sk-...').fill('test-secret-key')
  await page.getByTitle('保存 API Key').click()
  await page.locator('.settings-header').getByRole('button').click()

  const input = page.getByPlaceholder('输入消息...')
  await input.fill('请保留这条消息')
  await input.press('Enter')

  await expect(page.getByRole('button', { name: /关闭错误提示：消息保存失败，请重试/ })).toBeVisible()
  await expect(input).toHaveValue('请保留这条消息')
  await expect(page.locator('.user-bubble')).toHaveCount(0)
})

test('regenerates into a preserved reply candidate and switches versions', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('设置').click()
  await page.getByPlaceholder('sk-...').fill('test-secret-key')
  await page.getByTitle('保存 API Key').click()
  await page.locator('.settings-header').getByRole('button').click()
  await page.getByPlaceholder('输入消息...').fill('给我两个回答')
  await page.getByPlaceholder('输入消息...').press('Enter')
  await expect(page.locator('.ai-bubble').last()).toContainText('这是来自测试模型的回复')

  await page.getByRole('button', { name: '生成另一个回复' }).last().click()
  await expect(page.locator('.ai-bubble').last()).toContainText('这是另一个保留的回复')
  await expect(page.locator('.alternative-switcher')).toContainText('2/2')
  await page.getByRole('button', { name: '上一个回复' }).click()
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

test('imports a Character Card V2 with lorebook metadata', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('管理角色').click()
  await page.locator('.persona-library-actions input[type="file"]').setInputFiles({
    name: 'xiaolan.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
          name: '小岚',
          description: '住在海边的插画师',
          personality: '安静温柔',
          scenario: '雨天咖啡馆',
          first_mes: '你来啦。',
          mes_example: '',
          system_prompt: '',
          creator: '测试作者',
          tags: ['治愈'],
          character_book: {
            entries: [{ keys: ['灯塔'], content: '灯塔每天傍晚亮起。', enabled: true, comment: '灯塔' }],
          },
        },
      }),
    ),
  })

  await expect(page.locator('.persona-list-name').last()).toHaveText('小岚')
  await page.getByRole('button', { name: '编辑角色 小岚' }).click()
  await expect(page.getByLabel('角色描述 / 背景故事')).toHaveValue('住在海边的插画师')
  await expect(page.getByLabel('条目内容')).toHaveValue('灯塔每天傍晚亮起。')
})

test('discovers models from a local Ollama service', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('设置').click()
  await page.getByLabel('API 服务商').selectOption({ label: 'Ollama（本地）' })
  await page.getByRole('button', { name: '发现本地模型' }).click()

  await expect(page.getByLabel('模型')).toHaveValue('qwen3:8b')
  await expect(page.getByRole('status')).toContainText('已发现 2 个本地模型')
  await expect(page.getByLabel('API Key')).toHaveCount(0)
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
  await expect(page.getByRole('status')).toContainText('明文备份已导出')
})

test('exports a password-encrypted portable backup', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('设置').click()
  await page.getByRole('tab', { name: '数据' }).click()
  await page.getByLabel('备份密码（建议设置）').fill('test-backup-password')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出完整备份' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.encrypted\.json$/)
  await expect(page.getByRole('status')).toContainText('加密备份已导出')
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

test('corrects and pauses a memory', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('设置').click()
  await page.getByRole('tab', { name: '记忆' }).click()
  await page.getByPlaceholder('手动添加一条可靠记忆').fill('用户喜欢爵士乐')
  await page.getByTitle('添加记忆').click()

  await page.getByRole('button', { name: '修正记忆' }).click()
  await page.getByRole('textbox', { name: '修正记忆内容' }).fill('用户喜欢古典乐')
  await page.getByRole('button', { name: '保存记忆修正' }).click()
  await expect(page.locator('.memory-item')).toContainText('用户喜欢古典乐')

  await page.getByRole('button', { name: '停用记忆' }).click()
  await expect(page.locator('.memory-item')).toContainText('已停用')
  await page.getByRole('button', { name: '恢复使用记忆' }).click()
  await expect(page.locator('.memory-item')).not.toContainText('已停用')
})

test('migrates a retired saved model before displaying and sending it', async ({ page }) => {
  await page.goto('/?legacy-model=1')

  await expect(page.getByTitle('deepseek-flash')).toBeVisible()
  await page.getByTitle('设置').click()
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('deepseek-flash')
  await expect(page.getByLabel('模型', { exact: true }).locator('option')).toHaveText([
    'DeepSeek V4.1 Flash (deepseek-flash)',
    'deepseek-v4-pro',
  ])
})

test('keeps the compact sidebar within its rail at medium window widths', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 720 })
  await page.goto('/')

  await expect(page.locator('.header-info')).toBeHidden()
  expect(await page.locator('.chat-header').evaluate((sidebar) => sidebar.scrollWidth <= sidebar.clientWidth)).toBe(
    true,
  )

  await page.setViewportSize({ width: 1200, height: 720 })
  await expect(page.locator('.header-info')).toBeVisible()
})

test('keeps compact header icons and avatar fitted at narrow widths', async ({ page }) => {
  await page.goto('/')
  for (const width of [520, 390]) {
    await page.setViewportSize({ width, height: 720 })
    await expect(page.locator('.sidebar-section-label')).toBeHidden()
    expect(await page.locator('.chat-header').evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(true)
    const iconWidths = await page
      .locator('.header-actions svg')
      .evaluateAll((icons) => icons.map((icon) => icon.getBoundingClientRect().width))
    expect(iconWidths).toHaveLength(3)
    expect(iconWidths.every((iconWidth) => iconWidth >= 18)).toBe(true)
    await expect(page.locator('.header-profile > .avatar')).toHaveCSS('width', '42px')
  }
})

test('customizes relationship stages, character icon, and sidebar mark', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('编辑角色').click()

  await page.getByLabel('朋友阶段名称').fill('知己')
  await page.getByLabel('朋友阶段图标').fill('🤝')
  await page.getByRole('button', { name: '设为当前阶段：知己' }).click()
  await page.getByLabel('自定义角色图标').fill('🦊')
  await page.getByRole('button', { name: '保存', exact: true }).click()

  await expect(page.locator('.header-profile')).toContainText('🤝 知己')
  await expect(page.locator('.avatar-emoji')).toHaveText('🦊')
  await expect(page.locator('.msg-avatar').first()).toContainText('🦊')

  await page.getByTitle('设置').click()
  await page.getByRole('tab', { name: '主题' }).click()
  await page.getByLabel('左上角应用标志').fill('🪐')
  await expect(page.locator('.sidebar-brand-mark').first()).toHaveText('🪐')
})
