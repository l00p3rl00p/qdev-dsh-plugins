import { readFileSync } from 'node:fs'

export const PACKAGE_NAME = 'qdev-trajectory-drift-soup'
// The single source of the release number is package.json. Nothing else in the plugin states it.
export const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
export const SOURCE = 'https://github.com/l00p3rl00p/qdev-dsh-plugins/tree/main/plugins/qdev-soup-drift'
export const STATUS_PATH = '/qdev-soup-drift/status'
export const SESSION_SETTINGS_PATH = '/api/qdev-soup/session-settings'
export const SESSION_STATUS_PATH = '/api/qdev-soup/session-status'
