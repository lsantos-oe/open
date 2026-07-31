import { AiTool } from '@/types/ai'
import { findProjectTool, getProjectOverviewTool, listProjectsTool, createProjectTool, updateEntityStatusTool } from './projectsTools'
import { findClientTool } from './clientsTools'
import { findIncidentTool, listIncidentsTool, createIncidentTool } from './incidentsTools'
import { findUserTool, bulkReassignProjectsTool } from './usersTools'
import { createTaskTool } from './tasksTools'
import { generateStatusReportMarkdownTool } from './reportTools'
import { proposeExtractedItemsTool } from './extractionTools'

export const ALL_TOOLS: AiTool[] = [
  findProjectTool,
  getProjectOverviewTool,
  listProjectsTool,
  createProjectTool,
  updateEntityStatusTool,
  findClientTool,
  findIncidentTool,
  listIncidentsTool,
  createIncidentTool,
  findUserTool,
  bulkReassignProjectsTool,
  createTaskTool,
  generateStatusReportMarkdownTool,
  proposeExtractedItemsTool,
]

export const TOOLS_BY_NAME: Record<string, AiTool> = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t]))
