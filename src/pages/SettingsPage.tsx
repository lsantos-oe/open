import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { DateFormat, Workdays } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">{title}</h2>
      {description && <p className="text-xs text-gray-400 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  )
}

function ToggleGroup<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === opt.value
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const {
    settings, updateSettings, addHoliday, removeHoliday,
    archivedProjects, archivedProjectsLoaded, loadArchivedProjects, unarchiveProject,
  } = useAppStore()

  useEffect(() => { loadArchivedProjects() }, [])

  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')

  function handleAddHoliday() {
    if (!holidayDate) return
    addHoliday(holidayDate, holidayName.trim() || undefined)
    setHolidayDate('')
    setHolidayName('')
  }

  function changeLanguage(lang: 'pt' | 'en' | 'es') {
    i18n.changeLanguage(lang)
    updateSettings({ defaultLanguage: lang })
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">{t('nav.settings')}</h1>

      {/* Language */}
      <Section title="Idioma da interface">
        <ToggleGroup
          value={settings.defaultLanguage}
          onChange={changeLanguage}
          options={[
            { value: 'pt', label: '🇧🇷 Português' },
            { value: 'en', label: '🇺🇸 English' },
            { value: 'es', label: '🇪🇸 Español' },
          ]}
        />
      </Section>

      {/* Date format */}
      <Section title="Formato de data">
        <ToggleGroup<DateFormat>
          value={settings.dateFormat}
          onChange={(v) => updateSettings({ dateFormat: v })}
          options={[
            { value: 'DD/MM/YYYY', label: 'DD/MM/AAAA (ex: 22/04/2026)' },
            { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (ex: 04/22/2026)' },
          ]}
        />
      </Section>

      {/* Workdays */}
      <Section title="Dias úteis" description="Define quais dias são considerados dias úteis nos cálculos de prazo.">
        <ToggleGroup<Workdays>
          value={settings.workdays}
          onChange={(v) => updateSettings({ workdays: v })}
          options={[
            { value: 'mon-fri', label: 'Seg – Sex' },
            { value: 'mon-sat', label: 'Seg – Sáb' },
          ]}
        />
      </Section>

      {/* Holidays */}
      <Section title="Feriados" description="Datas excluídas do cálculo de dias úteis.">
        <div className="flex gap-2 mb-4 flex-wrap">
          <Input
            type="date"
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
            className="w-44"
          />
          <Input
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder="Nome (ex: Carnaval)"
            className="flex-1 min-w-[160px]"
            onKeyDown={(e) => e.key === 'Enter' && handleAddHoliday()}
          />
          <Button size="sm" onClick={handleAddHoliday} disabled={!holidayDate}>
            Adicionar
          </Button>
        </div>
        {settings.holidays.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum feriado cadastrado.</p>
        ) : (
          <div className="space-y-1.5">
            {settings.holidays.map((date) => {
              const name = settings.holidayNames[date]
              return (
                <div key={date} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-gray-600">
                      {date.split('-').reverse().join('/')}
                    </span>
                    {name && <span className="text-sm text-gray-700">{name}</span>}
                  </div>
                  <button onClick={() => removeHoliday(date)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Templates */}
      <Section title="Templates de projeto" description="Estrutura de fases e entradas usada ao criar novos projetos.">
        <div className="space-y-3">
          {settings.templates.map((tpl) => (
            <div key={tpl.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-800">{tpl.name}</p>
                <p className="text-xs text-gray-400">
                  {tpl.phases.length} fases · {tpl.phases.reduce((n, p) => n + p.entries.length, 0)} entradas
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/settings/templates/${tpl.id}`)}
              >
                Editar template
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* Archived projects */}
      <Section title="Projetos arquivados" description="Projetos ocultos do portfólio. Clique em Desarquivar para restaurá-los.">
        {!archivedProjectsLoaded ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : archivedProjects.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum projeto arquivado.</p>
        ) : (
          <div className="space-y-1.5">
            {archivedProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.client} · {p.pm}</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => unarchiveProject(p.id)}
                >
                  Desarquivar
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
