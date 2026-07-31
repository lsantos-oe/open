import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Project } from '@/types'
import OpenPointsTab from './diary/OpenPointsTab'
import MeetingsTab from './diary/MeetingsTab'
import HistoryTab from './diary/HistoryTab'
import DelayLogPage from '../DelayLogPage'

type DiarySubTab = 'openPoints' | 'meetings' | 'delayLog' | 'history'

interface Props {
  project: Project
}

export default function DiaryTab({ project }: Props) {
  const { t } = useTranslation()
  const [sub, setSub] = useState<DiarySubTab>('openPoints')

  const openPoints = project.openPoints ?? []
  const meetings = project.meetings ?? []
  const history = project.history ?? []

  const openCount = openPoints.filter((op) => op.status === 'open').length

  const delayCount = project.delayLog.length

  const tabs: { id: DiarySubTab; label: string; count?: number }[] = [
    { id: 'openPoints', label: t('diary.tabOpenPoints'), count: openCount || undefined },
    { id: 'meetings', label: t('diary.tabMeetings'), count: meetings.length || undefined },
    { id: 'delayLog', label: t('tabs.delayLog'), count: delayCount || undefined },
    { id: 'history', label: t('diary.tabHistory'), count: history.length || undefined },
  ]

  return (
    <div className="p-6">
      {/* Sub-tab bar */}
      <div
        className="flex gap-0 mb-6 border-b"
        style={{ borderColor: 'var(--border-default)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSub(tab.id)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderBottomColor: sub === tab.id ? 'var(--oe-primary)' : 'transparent',
              color: sub === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              marginBottom: -1,
            }}
            onMouseEnter={e => { if (sub !== tab.id) (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { if (sub !== tab.id) (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-[var(--radius-pill)]"
                style={{ background: 'var(--surface-subtle)', color: 'var(--text-tertiary)' }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {sub === 'openPoints' && (
        <OpenPointsTab
          scope={{ type: 'project', id: project.id }}
          openPoints={openPoints}
          phases={project.phases}
        />
      )}
      {sub === 'meetings' && (
        <MeetingsTab
          projectId={project.id}
          meetings={meetings}
          phases={project.phases}
          teamMembers={project.team}
        />
      )}
      {sub === 'delayLog' && (
        <DelayLogPage projectId={project.id} />
      )}
      {sub === 'history' && (
        <HistoryTab
          scope={{ type: 'project', id: project.id }}
          history={history}
        />
      )}
    </div>
  )
}
