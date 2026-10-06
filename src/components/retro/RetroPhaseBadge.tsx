import { useTranslation } from 'react-i18next'
import { RetroPhase } from '@/types/retro'
import { RETRO_PHASE_STYLE } from '@/utils/retro'

export default function RetroPhaseBadge({ phase }: { phase: RetroPhase }) {
  const { t } = useTranslation()
  return (
    <span
      className="inline-block whitespace-nowrap text-[11px] font-[500] px-2 py-[2px]"
      style={{ ...RETRO_PHASE_STYLE[phase], borderRadius: 'var(--radius-pill)' }}
    >
      {t(`retro.phase_${phase}`)}
    </span>
  )
}
