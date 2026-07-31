import { useAppStore } from '@/store/useAppStore'
import { AiTool } from '@/types/ai'
import { generateStatusReportMarkdown } from '@/utils/statusReportMarkdown'

export const generateStatusReportMarkdownTool: AiTool = {
  name: 'generate_status_report_markdown',
  description: 'Gera um status report de um projeto em formato Markdown (texto), pronto pra ser exibido direto na conversa.',
  input_schema: {
    type: 'object',
    properties: { projectId: { type: 'string', description: 'Id do projeto (obtido via find_project)' } },
    required: ['projectId'],
  },
  isWrite: false,
  async execute(input) {
    const { projects, settings } = useAppStore.getState()
    const project = projects.find((p) => p.id === input.projectId)
    if (!project) return { error: 'Projeto não encontrado.' }
    return { markdown: generateStatusReportMarkdown(project, settings) }
  },
}
