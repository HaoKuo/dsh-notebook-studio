import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { pythonExecutable } from '../src/ingest.js'

// git/npm 安装不带 .venv，解释器解析必须能回退并在都不可用时给出可操作错误。
test('Python 解释器按包内 .venv 回退，并在显式指定不可用时明确报错', async () => {
  const previous = process.env.STUDIO_PYTHON
  try {
    delete process.env.STUDIO_PYTHON
    assert.equal(await pythonExecutable(), join(process.cwd(), '.venv', 'bin', 'python'))

    process.env.STUDIO_PYTHON = join(process.cwd(), '.venv', 'bin', 'does-not-exist')
    await assert.rejects(pythonExecutable, /STUDIO_PYTHON 指向的解释器不可用/)
  } finally {
    if (previous === undefined) delete process.env.STUDIO_PYTHON
    else process.env.STUDIO_PYTHON = previous
  }
})
