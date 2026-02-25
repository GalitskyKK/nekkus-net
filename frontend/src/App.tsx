import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Cable,
  Calendar,
  ChevronDown,
  Download,
  Gauge,
  ListPlus,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Wifi,
} from 'lucide-react'
import {
  AddModulePlaceholder,
  AppShell,
  Button,
  Card,
  Input,
  PageLayout,
  Pill,
  Section,
  Select,
  StatusDot,
} from '@nekkus/ui-kit'
import {
  addSubscription,
  connectVPN,
  deleteSubscription,
  disconnectVPN,
  fetchConfigs,
  fetchLogs,
  fetchSiteCheck,
  fetchSingBoxStatus,
  fetchSettings,
  fetchServers,
  fetchStatus,
  fetchSubscriptions,
  installSingBox,
  refreshSubscription,
  resetSettings,
  updateSettings,
} from './api'
import type {
  SingBoxStatus,
  SiteCheckResult,
  Subscription,
  VpnConfig,
  VpnSettings,
  VpnStatus,
} from './types'

const statusRefreshMs = 2000

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

function formatExpiresAt(ts?: number): string {
  if (ts == null || ts <= 0) return ''
  try {
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

const SITE_CHECK_SITES = [
  { name: 'ChatGPT', url: 'https://chat.openai.com' },
  { name: 'Gemini', url: 'https://gemini.google.com' },
  { name: 'Claude', url: 'https://claude.ai' },
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Netflix', url: 'https://www.netflix.com' },
] as const

function App() {
  const [status, setStatus] = useState<VpnStatus | null>(null)
  const [configs, setConfigs] = useState<VpnConfig[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [settings, setSettings] = useState<VpnSettings | null>(null)
  const [singBoxStatus, setSingBoxStatus] = useState<SingBoxStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const [subscriptionName, setSubscriptionName] = useState('')
  const [subscriptionUrl, setSubscriptionUrl] = useState('')
  const [connectServer, setConnectServer] = useState('')
  const [availableServers, setAvailableServers] = useState<string[]>([])
  const [selectedServer, setSelectedServer] = useState('')
  const [preferredServer, setPreferredServer] = useState('')
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  const subscriptionsSectionRef = useRef<HTMLDivElement>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [logsVisible, setLogsVisible] = useState(false)
  const [siteCheckResults, setSiteCheckResults] = useState<Record<string, SiteCheckResult>>({})
  const [siteCheckLoading, setSiteCheckLoading] = useState<string | null>(null)

  const defaultConfigId = settings?.default_config_id ?? ''
  const activeSubscription = useMemo(
    () => subscriptions.find((s) => s.id === defaultConfigId),
    [subscriptions, defaultConfigId],
  )
  const activeConfig = useMemo(
    () => configs.find((c) => c.id === status?.activeConfigId),
    [configs, status?.activeConfigId],
  )

  const scrollToSubscriptions = useCallback(() => {
    subscriptionsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const loadAll = useCallback(async () => {
    try {
      setErrorMessage(null)
      const [nextStatus, nextConfigs, nextSubscriptions, nextSettings, nextSingBoxStatus] =
        await Promise.all([
          fetchStatus(),
          fetchConfigs(),
          fetchSubscriptions(),
          fetchSettings(),
          fetchSingBoxStatus(),
        ])
      setStatus(nextStatus)
      setConfigs(Array.isArray(nextConfigs) ? nextConfigs : [])
      setSubscriptions(Array.isArray(nextSubscriptions) ? nextSubscriptions : [])
      setSettings(nextSettings ?? {})
      setSingBoxStatus(nextSingBoxStatus ?? null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load data')
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      try {
        const nextStatus = await fetchStatus()
        setStatus(nextStatus)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh status')
      }
    }, statusRefreshMs)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!logsVisible) return
    let cancelled = false
    const loadLogs = async () => {
      try {
        const nextLogs = await fetchLogs()
        if (!cancelled) setLogs(nextLogs)
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить логи')
        }
      }
    }
    void loadLogs()
    const intervalId = window.setInterval(loadLogs, 2000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [logsVisible])

  useEffect(() => {
    if (!defaultConfigId) {
      setAvailableServers([])
      setSelectedServer('')
      return
    }
    let cancelled = false
    const loadServers = async () => {
      try {
        const servers = await fetchServers(defaultConfigId)
        if (!cancelled) {
          setAvailableServers(servers)
          if (preferredServer && servers.includes(preferredServer)) {
            setSelectedServer(preferredServer)
          } else {
            setSelectedServer(servers[0] ?? '')
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAvailableServers([])
          setSelectedServer('')
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить серверы')
        }
      }
    }
    void loadServers()
    return () => {
      cancelled = true
    }
  }, [defaultConfigId, preferredServer])

  useEffect(() => {
    if (defaultsApplied || !settings) return
    if (settings.default_server) {
      setPreferredServer(settings.default_server)
      if (!availableServers.length) {
        setConnectServer(settings.default_server)
      }
    }
    setDefaultsApplied(true)
  }, [availableServers.length, defaultsApplied, settings])

  const handleCreateSubscription = useCallback(async () => {
    if (!subscriptionName.trim() || !subscriptionUrl.trim()) {
      setErrorMessage('Укажи имя и URL подписки')
      return
    }
    try {
      setIsBusy(true)
      setErrorMessage(null)
      const created = await addSubscription({
        name: subscriptionName.trim(),
        url: subscriptionUrl.trim(),
      })
      setSubscriptions((prev) => [created, ...prev])
      await loadAll()
      setSubscriptionName('')
      setSubscriptionUrl('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось добавить подписку')
    } finally {
      setIsBusy(false)
    }
  }, [loadAll, subscriptionName, subscriptionUrl])

  const handleConnect = useCallback(async () => {
    if (!defaultConfigId && !connectServer.trim() && !selectedServer) {
      setErrorMessage('Сначала выберите подписку по умолчанию или укажите сервер')
      return
    }
    try {
      setIsBusy(true)
      setErrorMessage(null)
      const nextStatus = await connectVPN({
        config_id: defaultConfigId || undefined,
        server: selectedServer || connectServer.trim() || undefined,
      })
      setStatus(nextStatus)
      if (defaultConfigId) {
        const nextServer = selectedServer || connectServer.trim()
        const nextSettings = await updateSettings({
          default_config_id: defaultConfigId,
          default_server: nextServer,
        })
        setSettings(nextSettings)
        setPreferredServer(nextServer)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось подключиться')
    } finally {
      setIsBusy(false)
    }
  }, [defaultConfigId, connectServer, selectedServer])

  const handleInstallSingBox = useCallback(async () => {
    try {
      setIsBusy(true)
      setErrorMessage(null)
      const nextStatus = await installSingBox()
      setSingBoxStatus(nextStatus)
      await loadAll()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось установить sing-box')
    } finally {
      setIsBusy(false)
    }
  }, [loadAll])

  const handleDisconnect = useCallback(async () => {
    try {
      setIsBusy(true)
      setErrorMessage(null)
      const nextStatus = await disconnectVPN()
      setStatus(nextStatus)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось отключиться')
    } finally {
      setIsBusy(false)
    }
  }, [])

  const handleDeleteSubscription = useCallback(
    async (id: string) => {
      if (!window.confirm('Удалить подписку? Конфиг, созданный из неё, тоже будет удалён.')) return
      try {
        setIsBusy(true)
        setErrorMessage(null)
        await deleteSubscription(id)
        await loadAll()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить подписку')
      } finally {
        setIsBusy(false)
      }
    },
    [loadAll],
  )

  const handleResetSettings = useCallback(async () => {
    if (
      !window.confirm(
        'Сбросить настройки (выбор конфига/сервера по умолчанию, путь к sing-box)? Подписки и трафик не затрагиваются.',
      )
    )
      return
    try {
      setIsBusy(true)
      setErrorMessage(null)
      await resetSettings()
      await loadAll()
      setDefaultsApplied(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сбросить настройки')
    } finally {
      setIsBusy(false)
    }
  }, [loadAll])

  const handleSiteCheckAll = useCallback(async () => {
    try {
      setSiteCheckLoading('all')
      const results = await fetchSiteCheck()
      const byUrl: Record<string, SiteCheckResult> = {}
      if (Array.isArray(results)) {
        for (const r of results) {
          byUrl[r.url] = r
        }
      }
      setSiteCheckResults(byUrl)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось проверить сайты')
    } finally {
      setSiteCheckLoading(null)
    }
  }, [])

  const handleSiteCheckOne = useCallback(async (name: string) => {
    try {
      setSiteCheckLoading(name)
      const results = await fetchSiteCheck({ name })
      setSiteCheckResults((prev) => {
        const next = { ...prev }
        if (Array.isArray(results) && results[0]) {
          next[results[0].url] = results[0]
        }
        return next
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Не удалось проверить ${name}`)
    } finally {
      setSiteCheckLoading(null)
    }
  }, [])

  const handleRefreshOneSubscription = useCallback(
    async (id: string) => {
      try {
        setIsBusy(true)
        setErrorMessage(null)
        await refreshSubscription(id)
        await loadAll()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить подписку')
      } finally {
        setIsBusy(false)
      }
    },
    [loadAll],
  )

  const handleSetDefaultSubscription = useCallback(
    async (sub: Subscription) => {
      const configId = sub.id
      try {
        setIsBusy(true)
        setErrorMessage(null)
        const nextSettings = await updateSettings({ default_config_id: configId })
        setSettings(nextSettings)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось установить подписку по умолчанию')
      } finally {
        setIsBusy(false)
      }
    },
    [],
  )

  const serverOptions = useMemo(
    () => availableServers.map((s) => ({ value: s, label: s })),
    [availableServers],
  )

  return (
    <PageLayout className="nekkus-glass-root">
      <div className="net">
        <AppShell
          logo="Nekkus"
          title="Net"
          description="VPN, конфиги и подписки."
          meta={
            <div className="net__status">
              <StatusDot
                status={status?.connected ? 'online' : 'offline'}
                label={status?.connected ? 'Подключено' : 'Отключено'}
                pulse={!!status?.connected}
              />
              <div className="net__status-meta">
                <span>Сервер: {status?.server || '—'}</span>
                <span>Конфиг: {activeConfig?.name || '—'}</span>
              </div>
            </div>
          }
        >
          {errorMessage ? (
          <div className="net__error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <Section title="Активная подписка">
          {subscriptions.length === 0 ? (
            <Card className="net__card nekkus-glass-card net__card--placeholder">
              <AddModulePlaceholder
                empty
                onClick={scrollToSubscriptions}
                disabled={isBusy}
              >
                Добавить подписку
              </AddModulePlaceholder>
            </Card>
          ) : !activeSubscription ? (
            <Card className="net__card nekkus-glass-card net__card--placeholder">
              <AddModulePlaceholder
                empty
                onClick={scrollToSubscriptions}
                disabled={isBusy}
              >
                Выберите подписку по умолчанию
              </AddModulePlaceholder>
            </Card>
          ) : (
            <Card className="net__card nekkus-glass-card net__card--profile" accentTop={!!status?.connected}>
              <div className="net__profile">
                <div className="net__profile-head">
                  <span className="net__profile-title">
                    <Wifi size={18} className="net__title-icon" aria-hidden />
                    {activeSubscription.name}
                  </span>
                  <Button variant="ghost" size="sm" onClick={scrollToSubscriptions}>
                    <ChevronDown size={16} className="net__btn-icon" aria-hidden />
                    Изменить
                  </Button>
                </div>
                <div className="net__profile-meta">
                  {activeSubscription.expires_at ? (
                    <span className="net__meta net__meta--row">
                      <Calendar size={14} aria-hidden />
                      Окончание: {formatExpiresAt(activeSubscription.expires_at)}
                    </span>
                  ) : null}
                </div>
                <div className="net__profile-stats">
                  <span className="net__stat">
                    <Download size={14} className="net__stat-icon" aria-hidden />
                    {formatSpeed(status?.downloadSpeed ?? 0)}
                  </span>
                  <span className="net__stat">
                    <Upload size={14} className="net__stat-icon" aria-hidden />
                    {formatSpeed(status?.uploadSpeed ?? 0)}
                  </span>
                  <span className="net__stat net__stat--muted">
                    <Gauge size={14} className="net__stat-icon" aria-hidden />
                    Сессия: ↓{formatBytes(status?.totalDownload ?? 0)} ↑{formatBytes(status?.totalUpload ?? 0)}
                  </span>
                  <span className="net__stat net__stat--muted">
                    Всего: ↓{formatBytes(status?.totalLifetimeDownload ?? 0)} ↑{formatBytes(status?.totalLifetimeUpload ?? 0)}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </Section>

        <Section title="Подключение">
          <Card className="net__card nekkus-glass-card">
            <div className="net__row">
              {availableServers.length > 0 ? (
                <Select
                  label="Сервер"
                  options={serverOptions}
                  value={selectedServer}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedServer(e.target.value)}
                  disabled={isBusy}
                />
              ) : (
                <Input
                  label="Сервер"
                  type="text"
                  value={connectServer}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConnectServer(e.target.value)}
                  placeholder="auto / custom"
                  disabled={isBusy}
                />
              )}
            </div>
            {!defaultConfigId && availableServers.length === 0 && (
              <p className="net__hint">Выберите подписку по умолчанию ниже, чтобы подключаться по списку серверов.</p>
            )}
            <div className="net__actions">
              <Button variant="primary" onClick={handleConnect} disabled={isBusy}>
                <Cable size={16} className="net__btn-icon" aria-hidden />
                Подключить
              </Button>
              <Button variant="secondary" onClick={handleDisconnect} disabled={isBusy}>
                Отключить
              </Button>
            </div>
          </Card>
        </Section>

        <Section title={`Подписки (${subscriptions.length})`}>
          <div ref={subscriptionsSectionRef}>
            <Card className="net__card nekkus-glass-card">
              <div className="net__row net__row--compact">
                <Input
                  label="Имя"
                  value={subscriptionName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubscriptionName(e.target.value)}
                  placeholder="MySubscription"
                  disabled={isBusy}
                />
                <Input
                  label="URL"
                  type="url"
                  value={subscriptionUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubscriptionUrl(e.target.value)}
                  placeholder="https://example.com/sub.txt"
                  disabled={isBusy}
                />
              </div>
              <Button variant="primary" onClick={handleCreateSubscription} disabled={isBusy}>
                <ListPlus size={16} className="net__btn-icon" aria-hidden />
                Добавить подписку
              </Button>
              <div className="net__list">
                {subscriptions.map((sub) => {
                  const isDefault = sub.id === defaultConfigId
                  return (
                    <div key={sub.id} className="net__list-item">
                      <div className="net__list-item-main">
                        <div className="net__list-title">{sub.name}</div>
                        <div className="net__meta">{sub.url}</div>
                        {sub.expires_at ? (
                          <div className="net__meta net__meta--muted">
                            Окончание: {formatExpiresAt(sub.expires_at)}
                          </div>
                        ) : null}
                      </div>
                      <div className="net__list-item-actions">
                        {isDefault ? (
                          <Pill variant="info">По умолчанию</Pill>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefaultSubscription(sub)}
                            disabled={isBusy}
                          >
                            Сделать по умолчанию
                          </Button>
                        )}
                        <Pill variant={sub.last_error ? 'error' : 'success'}>
                          {sub.last_error ? sub.last_error : 'OK'}
                        </Pill>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRefreshOneSubscription(sub.id)}
                          disabled={isBusy}
                          aria-label={`Обновить подписку ${sub.name}`}
                        >
                          <RefreshCw size={14} className="net__btn-icon" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSubscription(sub.id)}
                          disabled={isBusy}
                          aria-label={`Удалить подписку ${sub.name}`}
                        >
                          <Trash2 size={14} className="net__btn-icon" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        </Section>

        <Section title="Зависимости и настройки">
          <Card className="net__card nekkus-glass-card">
            <div className="net__row">
              <div className="net__field net__field--stretch">
                <span className="net__field-label">sing-box</span>
                <span className="net__meta">
                  {singBoxStatus?.installed
                    ? `OK${singBoxStatus.path ? `: ${singBoxStatus.path}` : ''}`
                    : 'Не установлен'}
                </span>
              </div>
              {!singBoxStatus?.installed ? (
                <Button variant="primary" onClick={handleInstallSingBox} disabled={isBusy}>
                  Установить
                </Button>
              ) : null}
              <Button variant="secondary" onClick={handleResetSettings} disabled={isBusy}>
                Сбросить настройки
              </Button>
            </div>
          </Card>
        </Section>

        <Section title="Доступность сайтов">
          <Card className="net__card nekkus-glass-card">
            <div className="net__site-check-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSiteCheckAll}
                disabled={siteCheckLoading !== null}
              >
                {siteCheckLoading === 'all' ? (
                  <Loader2 size={14} className="net__btn-icon net__spin" aria-hidden />
                ) : null}
                {siteCheckLoading === 'all' ? 'Проверка…' : 'Проверить все'}
              </Button>
              <div className="net__site-check-buttons">
                {SITE_CHECK_SITES.map((site) => (
                  <Button
                    key={site.url}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSiteCheckOne(site.name)}
                    disabled={siteCheckLoading !== null}
                    aria-label={`Проверить ${site.name}`}
                  >
                    {siteCheckLoading === site.name ? (
                      <Loader2 size={12} className="net__btn-icon net__spin" aria-hidden />
                    ) : null}
                    {site.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="net__site-check">
              {SITE_CHECK_SITES.map((site) => {
                const r = siteCheckResults[site.url]
                return (
                  <div key={site.url} className="net__site-check-item">
                    <StatusDot
                      status={r ? (r.ok ? 'online' : 'offline') : 'offline'}
                      label={site.name}
                    />
                    <span className="net__meta">
                      {r
                        ? r.ok
                          ? (r.latency_ms != null ? `${r.latency_ms} ms` : 'OK')
                          : r.error ?? '—'
                        : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        </Section>

        <Section title="Логи sing-box">
          <Card className="net__card nekkus-glass-card">
          <div className="net__header-actions">
            <Button variant="ghost" size="sm" onClick={() => setLogsVisible((v) => !v)}>
              {logsVisible ? 'Скрыть' : 'Показать'}
            </Button>
          </div>
          {logsVisible ? (
            <div className="net__logs">{logs.length ? logs.join('\n') : 'Нет логов (подключитесь к VPN, чтобы видеть вывод sing-box)'}</div>
          ) : (
            <div className="net__logs net__logs--hint">
              Логи появляются после подключения к VPN
            </div>
          )}
          </Card>
        </Section>
        </AppShell>
      </div>
      {import.meta.env.VITE_BUILD_ID ? (
        <div className="net__build-id" title="Версия сборки">
          Build: {import.meta.env.VITE_BUILD_ID}
        </div>
      ) : null}
    </PageLayout>
  )
}

export default App
