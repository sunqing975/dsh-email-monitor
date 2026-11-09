import { isAbsolute } from 'node:path'
import type { EmailRuntime } from './runtime.js'
import type { EmailConfig } from './config.js'
import { incomingMailbox } from './incoming-monitor.js'

/** Shared settings operation, preserving unrelated account and credential fields. */
export function monitorControls(ctx: any, runtime: EmailRuntime, config: EmailConfig) {
  const get = () => ({ enabled: config.incomingMonitorEnabled === true,
    account: config.incomingMonitorAccount || '', folder: config.incomingMonitorFolder || 'INBOX',
    pollSeconds: config.incomingMonitorPollSeconds ?? 60, cwd: config.incomingMonitorCwd || '' })
  return async (body: Record<string, unknown>): Promise<unknown> => {
    if (body.action === 'monitorGet') return get()
    if (typeof body.enabled !== 'boolean' || !Number.isInteger(body.pollSeconds) || Number(body.pollSeconds) < 30 || Number(body.pollSeconds) > 3600) throw new Error('检查间隔必须为 30–3600 秒 / Interval must be 30–3600 seconds')
    const account = String(body.account || ''), folder = String(body.folder || 'INBOX'), cwd = String(body.cwd || '')
    if (account.length > 256 || folder.length > 1024 || cwd.length > 4096 || /[\r\n\0]/.test(account + folder + cwd) || (cwd && !isAbsolute(cwd))) throw new Error('账号、文件夹或工作目录无效；目录须为绝对路径 / Invalid account, folder or absolute working directory')
    if (body.enabled) incomingMailbox(runtime, account, folder)
    const editor = ctx.configEditor
    const entry = editor?.entries().find((row: any) => row.id === 'include:tool-email')
    if (!entry) throw new Error('监听设置暂不可写 / Monitor settings are not writable')
    await editor.edit(entry, (raw: Record<string, unknown>) => ({ ...raw,
      incomingMonitorEnabled: body.enabled, incomingMonitorAccount: account, incomingMonitorFolder: folder,
      incomingMonitorPollSeconds: body.pollSeconds, incomingMonitorCwd: cwd,
    }))
    return { enabled: body.enabled, account, folder, pollSeconds: body.pollSeconds, cwd }
  }
}
